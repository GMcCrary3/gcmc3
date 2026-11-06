/**
 * The literary works: "unfinished sentence" and "space in between us".
 *
 * Each work has its own Netlify Blobs store, separate from the field:
 *   composition                 Composition    the published work (single record)
 *   sub/<time>-<id>             Submission     every submission, in submission order
 *   req/<time>-<id>             Request        reports and removal requests
 *   audit/<time>-<id>           AuditEntry     what moderators did, and when
 *   dup/<day>/<hash>            {}             same-day duplicate guard
 *
 * Submission order (sub/ keys, by time received) is kept separate from
 * publication order (the sequence numbers in `composition`). A sequence number
 * is assigned only when a contribution is published, inside one conditional
 * write of the composition record, together with any milestone it triggers.
 * So simultaneous approvals cannot duplicate a number, a milestone is created
 * exactly once, and nothing already published is ever renumbered or reordered.
 *
 * Privacy: no name, email, IP address or device identifier is stored. Only the
 * words, the credit the contributor chose (if any), the consent version,
 * timestamps and moderation state. The owner's private key is stored only as a
 * one-way hash.
 */
import { getStore, type Store } from '@netlify/blobs';
import site from '../../../src/data/site.json' with { type: 'json' };
import { randomId, safeEqual, screenText, sha256, update } from './field.ts';

export const PROJECTS = {
  'unfinished-sentence': 'sentence',
  'space-in-between-us': 'between',
} as const;
export type Slug = keyof typeof PROJECTS;
export type Project = (typeof PROJECTS)[Slug];
export const isSlug = (s: string): s is Slug => s in PROJECTS;

type Works = typeof site.works;
export type Settings = {
  open: boolean;
  moderation: 'pre' | 'post';
  /** Visitor contributions per artist milestone (null = none). */
  every: number | null;
  /** Whether a pending milestone holds further visitor publication until the artist intervenes. */
  enforce: boolean;
  acceptWhileAwaiting: boolean;
  windowDays: number | null;
  windowStartsAt: 'milestone' | 'approval' | 'submission';
  maxChars: number;
  termsVersion: string;
};

/** Settings come from src/data/site.json (editable in the site editor). */
export function settings(p: Project, works: Works = site.works): Settings {
  const termsVersion = works.termsVersion;
  if (p === 'sentence') {
    const s = works.sentence;
    return {
      open: s.open,
      moderation: s.moderation === 'post' ? 'post' : 'pre',
      every: s.every > 0 ? s.every : null,
      enforce: true, // approved: every twelfth accepted contribution is followed by the artist
      acceptWhileAwaiting: Boolean(s.acceptWhileAwaiting),
      windowDays: s.windowDays ?? null,
      windowStartsAt: (['milestone', 'approval', 'submission'] as const).includes(s.windowStartsAt as never)
        ? (s.windowStartsAt as Settings['windowStartsAt']) : 'milestone',
      maxChars: s.maxChars,
      termsVersion,
    };
  }
  const b = works.between;
  const every = typeof b.interventionEvery === 'number' && b.interventionEvery > 0 ? b.interventionEvery : null;
  return {
    open: b.open,
    moderation: b.moderation === 'post' ? 'post' : 'pre',
    every,
    enforce: Boolean(b.enforceArtistTurn) && every !== null, // off until the artist approves
    acceptWhileAwaiting: true,
    windowDays: null,
    windowStartsAt: 'milestone',
    maxChars: b.maxChars,
    termsVersion,
  };
}

export function worksStore(p: Project): Store {
  const name = `${p}${process.env.WORKS_STORE_SUFFIX ?? ''}`;
  if (process.env.FIELD_BLOBS_EDGE_URL) {
    return getStore({
      name,
      siteID: 'local',
      token: process.env.FIELD_BLOBS_TOKEN ?? 'local',
      edgeURL: process.env.FIELD_BLOBS_EDGE_URL,
      uncachedEdgeURL: process.env.FIELD_BLOBS_EDGE_URL,
      consistency: 'strong',
    } as Parameters<typeof getStore>[0] & object);
  }
  return getStore({ name, consistency: 'strong' });
}

/* ------------------------------------------------------------------ types */

export type SubStatus = 'pending' | 'published' | 'rejected' | 'withdrawn';
export type Submission = {
  id: string;
  project: Project;
  text: string;
  display: string | null; // public credit, or null for anonymous
  consent: string; // terms version accepted
  receivedAt: string;
  status: SubStatus;
  held?: string; // screening flagged it for a closer look
  seq?: number;
  decidedAt?: string;
  reason?: string; // private moderation note
  respondsTo: number; // the last published sequence number the contributor saw
  receiptHash: string;
};

export type Entry = {
  seq: number;
  id: string;
  kind: 'visitor' | 'artist';
  text: string;
  display: string | null;
  consent: string | null;
  submittedAt: string;
  approvedAt: string;
  visitorNumber?: number; // 1, 2, 3 … for visitor contributions only
  milestone?: number; // for an artist entry: the milestone it answered
  status: 'published' | 'removed';
  removedAt?: string;
};

export type Milestone = {
  n: number; // 1st, 2nd … milestone
  atVisitor: number; // 12, 24, 36 …
  reachedAt: string; // when the triggering contribution was published
  triggerSubmittedAt: string;
  triggerApprovedAt: string;
  resolvedAt?: string;
  interventionSeq?: number;
};

export type Composition = {
  project: Project;
  entries: Entry[];
  visitorCount: number; // published visitor contributions, ever (removals don't reduce it)
  milestones: Milestone[];
  awaiting: boolean; // a milestone is waiting for the artist
};

export type Request = {
  id: string;
  kind: 'report' | 'removal';
  seq: number;
  reason: string;
  createdAt: string;
  status: 'open' | 'resolved' | 'dismissed';
  byOwner?: boolean;
};

const empty = (project: Project): Composition => ({ project, entries: [], visitorCount: 0, milestones: [], awaiting: false });

export async function readComposition(s: Store, p: Project): Promise<Composition> {
  return ((await s.get('composition', { type: 'json' })) as Composition | null) ?? empty(p);
}

/** What anyone may see. No ids beyond the public entry id, no consent records, no private notes. */
export function publicView(c: Composition, st: Settings) {
  const pending = c.milestones.find((m) => !m.resolvedAt);
  const since = st.every ? c.visitorCount % st.every : c.visitorCount;
  return {
    entries: c.entries.map((e) =>
      e.status === 'removed'
        ? { seq: e.seq, id: e.id, kind: e.kind, removed: true }
        : { seq: e.seq, id: e.id, kind: e.kind, text: e.text, display: e.display, at: e.approvedAt },
    ),
    visitorCount: c.visitorCount,
    every: st.every,
    sinceMilestone: c.awaiting ? st.every : since,
    awaiting: c.awaiting && st.enforce,
    milestones: c.milestones.length,
    pendingMilestone: pending ? { n: pending.n, atVisitor: pending.atVisitor } : null,
    open: st.open && !(c.awaiting && st.enforce && !st.acceptWhileAwaiting),
  };
}

/* ------------------------------------------------------------- validation */

const day = () => new Date().toISOString().slice(0, 10);
const clean = (t: string) => t.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/^\n+|\s+$/g, '');

export function validateText(raw: unknown, st: Settings): { ok: true; text: string; hold?: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'invalid' };
  const text = clean(raw.normalize('NFC'));
  if (!text) return { ok: false, error: 'empty' };
  if ([...text].length > st.maxChars) return { ok: false, error: 'too long' };
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) return { ok: false, error: 'characters' };
  const r = screenText(text);
  if (r.reject) return { ok: false, error: r.reject };
  return { ok: true, text, hold: r.hold };
}

export function validateDisplay(raw: unknown): { ok: true; display: string | null } | { ok: false; error: string } {
  if (raw == null || raw === '') return { ok: true, display: null };
  if (typeof raw !== 'string') return { ok: false, error: 'invalid' };
  const d = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!d) return { ok: true, display: null };
  if ([...d].length > 40) return { ok: false, error: 'credit too long' };
  const r = screenText(d);
  if (r.reject) return { ok: false, error: r.reject };
  if (r.hold === 'impersonation') return { ok: false, error: 'impersonation' };
  return { ok: true, display: d };
}

/* ------------------------------------------------------------- operations */

export type Clock = () => Date;
const now: Clock = () => new Date();

async function audit(s: Store, action: string, detail: Record<string, unknown>, clock: Clock = now) {
  const at = clock().toISOString();
  await s.setJSON(`audit/${at}-${randomId(6)}`, { at, action, ...detail });
}

/** Receive a submission. Returns the submission and, under post-moderation, the publication attempt. */
export async function submit(
  s: Store,
  p: Project,
  st: Settings,
  body: Record<string, unknown>,
  clock: Clock = now,
): Promise<{ ok: true; sub: Submission; token: string; published: boolean } | { ok: false; status: number; error: string }> {
  if (!st.open) return { ok: false, status: 403, error: 'closed' };
  if (body.agree !== st.termsVersion) return { ok: false, status: 422, error: 'terms' };
  const t = validateText(body.text, st);
  if (!t.ok) return { ok: false, status: 422, error: t.error };
  const d = validateDisplay(body.display);
  if (!d.ok) return { ok: false, status: 422, error: d.error };

  const comp = await readComposition(s, p);
  if (comp.awaiting && st.enforce && !st.acceptWhileAwaiting) return { ok: false, status: 409, error: 'awaiting-artist' };

  const fp = await sha256(t.text.toLowerCase().replace(/\s+/g, ' '));
  const dup = await s.setJSON(`dup/${day()}/${fp}`, {}, { onlyIfNew: true });
  if (!dup.modified) return { ok: false, status: 409, error: 'duplicate' };

  const token = randomId(24);
  const at = clock().toISOString();
  const sub: Submission = {
    id: randomId(),
    project: p,
    text: t.text,
    display: d.display,
    consent: st.termsVersion,
    receivedAt: at,
    status: 'pending',
    ...(t.hold ? { held: t.hold } : {}),
    respondsTo: comp.entries.length ? comp.entries[comp.entries.length - 1].seq : 0,
    receiptHash: await sha256(token),
  };
  const key = `sub/${at}-${sub.id}`;
  await s.setJSON(key, sub, { onlyIfNew: true });
  await s.setJSON(`idx/${sub.id}`, { key }, { onlyIfNew: true });

  let published = false;
  if (st.moderation === 'post' && !t.hold) {
    const r = await approve(s, p, st, sub.id, 'auto', clock);
    published = r.ok;
    if (r.ok) Object.assign(sub, { status: 'published', seq: r.entry.seq });
  }
  return { ok: true, sub, token, published };
}

export async function findSubmission(s: Store, id: string): Promise<{ key: string; sub: Submission } | null> {
  if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
  const idx = (await s.get(`idx/${id}`, { type: 'json' })) as { key: string } | null;
  if (!idx) return null;
  const sub = (await s.get(idx.key, { type: 'json' })) as Submission | null;
  return sub ? { key: idx.key, sub } : null;
}

export async function listSubmissions(s: Store): Promise<Submission[]> {
  const keys: string[] = [];
  for await (const page of s.list({ prefix: 'sub/', paginate: true })) keys.push(...page.blobs.map((b) => b.key));
  keys.sort(); // submission order
  const subs = await Promise.all(keys.map((k) => s.get(k, { type: 'json' }) as Promise<Submission | null>));
  return subs.filter((x): x is Submission => Boolean(x));
}

export type ApproveResult =
  | { ok: true; entry: Entry; milestone: Milestone | null; already: boolean }
  | { ok: false; error: 'not found' | 'not pending' | 'awaiting-artist' };

/**
 * Publish a pending submission. One conditional write of the composition
 * assigns the next sequence number, advances the visitor count, and, if this
 * is the twelfth (or 24th …), creates the milestone. Safe to repeat.
 */
export async function approve(s: Store, p: Project, st: Settings, id: string, by: string, clock: Clock = now): Promise<ApproveResult> {
  const found = await findSubmission(s, id);
  if (!found) return { ok: false, error: 'not found' };
  const { key, sub } = found;
  if (sub.status !== 'pending' && sub.status !== 'published') return { ok: false, error: 'not pending' };

  // Held in an object: the callback below may run more than once (retries).
  const out: { r: ApproveResult } = { r: { ok: false, error: 'not pending' } };
  await update<Composition>(s, 'composition', (cur) => {
    const c = cur ?? empty(p);
    const existing = c.entries.find((e) => e.id === id);
    if (existing) {
      out.r = { ok: true, entry: existing, milestone: null, already: true };
      return c;
    }
    if (sub.status !== 'pending') {
      out.r = { ok: false, error: 'not pending' };
      return c;
    }
    if (c.awaiting && st.enforce) {
      out.r = { ok: false, error: 'awaiting-artist' };
      return c;
    }
    const at = clock().toISOString();
    const seq = (c.entries.at(-1)?.seq ?? 0) + 1;
    const visitorNumber = c.visitorCount + 1;
    const entry: Entry = {
      seq, id, kind: 'visitor', text: sub.text, display: sub.display, consent: sub.consent,
      submittedAt: sub.receivedAt, approvedAt: at, visitorNumber, status: 'published',
    };
    let milestone: Milestone | null = null;
    if (st.every && visitorNumber % st.every === 0) {
      milestone = {
        n: c.milestones.length + 1, atVisitor: visitorNumber, reachedAt: at,
        triggerSubmittedAt: sub.receivedAt, triggerApprovedAt: at,
      };
    }
    out.r = { ok: true, entry, milestone, already: false };
    return {
      ...c,
      entries: [...c.entries, entry],
      visitorCount: visitorNumber,
      milestones: milestone ? [...c.milestones, milestone] : c.milestones,
      awaiting: milestone ? st.enforce : c.awaiting,
    };
  });
  const result = out.r;
  if (!result.ok) return result;

  // Mark the submission published (idempotent; the composition is the source of truth).
  await update<Submission>(s, key, (cur) => ({ ...(cur ?? sub), status: 'published', seq: result.entry.seq, decidedAt: cur?.decidedAt ?? clock().toISOString() }));
  if (!result.already) {
    await audit(s, 'publish', { id, seq: result.entry.seq, by }, clock);
    if (result.milestone) {
      await audit(s, 'milestone', { n: result.milestone.n, atVisitor: result.milestone.atVisitor }, clock);
      console.log(`[works] ${p}: milestone ${result.milestone.n} reached at visitor contribution ${result.milestone.atVisitor}`);
    }
  }
  return result;
}

export async function reject(s: Store, id: string, reason: string, clock: Clock = now) {
  const found = await findSubmission(s, id);
  if (!found) return { ok: false as const, error: 'not found' };
  let changed = false;
  await update<Submission>(s, found.key, (cur) => {
    const c = cur ?? found.sub;
    if (c.status !== 'pending') return c;
    changed = true;
    return { ...c, status: 'rejected', reason: reason.slice(0, 500), decidedAt: clock().toISOString() };
  });
  if (changed) await audit(s, 'reject', { id }, clock);
  return changed ? { ok: true as const } : { ok: false as const, error: 'not pending' };
}

/** The artist's intervention. Never counts toward the visitors' twelve. */
export async function intervene(s: Store, p: Project, text: string, clock: Clock = now) {
  const t = clean(text);
  if (!t) return { ok: false as const, error: 'empty' };
  let entry: Entry | null = null;
  let resolved: Milestone | null = null;
  await update<Composition>(s, 'composition', (cur) => {
    const c = cur ?? empty(p);
    const at = clock().toISOString();
    const seq = (c.entries.at(-1)?.seq ?? 0) + 1;
    const open = c.milestones.find((m) => !m.resolvedAt);
    entry = {
      seq, id: randomId(), kind: 'artist', text: t, display: null, consent: null,
      submittedAt: at, approvedAt: at, status: 'published', ...(open ? { milestone: open.n } : {}),
    };
    resolved = open ? { ...open, resolvedAt: at, interventionSeq: seq } : null;
    return {
      ...c,
      entries: [...c.entries, entry],
      milestones: c.milestones.map((m) => (resolved && m.n === resolved.n ? resolved : m)),
      awaiting: false,
    };
  });
  await audit(s, 'intervene', { seq: entry!.seq, milestone: resolved ? (resolved as Milestone).n : null }, clock);
  return { ok: true as const, entry: entry!, resolved };
}

/** Removal keeps the sequence number in place (a visible gap); the words are erased. */
export async function removeEntry(s: Store, seq: number, reason: string, clock: Clock = now) {
  let found = false;
  await update<Composition>(s, 'composition', (cur) => {
    if (!cur) return cur as unknown as Composition;
    return {
      ...cur,
      entries: cur.entries.map((e) => {
        if (e.seq !== seq || e.status === 'removed') return e;
        found = true;
        return { ...e, status: 'removed', text: '', display: null, removedAt: clock().toISOString() };
      }),
    };
  });
  if (found) await audit(s, 'remove', { seq, reason: reason.slice(0, 200) }, clock);
  return found;
}

export async function ownsSubmission(sub: Submission, token: string) {
  return Boolean(token) && safeEqual(await sha256(token), sub.receiptHash);
}

export async function withdraw(s: Store, id: string, token: string, clock: Clock = now) {
  const found = await findSubmission(s, id);
  if (!found || !(await ownsSubmission(found.sub, token))) return { ok: false as const, status: 403 };
  let changed = false;
  await update<Submission>(s, found.key, (cur) => {
    const c = cur ?? found.sub;
    if (c.status !== 'pending') return c;
    changed = true;
    return { ...c, status: 'withdrawn', decidedAt: clock().toISOString() };
  });
  if (changed) await audit(s, 'withdraw', { id }, clock);
  return changed ? { ok: true as const } : { ok: false as const, status: 409 };
}

export async function addRequest(s: Store, kind: Request['kind'], seq: number, reason: string, byOwner = false, clock: Clock = now) {
  const at = clock().toISOString();
  const r: Request = { id: randomId(), kind, seq, reason: reason.slice(0, 500), createdAt: at, status: 'open', ...(byOwner ? { byOwner } : {}) };
  await s.setJSON(`req/${at}-${r.id}`, r, { onlyIfNew: true });
  return r;
}

export async function listRequests(s: Store): Promise<{ key: string; req: Request }[]> {
  const keys: string[] = [];
  for await (const page of s.list({ prefix: 'req/', paginate: true })) keys.push(...page.blobs.map((b) => b.key));
  keys.sort();
  return (await Promise.all(keys.map(async (key) => ({ key, req: (await s.get(key, { type: 'json' })) as Request })))).filter((x) => x.req);
}

export async function resolveRequest(s: Store, id: string, status: 'resolved' | 'dismissed', clock: Clock = now) {
  const all = await listRequests(s);
  const hit = all.find((x) => x.req.id === id);
  if (!hit) return false;
  await update<Request>(s, hit.key, (cur) => ({ ...(cur ?? hit.req), status }));
  await audit(s, `request-${status}`, { id, seq: hit.req.seq }, clock);
  return true;
}

export async function listAudit(s: Store, limit = 200) {
  const keys: string[] = [];
  for await (const page of s.list({ prefix: 'audit/', paginate: true })) keys.push(...page.blobs.map((b) => b.key));
  keys.sort();
  const recent = keys.slice(-limit).reverse();
  return Promise.all(recent.map((k) => s.get(k, { type: 'json' })));
}

/** When the artist's window for a milestone ends, under the configured interpretation. */
export function windowFor(m: Milestone, st: Settings) {
  if (!st.windowDays) return null;
  const start = st.windowStartsAt === 'submission' ? m.triggerSubmittedAt
    : st.windowStartsAt === 'approval' ? m.triggerApprovedAt : m.reachedAt;
  const ends = new Date(new Date(start).getTime() + st.windowDays * 86_400_000);
  return { startsAt: start, endsAt: ends.toISOString(), interpretation: st.windowStartsAt, days: st.windowDays };
}
