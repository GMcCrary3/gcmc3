/**
 * The field — a collective work. Visitors abstract their own concrete and
 * leave it for others. Shared logic for the field's functions.
 *
 * Storage (Netlify Blobs, store "field"):
 *   new/<time>-<id>     Piece                       just left, not yet filed
 *   page/000123         { pieces: Piece[] }         filed pieces n = 12301…12400
 *   meta/counter        { n }                       pieces filed so far
 *   piece/<id>          { key? | page, deleteHash } index for single lookups
 *
 * Leaving a piece writes only keys unique to that piece, so any number of
 * visitors can leave pieces at the same moment without conflict. A scheduled
 * function (field-file) files new pieces into numbered pages of 100 once a
 * minute — a single writer, so numbering never collides. Reads cost one blob
 * per hundred pieces plus a short listing of what is waiting to be filed.
 * Changes to existing pieces (reports, moderation, removal) use conditional
 * (etag) writes with retry.
 *
 * Privacy: nothing about the visitor is stored — no name, email, IP address,
 * or device information. Only the letters, their arrangement, and the date.
 */
import { getStore, type Store } from '@netlify/blobs';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

export const PAGE_SIZE = 100;
export const REPORT_THRESHOLD = 3;
const MAX_GLYPHS = 32;

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
};
export type PublicPiece = Omit<Piece, 'status' | 'reports'>;

export function store(): Store {
  // Local testing: point at a local blobs server (see scripts/field-dev-server.mjs).
  if (process.env.FIELD_BLOBS_EDGE_URL) {
    return getStore({
      name: 'field',
      siteID: 'local',
      token: process.env.FIELD_BLOBS_TOKEN ?? 'local',
      edgeURL: process.env.FIELD_BLOBS_EDGE_URL,
      uncachedEdgeURL: process.env.FIELD_BLOBS_EDGE_URL,
      consistency: 'strong',
    } as Parameters<typeof getStore>[0] & object);
  }
  return getStore({ name: 'field', consistency: 'strong' });
}

export const pageKey = (page: number) => `page/${String(page).padStart(6, '0')}`;
export const toPublic = ({ status: _s, reports: _r, ...p }: Piece): PublicPiece => p;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/* ---------------------------------------------------------------- moderation */

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/** Returns a reason the text cannot be left, or null if it is fine. */
export function screenText(text: string): string | null {
  const plain = text.normalize('NFKC');
  const squashed = plain.replace(/[\s._\-'’]+/g, '');
  if (!/[\p{L}\p{N}]/u.test(plain)) return 'empty';
  if (/(https?:|www\.|\.(com|net|org|io|co|ru|xyz|info|biz|app|link|ly)\b)/i.test(plain)) return 'links';
  if (/@/.test(plain)) return 'contact details';
  if (/\d[\d\s().-]{5,}\d/.test(plain)) return 'contact details';
  if (matcher.hasMatch(plain) || matcher.hasMatch(squashed)) return 'language';
  return null;
}

const ALLOWED = /^[\p{L}\p{M}\p{N}.,!?'’"“”\-–—&:;()/*#%+=]$/u;
const num = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : NaN;

/** Validates a submitted composition. Returns the clean piece data or an error. */
export function validate(body: unknown):
  | { ok: true; text: string; aspect: Piece['aspect']; base: number; glyphs: Glyph[] }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid' };
  const b = body as Record<string, unknown>;
  const aspect = b.aspect === 'portrait' ? 'portrait' : 'landscape';
  const base = num(b.base, 3, 18);
  if (!Array.isArray(b.glyphs) || Number.isNaN(base)) return { ok: false, error: 'invalid' };
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
  // The original word (as typed, in order) is screened, then discarded.
  const text = typeof b.text === 'string' ? b.text.slice(0, 64) : glyphs.map((g) => g.c).join('');
  const reason = screenText(text) ?? screenText(glyphs.map((g) => g.c).join(''));
  if (reason) return { ok: false, error: reason };
  return { ok: true, text, aspect, base: Math.round(base * 100) / 100, glyphs };
}

/* ------------------------------------------------------------ safe updates */

/** Read–modify–write a JSON blob with an etag condition, retrying on conflict. */
export async function update<T>(
  s: Store,
  key: string,
  fn: (current: T | null) => T,
  attempts = 12,
): Promise<T> {
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

export async function filedCount(s: Store): Promise<number> {
  const c = (await s.get('meta/counter', { type: 'json' })) as { n: number } | null;
  return c?.n ?? 0;
}

/** Keys of pieces left but not yet filed, oldest first. */
export async function waitingKeys(s: Store): Promise<string[]> {
  const keys: string[] = [];
  for await (const page of s.list({ prefix: 'new/', paginate: true })) {
    keys.push(...page.blobs.map((b) => b.key));
  }
  return keys.sort();
}

/** Pieces waiting to be filed, newest first (at most `limit`). */
export async function readWaiting(s: Store, keys: string[], limit = 100): Promise<Piece[]> {
  const newest = keys.slice(-limit).reverse();
  const pieces = await Promise.all(newest.map((k) => s.get(k, { type: 'json' }) as Promise<Piece | null>));
  return pieces.filter((p): p is Piece => Boolean(p));
}

export async function total(s: Store): Promise<number> {
  const [filed, waiting] = await Promise.all([filedCount(s), waitingKeys(s)]);
  return filed + waiting.length;
}

export async function readPage(s: Store, page: number): Promise<Piece[]> {
  const p = (await s.get(pageKey(page), { type: 'json' })) as { pieces: Piece[] } | null;
  return (p?.pieces ?? []).sort((a, b) => b.n - a.n);
}

export type Location = { key?: string; page?: number; n?: number; deleteHash: string };

export async function locate(s: Store, id: string) {
  if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
  return (await s.get(`piece/${id}`, { type: 'json' })) as Location | null;
}

export async function readOne(s: Store, id: string): Promise<Piece | null> {
  const loc = await locate(s, id);
  if (!loc) return null;
  if (loc.key) {
    const waiting = (await s.get(loc.key, { type: 'json' })) as Piece | null;
    if (waiting) return waiting;
    // Filed between the two reads: look it up again.
    const again = await locate(s, id);
    if (!again || again.page === undefined) return null;
    return (await readPage(s, again.page)).find((p) => p.id === id) ?? null;
  }
  if (loc.page === undefined) return null;
  return (await readPage(s, loc.page)).find((p) => p.id === id) ?? null;
}

/** Change one piece in place (status, reports, removal), wherever it is. */
export async function mutate(s: Store, id: string, fn: (p: Piece) => Piece | void): Promise<Piece | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const loc = await locate(s, id);
    if (!loc) return null;
    if (loc.key) {
      try {
        let changed: Piece | null = null;
        await update<Piece>(s, loc.key, (cur) => {
          if (!cur) throw new Error('filed');
          changed = fn({ ...cur }) ?? cur;
          return changed;
        });
        return changed;
      } catch {
        continue; // it was filed meanwhile; look again
      }
    }
    if (loc.page !== undefined) return mutatePage(s, loc.page, id, fn);
  }
  return null;
}

async function mutatePage(s: Store, page: number, id: string, fn: (p: Piece) => Piece | void) {
  let found: Piece | null = null;
  await update<{ pieces: Piece[] }>(s, pageKey(page), (cur) => {
    const pieces = (cur?.pieces ?? []).map((p) => {
      if (p.id !== id) return p;
      const next = fn({ ...p }) ?? p;
      found = next;
      return next;
    });
    return { pieces };
  });
  return found as Piece | null;
}

export const randomId = (len = 10) => {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
};

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison for the moderation token. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------------ filing */

/**
 * Files waiting pieces into numbered pages, oldest first. Must only ever run
 * as a single writer (the scheduled field-file function), which is what makes
 * numbering collision-free. Returns how many pieces were filed.
 */
export async function fileWaiting(s: Store, max = 600): Promise<number> {
  const keys = (await waitingKeys(s)).slice(0, max);
  if (!keys.length) return 0;
  const pieces = (
    await Promise.all(keys.map(async (k) => ({ key: k, piece: (await s.get(k, { type: 'json' })) as Piece | null })))
  ).filter((x): x is { key: string; piece: Piece } => Boolean(x.piece));

  let n = await filedCount(s);
  const byPage = new Map<number, Piece[]>();
  const placed: { key: string; piece: Piece; page: number }[] = [];
  for (const { key, piece } of pieces) {
    n += 1;
    const page = Math.floor((n - 1) / PAGE_SIZE);
    const filed = { ...piece, n };
    byPage.set(page, [...(byPage.get(page) ?? []), filed]);
    placed.push({ key, piece: filed, page });
  }

  // 1. Append to pages (conditional writes: reports may touch a page meanwhile).
  for (const [page, add] of byPage) {
    await update<{ pieces: Piece[] }>(s, pageKey(page), (cur) => {
      const existing = cur?.pieces ?? [];
      const ids = new Set(existing.map((p) => p.id));
      return { pieces: [...existing, ...add.filter((p) => !ids.has(p.id))] };
    });
  }
  // 2. Advance the counter.
  await s.setJSON('meta/counter', { n });
  // 3. Point each piece's index at its page, then clear it from the waiting list.
  const run = async ({ key, piece, page }: (typeof placed)[number]) => {
    const loc = await locate(s, piece.id);
    await s.setJSON(`piece/${piece.id}`, { page, n: piece.n, deleteHash: loc?.deleteHash ?? '' });
    await s.delete(key);
  };
  for (let i = 0; i < placed.length; i += 25) await Promise.all(placed.slice(i, i + 25).map(run));
  return placed.length;
}
