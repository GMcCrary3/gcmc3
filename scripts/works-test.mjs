// Tests for "unfinished sentence" and "space in between us" against a local
// Netlify Blobs server that behaves like production. Run: npm run test:works
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { BlobsServer } from './_local-blobs.mjs';

const root = new URL('..', import.meta.url).pathname;
const dir = await mkdtemp(join(tmpdir(), 'works-test-'));
const server = new BlobsServer({ directory: dir, token: 'local', port: 0 });
const { port } = await server.start();
process.env.FIELD_BLOBS_EDGE_URL = `http://localhost:${port}`;
process.env.FIELD_ADMIN_TOKEN = 'test-moderation-key-0123456789abcdefghij';

const W = await import(join(root, 'netlify/functions/_lib/works.ts'));
const read = (await import(join(root, 'netlify/functions/works-read.mts'))).default;
const submitFn = (await import(join(root, 'netlify/functions/works-submit.mts'))).default;
const visitor = (await import(join(root, 'netlify/functions/works-visitor.mts'))).default;
const admin = (await import(join(root, 'netlify/functions/works-admin.mts'))).default;
const site = (await import(join(root, 'src/data/site.json'), { with: { type: 'json' } })).default;
const TERMS = site.works.termsVersion;
const ADMIN = { 'x-field-admin-key': process.env.FIELD_ADMIN_TOKEN };

let storeN = 0;
// Every test gets its own fresh store, so results don't depend on order.
const fresh = (p = 'sentence') => { process.env.WORKS_STORE_SUFFIX = `-t${++storeN}`; return W.worksStore(p); };
const sentenceSettings = (over = {}) => ({ ...W.settings('sentence'), open: true, moderation: 'pre', ...over });
const betweenSettings = (over = {}) => ({ ...W.settings('between'), open: true, moderation: 'pre', ...over });
let n = 0;
const body = (extra = {}) => ({ text: `a line nobody else wrote ${++n}`, display: '', agree: TERMS, ...extra });
const call = async (h, path, { method = 'GET', b, headers = {} } = {}) => {
  const res = await h(new Request(`http://x${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: b ? JSON.stringify(b) : undefined }));
  return { status: res.status, data: await res.json() };
};
const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(['✓', name]); }
  catch (e) { results.push(['✗', name, e.message]); console.error(`\n--- FAILED: ${name}\n${e.stack ?? e}\n`); }
};
async function submitMany(s, p, st, k) {
  const ids = [];
  for (let i = 0; i < k; i++) { const r = await W.submit(s, p, st, body()); assert.ok(r.ok, JSON.stringify(r)); ids.push(r.sub.id); }
  return ids;
}

/* ---------------------------------------------------------- the rule of twelve */
await test('the twelfth accepted contribution creates exactly one milestone', async () => {
  const s = fresh(); const st = sentenceSettings();
  const ids = await submitMany(s, 'sentence', st, 12);
  for (const id of ids) assert.ok((await W.approve(s, 'sentence', st, id, 't')).ok);
  const c = await W.readComposition(s, 'sentence');
  assert.equal(c.visitorCount, 12); assert.equal(c.milestones.length, 1);
  assert.equal(c.milestones[0].atVisitor, 12); assert.equal(c.awaiting, true);
  // approving the twelfth again (a retry) must not create a second milestone
  const again = await W.approve(s, 'sentence', st, ids[11], 't');
  assert.ok(again.ok && again.already);
  assert.equal((await W.readComposition(s, 'sentence')).milestones.length, 1);
});

await test('while the artist is awaited, no visitor contribution is published or accepted', async () => {
  const s = fresh(); const st = sentenceSettings();
  const ids = await submitMany(s, 'sentence', st, 13);
  for (const id of ids.slice(0, 12)) await W.approve(s, 'sentence', st, id, 't');
  const r = await W.approve(s, 'sentence', st, ids[12], 't');
  assert.equal(r.ok, false); assert.equal(r.error, 'awaiting-artist');
  const sub = await W.submit(s, 'sentence', st, body());
  assert.equal(sub.ok, false); assert.equal(sub.error, 'awaiting-artist');
});

await test('artist interventions never advance the public count; the next milestone is at 24', async () => {
  const s = fresh(); const st = sentenceSettings();
  const ids = await submitMany(s, 'sentence', st, 12);
  for (const id of ids) await W.approve(s, 'sentence', st, id, 't');
  const i1 = await W.intervene(s, 'sentence', 'the artist, first');
  assert.equal(i1.resolved.n, 1);
  await W.intervene(s, 'sentence', 'the artist again, unprompted');
  let c = await W.readComposition(s, 'sentence');
  assert.equal(c.visitorCount, 12); assert.equal(c.awaiting, false);
  assert.equal(c.entries.filter((e) => e.kind === 'artist').length, 2);
  const more = await submitMany(s, 'sentence', st, 12);
  for (const [i, id] of more.entries()) {
    const r = await W.approve(s, 'sentence', st, id, 't');
    assert.ok(r.ok); assert.equal(Boolean(r.milestone), i === 11, `milestone only on the 24th (i=${i})`);
  }
  c = await W.readComposition(s, 'sentence');
  assert.deepEqual(c.milestones.map((m) => m.atVisitor), [12, 24]);
  assert.deepEqual(c.entries.map((e) => e.seq), Array.from({ length: c.entries.length }, (_, i) => i + 1));
});

await test('rejected and withdrawn contributions never count toward the twelve', async () => {
  const s = fresh(); const st = sentenceSettings();
  const ids = await submitMany(s, 'sentence', st, 16);
  for (const id of ids.slice(0, 3)) assert.ok((await W.reject(s, id, 'no')).ok);
  for (const id of ids.slice(3)) {
    const r = await W.approve(s, 'sentence', st, id, 't');
    if (!r.ok) break;
  }
  const c = await W.readComposition(s, 'sentence');
  assert.equal(c.visitorCount, 12); assert.equal(c.milestones[0].atVisitor, 12);
  assert.ok(!c.entries.some((e) => ids.slice(0, 3).includes(e.id)));
  assert.equal((await W.approve(s, 'sentence', st, ids[0], 't')).error, 'not pending', 'a rejected submission cannot be published later');
});

/* ----------------------------------------------------------------- concurrency */
await test('simultaneous approvals by several moderators: unique numbers, exactly 12, exactly one milestone', async () => {
  const s = fresh(); const st = sentenceSettings();
  const ids = await submitMany(s, 'sentence', st, 30);
  const moderators = [ids, [...ids].reverse(), [...ids.slice(15), ...ids.slice(0, 15)]];
  await Promise.all(moderators.map((order) => Promise.all(order.map((id) => W.approve(s, 'sentence', st, id, 't')))));
  const c = await W.readComposition(s, 'sentence');
  const seqs = c.entries.map((e) => e.seq);
  assert.equal(c.entries.length, 12); assert.equal(new Set(seqs).size, 12);
  assert.deepEqual(seqs, Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(new Set(c.entries.map((e) => e.id)).size, 12, 'no contribution published twice');
  assert.equal(c.milestones.length, 1);
});

await test('100 simultaneous submissions are all stored; none is published before review', async () => {
  const s = fresh(); const st = sentenceSettings();
  const rs = await Promise.all(Array.from({ length: 100 }, () => W.submit(s, 'sentence', st, body())));
  assert.ok(rs.every((r) => r.ok));
  assert.equal(new Set(rs.map((r) => r.sub.id)).size, 100);
  assert.equal((await W.listSubmissions(s)).length, 100);
  assert.equal((await W.readComposition(s, 'sentence')).entries.length, 0);
});

await test('immediate publication (if chosen): simultaneous submissions still number cleanly and stop at the milestone', async () => {
  const s = fresh(); const st = sentenceSettings({ moderation: 'post' });
  const rs = await Promise.all(Array.from({ length: 40 }, () => W.submit(s, 'sentence', st, body())));
  const ok = rs.filter((r) => r.ok);
  const c = await W.readComposition(s, 'sentence');
  assert.equal(c.entries.length, 12); assert.equal(c.milestones.length, 1);
  assert.deepEqual(c.entries.map((e) => e.seq), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(ok.filter((r) => r.published).length, 12);
  assert.ok(rs.every((r) => r.ok || r.error === 'awaiting-artist'), 'later ones are refused, not lost silently');
});

/* ---------------------------------------------------- order, removal, privacy */
await test('moderation never silently reorders: removal leaves the number in place', async () => {
  const s = fresh(); const st = sentenceSettings();
  const ids = await submitMany(s, 'sentence', st, 5);
  for (const id of ids) await W.approve(s, 'sentence', st, id, 't');
  assert.ok(await W.removeEntry(s, 3, 'request'));
  const more = await submitMany(s, 'sentence', st, 1);
  await W.approve(s, 'sentence', st, more[0], 't');
  const c = await W.readComposition(s, 'sentence');
  assert.deepEqual(c.entries.map((e) => e.seq), [1, 2, 3, 4, 5, 6]);
  assert.equal(c.entries[2].status, 'removed'); assert.equal(c.entries[2].text, '');
  assert.equal(c.visitorCount, 6, 'a removal does not move the milestone count backwards');
});

await test('publication order is approval order, not submission order', async () => {
  const s = fresh(); const st = sentenceSettings();
  const [a, b, c] = await submitMany(s, 'sentence', st, 3);
  await W.approve(s, 'sentence', st, c, 't'); await W.approve(s, 'sentence', st, a, 't');
  const comp = await W.readComposition(s, 'sentence');
  assert.deepEqual(comp.entries.map((e) => e.id), [c, a]);
  const subs = await W.listSubmissions(s);
  assert.deepEqual(subs.map((x) => x.id), [a, b, c], 'submission order is still kept');
});

await test('the public view never shows pending, rejected or withdrawn words, or private fields', async () => {
  const s = fresh(); const st = sentenceSettings();
  const [a, b, c, d] = await submitMany(s, 'sentence', st, 4);
  const subs = Object.fromEntries((await W.listSubmissions(s)).map((x) => [x.id, x.text]));
  await W.approve(s, 'sentence', st, a, 't'); await W.reject(s, b, 'x');
  const own = await W.submit(s, 'sentence', st, body());
  await W.withdraw(s, own.sub.id, own.token);
  const view = JSON.stringify(W.publicView(await W.readComposition(s, 'sentence'), st));
  assert.ok(view.includes(subs[a]));
  for (const id of [b, c, d]) assert.ok(!view.includes(subs[id]), 'unpublished text leaked');
  assert.ok(!/receipt|consent|reason|submittedAt/.test(view), 'private field leaked');
});

/* ------------------------------------------------------------------- consent */
await test('consent: refused without agreement or with an out-of-date version; recorded on publication', async () => {
  const s = fresh(); const st = sentenceSettings();
  assert.equal((await W.submit(s, 'sentence', st, body({ agree: '' }))).error, 'terms');
  assert.equal((await W.submit(s, 'sentence', st, body({ agree: '2020-01-01' }))).error, 'terms');
  const r = await W.submit(s, 'sentence', st, body({ display: 'a. reader' }));
  assert.equal(r.sub.consent, TERMS);
  await W.approve(s, 'sentence', st, r.sub.id, 't');
  const e = (await W.readComposition(s, 'sentence')).entries[0];
  assert.equal(e.consent, TERMS); assert.equal(e.display, 'a. reader');
});

await test('credit: anonymous by default; the artist\'s name and contact details refused as a credit', async () => {
  const s = fresh(); const st = sentenceSettings();
  assert.equal((await W.submit(s, 'sentence', st, body())).sub.display, null);
  assert.equal((await W.submit(s, 'sentence', st, body({ display: 'giles' }))).error, 'impersonation');
  assert.equal((await W.submit(s, 'sentence', st, body({ display: 'me@home' }))).error, 'contact details');
  assert.ok(!(await W.submit(s, 'sentence', st, body({ display: 'me@x.com' }))).ok, 'an email as a credit is refused');
});

/* ------------------------------------------------------- screening & limits */
await test('screening, duplicates and the technical length safeguard', async () => {
  const s = fresh(); const st = sentenceSettings({ maxChars: 50 });
  assert.equal((await W.submit(s, 'sentence', st, body({ text: 'fuck this' }))).error, 'language');
  assert.equal((await W.submit(s, 'sentence', st, body({ text: 'see www.spam.com' }))).error, 'links');
  assert.equal((await W.submit(s, 'sentence', st, body({ text: 'x'.repeat(51) }))).error, 'too long');
  assert.equal((await W.submit(s, 'sentence', st, body({ text: '   ' }))).error, 'empty');
  const held = await W.submit(s, 'sentence', st, body({ text: 'i will kill the quiet' }));
  assert.equal(held.sub.held, 'violence');
  await W.submit(s, 'sentence', st, body({ text: 'the same words' }));
  assert.equal((await W.submit(s, 'sentence', st, body({ text: 'The  same words' }))).error, 'duplicate');
});

/* ------------------------------------------------------- owners and requests */
await test('only the owner can withdraw, and only while pending; removal requests need the owner key', async () => {
  const s = fresh(); const st = sentenceSettings();
  const r = await W.submit(s, 'sentence', st, body());
  assert.equal((await W.withdraw(s, r.sub.id, 'wrong')).status, 403);
  const r2 = await W.submit(s, 'sentence', st, body());
  await W.approve(s, 'sentence', st, r2.sub.id, 't');
  assert.equal((await W.withdraw(s, r2.sub.id, r2.token)).status, 409, 'published words are not withdrawn this way');
  assert.ok((await W.withdraw(s, r.sub.id, r.token)).ok);
});

/* ------------------------------------------------------- the twelve-day window */
await test('the artist window follows the configured interpretation', async () => {
  const m = { n: 1, atVisitor: 12, reachedAt: '2026-11-10T12:00:00.000Z', triggerSubmittedAt: '2026-11-01T09:00:00.000Z', triggerApprovedAt: '2026-11-10T12:00:00.000Z' };
  assert.equal(W.windowFor(m, sentenceSettings({ windowStartsAt: 'milestone' })).endsAt, '2026-11-22T12:00:00.000Z');
  assert.equal(W.windowFor(m, sentenceSettings({ windowStartsAt: 'submission' })).endsAt, '2026-11-13T09:00:00.000Z');
  assert.equal(W.windowFor(m, sentenceSettings({ windowDays: null })), null);
});

/* --------------------------------------------------------- space in between us */
await test('space in between us: no artist turn is enforced until approved', async () => {
  const s = fresh('between'); const st = betweenSettings();
  assert.equal(st.enforce, false);
  const ids = await submitMany(s, 'between', st, 7);
  for (const id of ids) assert.ok((await W.approve(s, 'between', st, id, 't')).ok);
  const c = await W.readComposition(s, 'between');
  assert.equal(c.awaiting, false); assert.equal(c.milestones.length, 0);
});

await test('space in between us: with a frequency of 3 enforced, the artist is the fourth voice', async () => {
  const s = fresh('between'); const st = betweenSettings({ every: 3, enforce: true });
  const ids = await submitMany(s, 'between', st, 4);
  for (const id of ids.slice(0, 3)) await W.approve(s, 'between', st, id, 't');
  assert.equal((await W.approve(s, 'between', st, ids[3], 't')).error, 'awaiting-artist');
  await W.intervene(s, 'between', 'between you');
  assert.ok((await W.approve(s, 'between', st, ids[3], 't')).ok);
  const kinds = (await W.readComposition(s, 'between')).entries.map((e) => e.kind);
  assert.deepEqual(kinds, ['visitor', 'visitor', 'visitor', 'artist', 'visitor']);
});

/* ------------------------------------------------------------ http endpoints */
await test('endpoints: success only after storage; storage failure is reported, never confirmed', async () => {
  process.env.WORKS_STORE_SUFFIX = `-http${++storeN}`;
  const ok = await call(submitFn, '/api/works/submit', { method: 'POST', b: { project: 'unfinished-sentence', ...body() } });
  assert.equal(ok.status, 201); assert.equal(ok.data.status, 'pending'); assert.ok(ok.data.token);
  const saved = process.env.FIELD_BLOBS_EDGE_URL;
  process.env.FIELD_BLOBS_EDGE_URL = 'http://localhost:9'; // nothing listens here
  const bad = await call(submitFn, '/api/works/submit', { method: 'POST', b: { project: 'unfinished-sentence', ...body() } });
  process.env.FIELD_BLOBS_EDGE_URL = saved;
  assert.equal(bad.status, 503); assert.ok(!bad.data.id && !bad.data.token);
});

await test('endpoints: moderation needs the key; visitors cannot reach it', async () => {
  assert.equal((await call(admin, '/api/works/admin?project=unfinished-sentence')).status, 401);
  assert.equal((await call(admin, '/api/works/admin?project=unfinished-sentence', { headers: { 'x-field-admin-key': 'nope' } })).status, 401);
  const r = await call(admin, '/api/works/admin?project=unfinished-sentence', { headers: ADMIN });
  assert.equal(r.status, 200); assert.ok(Array.isArray(r.data.queue));
  assert.ok(!JSON.stringify(r.data).includes('receiptHash'), 'owner keys never leave the server');
});

await test('endpoints: full cycle through http (submit → approve → read → receipt → report)', async () => {
  process.env.WORKS_STORE_SUFFIX = `-http${++storeN}`;
  const sub = await call(submitFn, '/api/works/submit', { method: 'POST', b: { project: 'space-in-between-us', ...body() } });
  const before = await call(read, '/api/works/space-in-between-us');
  assert.equal(before.data.entries.length, 0);
  const ap = await call(admin, '/api/works/admin', { method: 'POST', headers: ADMIN, b: { project: 'space-in-between-us', action: 'approve', ids: [sub.data.id] } });
  assert.match(ap.data.results[sub.data.id], /published #1/);
  const after = await call(read, '/api/works/space-in-between-us');
  assert.equal(after.data.entries.length, 1);
  const rc = await call(read, `/api/works/receipt?project=space-in-between-us&id=${sub.data.id}`, { headers: { 'x-works-key': sub.data.token } });
  assert.equal(rc.data.status, 'published'); assert.equal(rc.data.seq, 1);
  const rep = await call(visitor, '/api/works/report', { method: 'POST', b: { project: 'space-in-between-us', seq: 1, reason: 'spam' } });
  assert.equal(rep.status, 200);
  const ov = await call(admin, '/api/works/admin?project=space-in-between-us', { headers: ADMIN });
  assert.equal(ov.data.requests.length, 1);
  const rr = await call(visitor, '/api/works/request-removal', { method: 'POST', b: { project: 'space-in-between-us', seq: 1, id: sub.data.id, token: 'wrong' } });
  assert.equal(rr.status, 403);
  const audit = await call(admin, '/api/works/admin?project=space-in-between-us&view=audit', { headers: ADMIN });
  assert.ok(audit.data.audit.some((a) => a.action === 'publish'));
});

await server.stop();
await rm(dir, { recursive: true, force: true });
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === '✗').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
