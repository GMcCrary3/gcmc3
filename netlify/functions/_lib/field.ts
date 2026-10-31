/**
 * The field — a participatory artwork. Visitors abstract their own concrete
 * and leave it for others. Shared server logic for the field's functions.
 *
 * Storage (Netlify Blobs, store "field"):
 *   new/<time>-<id>     Piece                         left, not yet filed
 *   page/000123         { pieces: Piece[] }           filed pieces n = 12301…12400
 *   meta/counter        { n }                         pieces filed so far
 *   meta/batch          Batch                         filing journal (see fileWaiting)
 *   meta/lock           { until }                     filing lease
 *   piece/<id>          { key? | page, deleteHash }   index for single lookups
 *   dup/<day>/<hash>    {}                            same-day duplicate guard
 *
 * Leaving a piece writes only keys unique to that piece, so simultaneous
 * visitors do not contend for the same record. A scheduled function files new
 * pieces into numbered pages once a minute. Filing is journalled and designed
 * to be idempotent: an interrupted or repeated run completes the same batch
 * with the same numbers, and a piece's "waiting" copy is deleted only after it
 * has been written to a page. Every change to a piece increments its revision
 * (rev); where two copies exist briefly during filing, the higher revision is
 * kept, so a moderation decision made meanwhile is carried over.
 * These properties are covered by scripts/field-test.mjs locally and must be
 * re-verified on Netlify (scripts/field-verify.mjs). Failures are logged.
 *
 * Privacy: nothing about the visitor is stored — no name, email, IP address,
 * or device information. Only the letters, their arrangement, the date, the
 * terms version agreed to, and moderation state.
 */
import { getStore, type Store } from '@netlify/blobs';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

export const PAGE_SIZE = 100;
export const REPORT_THRESHOLD = 3;
const MAX_GLYPHS = 32;
const LOCK_MS = 55_000;

export type Glyph = { c: string; x: number; y: number; r: number; s: number; f: 0 | 1; t: 0 | 1 };
export type Status = 'visible' | 'pending' | 'hidden' | 'removed';
export type Piece = {
  id: string;
  n: number;
  at: string; // YYYY-MM-DD
  aspect: 'landscape' | 'portrait';
  base: number;
  glyphs: Glyph[];
  status: Status;
  reports: number;
  reasons?: Record<string, number>;
  held?: string; // why screening held it for review
  terms?: string; // participation terms version agreed to
  rev?: number;
  test?: boolean; // created by the moderator's self-test; never public
};
export type PublicPiece = Pick<Piece, 'id' | 'n' | 'at' | 'aspect' | 'base' | 'glyphs'>;
export const REPORT_REASONS = ['hate', 'threat', 'personal information', 'impersonation', 'spam', 'other'] as const;

export function store(): Store {
  // Local testing: point at a local blobs server (see scripts/field-dev-server.mjs).
  if (process.env.FIELD_BLOBS_EDGE_URL) {
    return getStore({
      siteID: 'local',
      token: process.env.FIELD_BLOBS_TOKEN ?? 'local',
      name: process.env.FIELD_STORE || 'field',
      edgeURL: process.env.FIELD_BLOBS_EDGE_URL,
      uncachedEdgeURL: process.env.FIELD_BLOBS_EDGE_URL,
      consistency: 'strong',
    } as Parameters<typeof getStore>[0] & object);
  }
  // Previews and branch deploys use a separate store (see netlify.toml), so
  // testing never touches the real field.
  return getStore({ name: process.env.FIELD_STORE || 'field', consistency: 'strong' });
}

export const pageKey = (page: number) => `page/${String(page).padStart(6, '0')}`;
export const toPublic = (p: Piece): PublicPiece => ({
  id: p.id, n: p.n, at: p.at, aspect: p.aspect, base: p.base, glyphs: p.glyphs,
});

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/* ---------------------------------------------------------------- screening */

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/** Words that are not refused outright but always wait for a person to look. */
const HOLD: [RegExp, string][] = [
  [/\b(kill|killing|murder|shoot|shooting|stab|bomb|rape|lynch|hang|behead|massacre|genocide|attack|die|dead|death)\b/i, 'violence'],
  [/(giles|mccrary|mc\s*crary|gilesmccrary)/i, 'impersonation'],
  [/\b(official|admin|administrator|moderator|staff|verified)\b/i, 'impersonation'],
  [/\b\d+\s+\p{L}+\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|way|court|ct)\b/iu, 'personal information'],
];

/** Refuse (reason), hold for review (hold), or accept. */
export function screenText(text: string): { reject?: string; hold?: string } {
  const plain = text.normalize('NFKC');
  const squashed = plain.replace(/[\s._\-'’]+/g, '');
  if (!/[\p{L}\p{N}]/u.test(plain)) return { reject: 'empty' };
  if (/(https?:|www\.|\.(com|net|org|io|co|ru|xyz|info|biz|app|link|ly|me|tv)\b)/i.test(plain)) return { reject: 'links' };
  if (/@/.test(plain)) return { reject: 'contact details' };
  if (/\d[\d\s().-]{5,}\d/.test(plain)) return { reject: 'contact details' };
  if (matcher.hasMatch(plain) || matcher.hasMatch(squashed)) return { reject: 'language' };
  for (const [re, why] of HOLD) if (re.test(plain) || re.test(squashed)) return { hold: why };
  return {};
}

const ALLOWED = /^[\p{L}\p{M}\p{N}.,!?'’"“”\-–—&:;()/*#%+=]$/u;
const num = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : NaN;

export type Valid = { ok: true; aspect: Piece['aspect']; base: number; glyphs: Glyph[]; hold?: string };

/** Validates a submitted composition. The typed word is screened, then discarded. */
export function validate(body: unknown): Valid | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid' };
  const b = body as Record<string, unknown>;
  const aspect = b.aspect === 'portrait' ? 'portrait' : 'landscape';
  const base = num(b.base, 3, 18);
  if (!Array.isArray(b.glyphs) || Number.isNaN(base)) return { ok: false, error: 'invalid' };
  if (!b.glyphs.length) return { ok: false, error: 'empty' };
  // Screen the word as typed first, so refusals explain themselves.
  const typedFirst = typeof b.text === 'string' ? screenText(b.text.slice(0, 64)) : {};
  if (typedFirst.reject) return { ok: false, error: typedFirst.reject };
  if (b.glyphs.length > MAX_GLYPHS) return { ok: false, error: 'too long' };
  const glyphs: Glyph[] = [];
  for (const g of b.glyphs as Record<string, unknown>[]) {
    const c = typeof g?.c === 'string' ? g.c : '';
    if ([...c].length !== 1 || !ALLOWED.test(c)) return { ok: false, error: 'characters' };
    const x = num(g.x, 0, 100), y = num(g.y, 0, 100), r = num(g.r, -3600, 3600), s = num(g.s, 0.2, 4);
    if ([x, y, r, s].some(Number.isNaN)) return { ok: false, error: 'invalid' };
    glyphs.push({
      c,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      r: Math.round(r * 10) / 10,
      s: Math.round(s * 100) / 100,
      f: g.f ? 1 : 0,
      t: g.t ? 1 : 0,
    });
  }
  const typed = typeof b.text === 'string' ? b.text.slice(0, 64) : '';
  const letters = glyphs.map((g) => g.c).join('');
  for (const t of [typed, letters]) {
    if (!t) continue;
    const r = screenText(t);
    if (r.reject) return { ok: false, error: r.reject };
  }
  const hold = screenText(typed).hold ?? screenText(letters).hold;
  return { ok: true, aspect, base: Math.round(base * 100) / 100, glyphs, hold };
}

/** A fingerprint of a composition, for the same-day duplicate guard. */
export async function fingerprint(v: Valid) {
  const shape = v.glyphs.map((g) => `${g.c}${Math.round(g.x)}:${Math.round(g.y)}:${Math.round(g.r / 5)}:${g.s}:${g.f}${g.t}`).join('|');
  return sha256(`${v.aspect}|${v.base}|${shape}`);
}

/* ------------------------------------------------------------ safe updates */

/** Read–modify–write a JSON blob with an etag condition, retrying on conflict. */
export async function update<T>(s: Store, key: string, fn: (current: T | null) => T, attempts = 12): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const cur = await s.getWithMetadata(key, { type: 'json' });
    const next = fn((cur?.data as T) ?? null);
    const res = cur?.etag
      ? await s.setJSON(key, next, { onlyIfMatch: cur.etag })
      : await s.setJSON(key, next, { onlyIfNew: true });
    if (res.modified) return next;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (i + 1)));
  }
  throw new Error(`conflict updating ${key}`);
}

/** Every piece ever left: filed plus waiting. */
export async function total(s: Store): Promise<number> {
  const [filed, waiting] = await Promise.all([filedCount(s), waitingKeys(s)]);
  return filed + waiting.length;
}

export async function filedCount(s: Store): Promise<number> {
  const c = (await s.get('meta/counter', { type: 'json' })) as { n: number } | null;
  return c?.n ?? 0;
}

/** Keys of pieces left but not yet filed, oldest first. */
export async function waitingKeys(s: Store): Promise<string[]> {
  const keys: string[] = [];
  for await (const page of s.list({ prefix: 'new/', paginate: true })) keys.push(...page.blobs.map((b) => b.key));
  return keys.sort();
}

/** Pieces waiting to be filed, newest first (at most `limit`). */
export async function readWaiting(s: Store, keys: string[], limit = 100): Promise<Piece[]> {
  const newest = keys.slice(-limit).reverse();
  const pieces = await Promise.all(newest.map((k) => s.get(k, { type: 'json' }) as Promise<Piece | null>));
  return pieces.filter((p): p is Piece => Boolean(p));
}

export async function readPage(s: Store, page: number): Promise<Piece[]> {
  const p = (await s.get(pageKey(page), { type: 'json' })) as { pieces: Piece[] } | null;
  return (p?.pieces ?? []).sort((a, b) => b.n - a.n);
}

/** Merge lists, keeping one copy per id (the highest revision). */
export function uniqueById(...lists: Piece[][]): Piece[] {
  const best = new Map<string, Piece>();
  for (const p of lists.flat()) {
    const cur = best.get(p.id);
    if (!cur || (p.rev ?? 0) > (cur.rev ?? 0) || (p.n && !cur.n && (p.rev ?? 0) === (cur.rev ?? 0))) best.set(p.id, p);
  }
  return [...best.values()];
}

export type Location = { key?: string; page?: number; n?: number; deleteHash: string };

export async function locate(s: Store, id: string) {
  if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
  return (await s.get(`piece/${id}`, { type: 'json' })) as Location | null;
}

export async function readOne(s: Store, id: string): Promise<{ piece: Piece; loc: Location } | null> {
  const loc = await locate(s, id);
  if (!loc) return null;
  const candidates: Piece[] = [];
  if (loc.key) {
    const w = (await s.get(loc.key, { type: 'json' })) as Piece | null;
    if (w) candidates.push(w);
  }
  const fresh = loc.key && !candidates.length ? await locate(s, id) : loc;
  if (fresh?.page !== undefined) {
    const p = (await readPage(s, fresh.page)).find((x) => x.id === id);
    if (p) candidates.push(p);
  }
  const [piece] = uniqueById(candidates);
  return piece ? { piece, loc: fresh ?? loc } : null;
}

/** Change one piece (status, reports, removal) wherever it is; returns the result. */
export async function mutate(s: Store, id: string, fn: (p: Piece) => Piece | void): Promise<Piece | null> {
  const loc = await locate(s, id);
  if (!loc) return null;
  let result: Piece | null = null;
  if (loc.key) {
    try {
      result = await update<Piece>(s, loc.key, (cur) => {
        if (!cur) throw new Error('filed');
        const next = fn({ ...cur }) ?? cur;
        return { ...next, rev: (cur.rev ?? 0) + 1 };
      });
    } catch {
      result = null; // filed meanwhile — fall through to the page
    }
    // If filing switched it to a page meanwhile, make sure the page has this revision.
    const after = await locate(s, id);
    if (after?.page !== undefined) {
      if (result) return reconcileIntoPage(s, after.page, result);
      return mutatePage(s, after.page, id, fn);
    }
    return result;
  }
  if (loc.page !== undefined) return mutatePage(s, loc.page, id, fn);
  return null;
}

async function mutatePage(s: Store, page: number, id: string, fn: (p: Piece) => Piece | void) {
  let found: Piece | null = null;
  await update<{ pieces: Piece[] }>(s, pageKey(page), (cur) => ({
    pieces: (cur?.pieces ?? []).map((p) => {
      if (p.id !== id) return p;
      const next = fn({ ...p }) ?? p;
      found = { ...next, rev: (p.rev ?? 0) + 1 };
      return found;
    }),
  }));
  return found as Piece | null;
}

/** Put a newer revision of a piece into its page (higher revision wins). */
async function reconcileIntoPage(s: Store, page: number, newer: Piece) {
  let out: Piece = newer;
  await update<{ pieces: Piece[] }>(s, pageKey(page), (cur) => ({
    pieces: (cur?.pieces ?? []).map((p) => {
      if (p.id !== newer.id) return p;
      if ((newer.rev ?? 0) <= (p.rev ?? 0)) { out = p; return p; }
      out = { ...newer, n: p.n };
      return out;
    }),
  }));
  return out;
}

/* ------------------------------------------------------------------ filing */

type Batch = { items: { key: string; id: string; n: number; page: number }[]; endN: number };

async function acquireLock(s: Store): Promise<boolean> {
  const cur = await s.getWithMetadata('meta/lock', { type: 'json' });
  const until = Date.now() + LOCK_MS;
  if (cur && (cur.data as { until: number }).until > Date.now()) return false;
  const res = cur?.etag
    ? await s.setJSON('meta/lock', { until }, { onlyIfMatch: cur.etag })
    : await s.setJSON('meta/lock', { until }, { onlyIfNew: true });
  return res.modified;
}

/**
 * Files waiting pieces into numbered pages, oldest first. Safe to retry and
 * safe if interrupted at any point:
 *  1. the batch (which piece gets which number and page) is journalled first;
 *  2. pieces are appended to pages (skipping any already there);
 *  3. the counter is advanced (never backwards);
 *  4. each index is pointed at its page, any newer revision is reconciled,
 *     and only then is the waiting copy deleted;
 *  5. the journal is cleared.
 * A run that dies part-way leaves the journal; the next run completes it with
 * the same numbers before starting anything new. A lease prevents overlap.
 */
export async function fileWaiting(s: Store, max = 600): Promise<number> {
  if (!(await acquireLock(s))) return 0;
  try {
    let filed = 0;
    const journal = (await s.get('meta/batch', { type: 'json' })) as Batch | null;
    if (journal) {
      console.warn(`[field] completing an interrupted filing batch of ${journal.items.length} (n ≤ ${journal.endN})`);
      filed += await applyBatch(s, journal);
    }

    const keys = (await waitingKeys(s)).slice(0, max);
    if (!keys.length) return filed;
    const n0 = await filedCount(s);
    const items: Batch['items'] = [];
    for (const key of keys) {
      const n = n0 + items.length + 1;
      items.push({ key, id: key.slice(key.lastIndexOf('-') + 1), n, page: Math.floor((n - 1) / PAGE_SIZE) });
    }
    const batch: Batch = { items, endN: n0 + items.length };
    await s.setJSON('meta/batch', batch);
    filed += await applyBatch(s, batch);
    return filed;
  } finally {
    await s.delete('meta/lock');
  }
}

async function applyBatch(s: Store, batch: Batch): Promise<number> {
  // Read the latest waiting copies (some may already be gone if a previous run got further).
  const loaded = await Promise.all(
    batch.items.map(async (it) => ({ it, piece: (await s.get(it.key, { type: 'json' })) as Piece | null })),
  );
  const byPage = new Map<number, Piece[]>();
  for (const { it, piece } of loaded) {
    if (!piece) continue;
    byPage.set(it.page, [...(byPage.get(it.page) ?? []), { ...piece, n: it.n }]);
  }
  for (const [page, add] of byPage) {
    await update<{ pieces: Piece[] }>(s, pageKey(page), (cur) => {
      const existing = cur?.pieces ?? [];
      const ids = new Set(existing.map((p) => p.id));
      return { pieces: [...existing, ...add.filter((p) => !ids.has(p.id))] };
    });
  }
  await update<{ n: number }>(s, 'meta/counter', (cur) => ({ n: Math.max(cur?.n ?? 0, batch.endN) }));

  const finish = async ({ it }: (typeof loaded)[number]) => {
    const loc = await locate(s, it.id);
    if (!loc) return;
    if (loc.page === undefined) {
      await s.setJSON(`piece/${it.id}`, { page: it.page, n: it.n, deleteHash: loc.deleteHash });
    }
    // Anything changed on the waiting copy after we read it wins if newer.
    const latest = (await s.get(it.key, { type: 'json' })) as Piece | null;
    if (latest) await reconcileIntoPage(s, it.page, { ...latest, n: it.n });
    await s.delete(it.key);
  };
  for (let i = 0; i < loaded.length; i += 25) await Promise.all(loaded.slice(i, i + 25).map(finish));
  await s.delete('meta/batch');
  return loaded.filter((x) => x.piece).length;
}

/* ------------------------------------------------------------------ health */

/** A snapshot for the moderation page and logs: is filing keeping up? */
export async function health(s: Store) {
  const [filed, waiting, journal, lock] = await Promise.all([
    filedCount(s),
    waitingKeys(s),
    s.get('meta/batch', { type: 'json' }) as Promise<Batch | null>,
    s.get('meta/lock', { type: 'json' }) as Promise<{ until: number } | null>,
  ]);
  const oldest = waiting[0] ? Number(waiting[0].slice(4, 19)) : null;
  const oldestWaitingSeconds = oldest ? Math.round((Date.now() - oldest) / 1000) : 0;
  return {
    filed,
    waiting: waiting.length,
    oldestWaitingSeconds,
    interruptedBatch: journal ? journal.items.length : 0,
    filingInProgress: Boolean(lock && lock.until > Date.now()),
    // Filing runs every minute; anything waiting much longer suggests it has stalled.
    stalled: oldestWaitingSeconds > 300 || Boolean(journal && !(lock && lock.until > Date.now())),
  };
}

/* -------------------------------------------------------------------- misc */

export const randomId = (len = 10) => {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
};

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison for secrets. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > 16_000) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Whether a request carries the removal key for this piece. */
export async function ownsPiece(loc: Location | null, token: string) {
  return Boolean(loc && token && loc.deleteHash && safeEqual(await sha256(token), loc.deleteHash));
}
