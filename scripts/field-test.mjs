// Automated tests for the field's server logic, against a local Netlify Blobs
// server. Run: npm run test:field
// Covers: consent, screening, duplicates, pre-moderation, owner view, reports,
// moderation, removal, concurrency, and filing that is interrupted at every
// step or races with moderation.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { BlobsServer } from './_local-blobs.mjs';

const root = new URL('..', import.meta.url).pathname;
const dir = await mkdtemp(join(tmpdir(), 'field-test-'));
const server = new BlobsServer({ directory: dir, token: 'local', port: 0 });
const { port } = await server.start();
process.env.FIELD_BLOBS_EDGE_URL = `http://localhost:${port}`;
process.env.FIELD_ADMIN_TOKEN = 'test-moderation-key-0123456789abcdefghij';

const lib = await import(join(root, 'netlify/functions/_lib/field.ts'));
const leave = (await import(join(root, 'netlify/functions/field-leave.mts'))).default;
const actions = (await import(join(root, 'netlify/functions/field-actions.mts'))).default;
const read = (await import(join(root, 'netlify/functions/field-read.mts'))).default;
const moderate = (await import(join(root, 'netlify/functions/field-moderate.mts'))).default;
const site = (await import(join(root, 'src/data/site.json'), { with: { type: 'json' } })).default;
const TERMS = site.field.termsVersion;
const ADMIN = { 'x-field-admin-key': process.env.FIELD_ADMIN_TOKEN };

const call = async (handler, path, { method = 'GET', body, headers = {} } = {}) => {
  const res = await handler(new Request(`http://x${path}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, data: await res.json() };
};
let seq = 0;
const composition = (word = 'home', extra = {}) => ({
  text: word, aspect: 'landscape', base: 12, agree: TERMS,
  glyphs: [...word].map((c, i) => ({ c, x: 10 + i * 8, y: 40 + (seq++ % 40), r: i * 7, s: 1, f: 0, t: 0 })),
  ...extra,
});
const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(['✓', name]); } catch (e) { results.push(['✗', name, e.message]); }
};
const fileAll = async () => { let n; do { n = await lib.fileWaiting(lib.store()); } while (n > 0); };
const allFiled = async () => {
  const s = lib.store();
  const pages = Math.ceil((await lib.filedCount(s)) / lib.PAGE_SIZE);
  const out = [];
  for (let p = 0; p < pages; p++) out.push(...(await lib.readPage(s, p)));
  return out;
};

await test('consent: refused without agreeing to the current terms', async () => {
  const r = await call(leave, '/api/field/leave', { method: 'POST', body: composition('home', { agree: '' }) });
  assert.equal(r.status, 422); assert.equal(r.data.error, 'terms');
});
await test('screening: profanity, links, emails, phone numbers refused', async () => {
  for (const [w, why] of [['fuck', 'language'], ['site.com', 'links'], ['a@b', 'contact details'], ['5551234567', 'contact details']]) {
    const r = await call(leave, '/api/field/leave', { method: 'POST', body: composition(w) });
    assert.equal(r.data.error, why, w);
  }
});
let homeId, homeToken;
await test('pre-moderation: new pieces wait for review and are not public', async () => {
  const r = await call(leave, '/api/field/leave', { method: 'POST', body: composition('home') });
  assert.equal(r.status, 201); assert.equal(r.data.status, 'pending');
  homeId = r.data.id; homeToken = r.data.token;
  const pub = await call(read, `/api/field/piece?id=${homeId}`);
  assert.equal(pub.status, 404);
  const list = await call(read, '/api/field');
  assert.equal(list.data.pieces.length, 0);
});
await test('owner can see their own piece while it awaits review', async () => {
  const r = await call(read, `/api/field/piece?id=${homeId}`, { headers: { 'x-field-key': homeToken } });
  assert.equal(r.status, 200); assert.equal(r.data.status, 'awaiting review');
  const wrong = await call(read, `/api/field/piece?id=${homeId}`, { headers: { 'x-field-key': 'nope' } });
  assert.equal(wrong.status, 404);
});
await test('duplicates: the same composition cannot be left twice in a day', async () => {
  const body = composition('again');
  assert.equal((await call(leave, '/api/field/leave', { method: 'POST', body })).status, 201);
  assert.equal((await call(leave, '/api/field/leave', { method: 'POST', body })).data.error, 'duplicate');
});
await test('screening: threats and impersonation of the artist are held with a reason', async () => {
  for (const [w, why] of [['kill', 'violence'], ['giles', 'impersonation'], ['official', 'impersonation']]) {
    const r = await call(leave, '/api/field/leave', { method: 'POST', body: composition(w) });
    assert.equal(r.status, 201, w);
    const all = (await call(moderate, '/api/field/moderate', { headers: ADMIN })).data.pieces;
    assert.equal(all.find((p) => p.id === r.data.id)?.held, why, w);
  }
});
await test('moderation: refused without the key, or with a wrong key', async () => {
  assert.equal((await call(moderate, '/api/field/moderate')).status, 401);
  assert.equal((await call(moderate, '/api/field/moderate', { headers: { 'x-field-admin-key': 'wrong' } })).status, 401);
});
await test('moderation: approving makes a piece public', async () => {
  const r = await call(moderate, '/api/field/moderate', { method: 'POST', headers: ADMIN, body: { id: homeId, action: 'show' } });
  assert.equal(r.data.status, 'visible');
  assert.equal((await call(read, `/api/field/piece?id=${homeId}`)).status, 200);
});
await test('reports: a threat report hides a piece at once; others after three', async () => {
  await call(actions, '/api/field/report', { method: 'POST', body: { id: homeId, reason: 'threat' } });
  assert.equal((await call(read, `/api/field/piece?id=${homeId}`)).status, 404);
  await call(moderate, '/api/field/moderate', { method: 'POST', headers: ADMIN, body: { id: homeId, action: 'show' } });
  for (let i = 0; i < 2; i++) await call(actions, '/api/field/report', { method: 'POST', body: { id: homeId, reason: 'spam' } });
  assert.equal((await call(read, `/api/field/piece?id=${homeId}`)).status, 200, 'still visible after 2');
  await call(actions, '/api/field/report', { method: 'POST', body: { id: homeId, reason: 'spam' } });
  assert.equal((await call(read, `/api/field/piece?id=${homeId}`)).status, 404, 'hidden after 3');
  await call(moderate, '/api/field/moderate', { method: 'POST', headers: ADMIN, body: { id: homeId, action: 'show' } });
});
await test('bulk moderation approves many at once', async () => {
  const review = (await call(moderate, '/api/field/moderate', { headers: ADMIN })).data.pieces.map((p) => p.id);
  const r = await call(moderate, '/api/field/moderate', { method: 'POST', headers: ADMIN, body: { ids: review, action: 'show' } });
  assert.ok(Object.values(r.data.results).every((s) => s === 'visible'));
});
await test('removal: wrong key refused; right key erases the letters', async () => {
  assert.equal((await call(actions, '/api/field/remove', { method: 'POST', body: { id: homeId, token: 'x' } })).status, 403);
  assert.equal((await call(actions, '/api/field/remove', { method: 'POST', body: { id: homeId, token: homeToken } })).status, 200);
  assert.equal((await call(read, `/api/field/piece?id=${homeId}`)).status, 404);
  const { piece } = await lib.readOne(lib.store(), homeId);
  assert.equal(piece.glyphs.length, 0); assert.equal(piece.status, 'removed');
});
await test('concurrency: 300 simultaneous submissions are all kept, numbered without gaps', async () => {
  const before = await lib.total(lib.store());
  const rs = await Promise.all(Array.from({ length: 300 }, (_, i) =>
    call(leave, '/api/field/leave', { method: 'POST', body: composition(`w${i}`) })));
  assert.ok(rs.every((r) => r.status === 201));
  await fileAll();
  const filed = await allFiled();
  const ns = filed.map((p) => p.n).sort((a, b) => a - b);
  assert.equal(filed.length, before + 300);
  assert.equal(new Set(filed.map((p) => p.id)).size, filed.length, 'no duplicate ids');
  assert.deepEqual(ns, Array.from({ length: ns.length }, (_, i) => i + 1), 'numbers 1..N');
  assert.equal((await lib.waitingKeys(lib.store())).length, 0);
});

// Interrupt filing after k storage writes, for every k, then let it recover.
await test('filing survives being interrupted at any step (no loss, no duplicates)', async () => {
  const s = lib.store();
  for (let k = 1; k <= 14; k++) {
    for (let i = 0; i < 7; i++) await call(leave, '/api/field/leave', { method: 'POST', body: composition(`crash${k}x${i}`) });
    const expected = (await lib.total(s));
    // Wrap store writes to throw after k writes.
    let writes = 0;
    const proto = Object.getPrototypeOf(s);
    const orig = { setJSON: proto.setJSON, delete: proto.delete };
    const boom = (fn) => async function (...a) { if (++writes > k && a[0] !== 'meta/lock') throw new Error('simulated crash'); return fn.apply(this, a); };
    proto.setJSON = boom(orig.setJSON); proto.delete = boom(orig.delete);
    try { await lib.fileWaiting(s); } catch { /* crashed */ }
    proto.setJSON = orig.setJSON; proto.delete = orig.delete;
    await s.delete('meta/lock'); // a crashed run's lease would expire; skip the wait
    await fileAll();
    const filed = await allFiled();
    assert.equal(filed.length, expected, `k=${k}: count`);
    assert.equal(new Set(filed.map((p) => p.id)).size, filed.length, `k=${k}: duplicates`);
    const ns = filed.map((p) => p.n).sort((a, b) => a - b);
    assert.deepEqual(ns, Array.from({ length: ns.length }, (_, i) => i + 1), `k=${k}: numbering`);
    assert.equal(await lib.filedCount(s), expected, `k=${k}: counter`);
  }
});

await test('a moderation decision made during filing is kept', async () => {
  const s = lib.store();
  for (let round = 0; round < 20; round++) {
    const r = await call(leave, '/api/field/leave', { method: 'POST', body: composition(`race${round}`) });
    await Promise.all([
      lib.fileWaiting(s),
      (async () => { await new Promise((ok) => setTimeout(ok, Math.random() * 30));
        await call(moderate, '/api/field/moderate', { method: 'POST', headers: ADMIN, body: { id: r.data.id, action: 'hide' } }); })(),
    ]);
    await s.delete('meta/lock');
    await fileAll();
    const { piece } = await lib.readOne(s, r.data.id);
    assert.equal(piece.status, 'hidden', `round ${round}`);
    const copies = (await allFiled()).filter((p) => p.id === r.data.id);
    assert.equal(copies.length, 1); assert.equal(copies[0].status, 'hidden', `round ${round} page copy`);
  }
});

await test('a second filing run cannot start while one holds the lease', async () => {
  const s = lib.store();
  await call(leave, '/api/field/leave', { method: 'POST', body: composition('lease') });
  await s.setJSON('meta/lock', { until: Date.now() + 30_000 });
  assert.equal(await lib.fileWaiting(s), 0);
  await s.delete('meta/lock');
  assert.equal(await lib.fileWaiting(s), 1);
});

await test('health reports waiting pieces, and flags a stalled interrupted batch', async () => {
  const s = lib.store();
  await call(leave, '/api/field/leave', { method: 'POST', body: composition('health') });
  let h = await lib.health(s);
  assert.equal(h.waiting, 1); assert.equal(h.stalled, false);
  await s.setJSON('meta/batch', { items: [], endN: await lib.filedCount(s) });
  h = await lib.health(s);
  assert.equal(h.stalled, true, 'journal without a running filer should be flagged');
  await fileAll();
  h = await lib.health(s);
  assert.equal(h.waiting, 0); assert.equal(h.interruptedBatch, 0); assert.equal(h.stalled, false);
});

await server.stop();
await rm(dir, { recursive: true, force: true });
for (const r of results) console.log(r.join('  '));
const failed = results.filter((r) => r[0] === '✗').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
