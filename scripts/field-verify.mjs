// Verifies the field on a DEPLOYED Netlify site, before launch.
//
//   node scripts/field-verify.mjs https://<deploy-url> <moderation-key> [prelaunch-password]
//
// If the prelaunch gate is on (PRELAUNCH_PASSWORD set in Netlify), pass the
// password as the third argument; the script also checks that the site
// refuses visitors without it.
// Run it against a deploy preview or branch deploy first: those use separate
// storage ("field-preview"), so the real field is untouched. Everything this
// script creates is hidden or removed again before it finishes.
// Note: scheduled filing runs only on the published production deploy, so on a
// preview the script triggers filing itself through the moderation endpoint.
import assert from 'node:assert/strict';

const [base, key, gatePassword] = process.argv.slice(2);
if (!base || !key) {
  console.error('usage: node scripts/field-verify.mjs https://<deploy-url> <moderation-key>');
  process.exit(2);
}
const url = (p) => new URL(p, base).href;
const ADMIN = { 'x-field-admin-key': key };
const GATE = gatePassword ? { authorization: `Basic ${Buffer.from(`preview:${gatePassword}`).toString('base64')}` } : {};
const get = (path) => fetch(url(path), { headers: GATE });
const req = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const res = await fetch(url(path), {
    method, headers: { 'content-type': 'application/json', ...GATE, ...headers }, body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* not json */ }
  return { status: res.status, data, headers: res.headers };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = async (name, fn) => {
  try { const note = await fn(); results.push(['✓', name, note ?? '']); } catch (e) { results.push(['✗', name, e.message]); }
};

const html = await (await get('/')).text();
if (!gatePassword && (await fetch(url('/'))).status === 401) {
  console.error('The site asks for a password (prelaunch gate). Pass it as the third argument.');
  process.exit(2);
}
const terms = (await (await get('/abstract/')).text()).match(/data-agree[^>]*value="([^"]+)"/)?.[1]
  ?? html.match(/terms version (\d{4}-\d{2}-\d{2})/)?.[1];
const composition = (w, i = 0) => ({
  text: w, aspect: 'landscape', base: 12, agree: terms,
  glyphs: [...w].map((c, j) => ({ c, x: 15 + j * 9, y: 35 + i, r: j * 9 + i, s: 1, f: 0, t: 0 })),
});
const mine = [];

if (gatePassword) {
  await check('prelaunch gate refuses visitors without the password (pages and API)', async () => {
    for (const p of ['/', '/exhibition/', '/field/', '/api/field', '/robots.txt']) {
      const r = await fetch(url(p));
      assert.equal(r.status, 401, `${p} returned ${r.status}`);
    }
    const wrong = await fetch(url('/'), { headers: { authorization: `Basic ${Buffer.from('x:wrong').toString('base64')}` } });
    assert.equal(wrong.status, 401, 'wrong password accepted');
  });
}
await check('HTTPS and security headers', async () => {
  const r = await get('/');
  assert.ok(url('/').startsWith('https://'), 'not https');
  assert.ok(r.headers.get('strict-transport-security'), 'no HSTS');
  return r.headers.get('strict-transport-security');
});
await check('site is hidden from search engines while prelaunch is on', async () => {
  const robots = await (await get('/robots.txt')).text();
  assert.match(robots, /Disallow: \/\s*$/m);
});
await check('field API reachable (persistent storage readable)', async () => {
  const r = await req('/api/field'); assert.equal(r.status, 200); return `total ${r.data.total}`;
});
await check('moderation refuses a wrong key (authenticated on the server)', async () => {
  const r = await req('/api/field/moderate', { headers: { 'x-field-admin-key': 'wrong' } }); assert.equal(r.status, 401);
});
await check('moderation accepts the key', async () => {
  const r = await req('/api/field/moderate', { headers: ADMIN }); assert.equal(r.status, 200);
});
await check('a piece cannot be left without agreeing to the terms', async () => {
  const r = await req('/api/field/leave', { method: 'POST', body: { ...composition('verify'), agree: '' } });
  assert.equal(r.status, 422);
});
let one;
await check('a piece can be left (and waits for review under pre-moderation)', async () => {
  const r = await req('/api/field/leave', { method: 'POST', body: composition(`verify${Date.now() % 100000}`) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  one = r.data; mine.push(one);
  return `status ${one.status}`;
});
await check('the owner can see it while it awaits review; others cannot', async () => {
  const own = await req(`/api/field/piece?id=${one.id}`, { headers: { 'x-field-key': one.token } });
  assert.equal(own.status, 200);
  if (one.status === 'pending') assert.equal((await req(`/api/field/piece?id=${one.id}`)).status, 404);
});
await check('approve → public; report (threat) → hidden at once', async () => {
  await req('/api/field/moderate', { method: 'POST', headers: ADMIN, body: { id: one.id, action: 'show' } });
  assert.equal((await req(`/api/field/piece?id=${one.id}`)).status, 200);
  await req('/api/field/report', { method: 'POST', body: { id: one.id, reason: 'threat' } });
  assert.equal((await req(`/api/field/piece?id=${one.id}`)).status, 404);
});
await check('rate limiting stops rapid repeated submissions', async () => {
  const rs = [];
  for (let i = 0; i < 7; i++) rs.push(await req('/api/field/leave', { method: 'POST', body: composition(`rate${Date.now() % 100000}x${i}`, i) }));
  rs.filter((r) => r.status === 201).forEach((r) => mine.push(r.data));
  const limited = rs.filter((r) => r.status === 429).length;
  assert.ok(limited > 0, `no 429 among ${rs.map((r) => r.status).join(',')}`);
  return `${limited} of 7 limited`;
});
let selftest = [];
await check('100 simultaneous writes are all stored', async () => {
  const r = await req('/api/field/moderate', { method: 'POST', headers: ADMIN, body: { action: 'selftest', count: 100 } });
  assert.equal(r.status, 200); selftest = r.data.ids; assert.equal(selftest.length, 100);
});
await check('filing keeps every piece, numbered without gaps or duplicates', async () => {
  for (let i = 0; i < 6; i++) {
    const f = await req('/api/field/moderate', { method: 'POST', headers: ADMIN, body: { action: 'file' } });
    if (f.data.filed === 0) break;
    await sleep(500);
  }
  const all = [];
  const recent = await req('/api/field/moderate?view=recent', { headers: ADMIN });
  for (let p = recent.data.pages - 1; p >= 0; p--) {
    const page = await req(`/api/field/moderate?view=recent&page=${p}`, { headers: ADMIN });
    all.push(...page.data.pieces);
  }
  const ns = all.map((p) => p.n).filter(Boolean).sort((a, b) => a - b);
  assert.equal(new Set(all.map((p) => p.id)).size, all.length, 'duplicate ids');
  assert.deepEqual(ns, Array.from({ length: ns.length }, (_, i) => i + 1), 'numbering has gaps');
  for (const id of selftest) assert.ok(all.some((p) => p.id === id), `missing ${id}`);
  return `${ns.length} filed`;
});
await check('removal by the owner erases the piece', async () => {
  for (const m of mine) {
    const r = await req('/api/field/remove', { method: 'POST', body: { id: m.id, token: m.token } });
    assert.ok(r.status === 200 || r.status === 429, `remove ${r.status}`);
    if (r.status === 429) { await sleep(61_000); await req('/api/field/remove', { method: 'POST', body: { id: m.id, token: m.token } }); }
  }
  assert.equal((await req(`/api/field/piece?id=${one.id}`, { headers: { 'x-field-key': one.token } })).status, 404);
});
await check('scheduled filing is healthy (run on production; previews have no schedule)', async () => {
  const h = (await req('/api/field/moderate?view=health', { headers: ADMIN })).data;
  assert.equal(h.stalled, false, JSON.stringify(h));
  return `waiting ${h.waiting}, oldest ${h.oldestWaitingSeconds}s`;
});
await check('test pieces cleaned up (hidden)', async () => {
  const r = await req('/api/field/moderate', { method: 'POST', headers: ADMIN, body: { ids: selftest, action: 'hide' } });
  assert.equal(r.status, 200);
});

for (const r of results) console.log(r.filter(Boolean).join('  '));
const failed = results.filter((r) => r[0] === '✗').length;
console.log(`\n${results.length - failed} passed, ${failed} failed  (${base})`);
process.exit(failed ? 1 : 0);
