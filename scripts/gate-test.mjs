// Tests the prelaunch privacy gate (netlify/edge-functions/prelaunch-gate.ts). Run: npm run test:gate
import assert from 'node:assert/strict';
const env = {};
globalThis.Netlify = { env: { get: (k) => env[k] } };
const gate = (await import(new URL('../netlify/edge-functions/prelaunch-gate.ts', import.meta.url).href)).default;
const ctx = { next: async () => new Response('page', { status: 200, headers: { 'cache-control': 'public, max-age=60' } }) };
const basic = (p) => ({ authorization: 'Basic ' + Buffer.from('anyone:' + p).toString('base64') });
const run = (path, headers = {}) => gate(new Request('https://x' + path, { headers }), ctx);
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// Closed by default: nothing configured → nobody gets in.
ok((await run('/')).status === 503, 'unconfigured deploy must be closed');
ok((await run('/api/field')).status === 503, 'unconfigured API must be closed');

// Password set.
env.PRELAUNCH_PASSWORD = 'correct horse battery staple';
let r = await run('/');
ok(r.status === 401 && /Basic/.test(r.headers.get('www-authenticate')), 'asks for the password');
ok((await run('/api/field')).status === 401, 'API gated');
ok((await run('/', basic('wrong'))).status === 401, 'wrong password refused');
ok((await run('/', { authorization: 'Basic %%%' })).status === 401, 'garbage refused');
r = await run('/', basic(env.PRELAUNCH_PASSWORD));
ok(r.status === 200 && r.headers.get('cache-control') === 'private, no-store' && /noindex/.test(r.headers.get('x-robots-tag')), 'right password admitted, not cached publicly');
ok((await run('/api/field/moderate', { ...basic(env.PRELAUNCH_PASSWORD), 'x-field-admin-key': 'k' })).status === 200, 'gate + moderation header coexist');
ok(!(await (await run('/')).text()).includes(env.PRELAUNCH_PASSWORD), 'password never echoed');

// Launch: only an explicit flag opens the site.
env.PUBLIC_LAUNCH = 'yes';
ok((await run('/')).status === 401, 'anything but "true" keeps it closed');
env.PUBLIC_LAUNCH = 'true';
ok((await run('/')).status === 200, 'PUBLIC_LAUNCH=true opens the site');

console.log(`gate: ${n} checks passed`);
