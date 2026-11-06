// Local preview of the whole site *including the field*: serves dist/ and runs
// the Netlify functions against a local Netlify Blobs server.
//   npm run build && npm run field:dev   →  http://localhost:8888
// Data is kept in .field-data/ (git-ignored). Moderation key: "local-dev-moderation-token-0123456789abcdef".
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { BlobsServer } from './_local-blobs.mjs';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const port = Number(process.env.PORT ?? 8888);

await mkdir(join(root, '.field-data'), { recursive: true });
const blobs = new BlobsServer({ directory: join(root, '.field-data'), token: 'local', port: 0 });
const { port: blobsPort } = await blobs.start();
process.env.FIELD_BLOBS_EDGE_URL = `http://localhost:${blobsPort}`;
process.env.FIELD_BLOBS_TOKEN = 'local';
process.env.FIELD_ADMIN_TOKEN ??= 'local-dev-moderation-token-0123456789abcdef';

const fns = await Promise.all(
  ['field-read', 'field-leave', 'field-actions', 'field-moderate', 'works-read', 'works-submit', 'works-visitor', 'works-admin'].map(async (name) => {
    const mod = await import(join(root, 'netlify/functions', `${name}.mts`));
    const paths = [mod.config.path].flat();
    return { handler: mod.default, paths, methods: mod.config.method };
  }),
);

// Simulate the scheduled filing function (once a minute on Netlify; every 5s here).
const { fileWaiting, store } = await import(join(root, 'netlify/functions/_lib/field.ts'));
let filing = false;
setInterval(async () => {
  if (filing) return;
  filing = true;
  try { const n = await fileWaiting(store()); if (n) console.log(`filed ${n}`); }
  catch (e) { console.error('filing failed', e); }
  finally { filing = false; }
}, 5000);

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.yml': 'text/yaml',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const fn = fns.find((f) => f.paths.includes(url.pathname) && f.methods.includes(req.method));
  if (fn) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    try {
      const response = await fn.handler(request, {});
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      res.writeHead(500).end('function error');
    }
    return;
  }
  let file = normalize(join(dist, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/html' }).end(await readFile(join(dist, '404.html')).catch(() => 'not found'));
  }
}).listen(port, () => console.log(`site + field on http://localhost:${port}`));
