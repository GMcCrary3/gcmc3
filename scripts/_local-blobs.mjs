// A local Netlify Blobs server that behaves like production in the ways the
// field depends on: reads return ETags, ETags change with content, and
// conditional writes are atomic (the stock local server checks then writes,
// so two writers can both "win").
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BlobsServer } from '@netlify/blobs/server';

BlobsServer.generateETag = async (filePath) => {
  try {
    return `"${createHash('sha256').update(await readFile(filePath)).digest('hex')}"`;
  } catch {
    return '';
  }
};

const originalGet = BlobsServer.prototype.get;
BlobsServer.prototype.get = async function (req) {
  const res = await originalGet.call(this, req);
  if (res.status !== 200) return res;
  const { dataPath } = this.getLocalPaths(new URL(req.url ?? '', this.address));
  const headers = new Headers(res.headers);
  if (dataPath) headers.set('etag', await BlobsServer.generateETag(dataPath));
  return new Response(res.body, { status: res.status, headers });
};

let queue = Promise.resolve();
const serialised = (fn) =>
  function (...args) {
    const run = queue.then(() => fn.apply(this, args));
    queue = run.catch(() => {});
    return run;
  };
BlobsServer.prototype.put = serialised(BlobsServer.prototype.put);
BlobsServer.prototype.delete = serialised(BlobsServer.prototype.delete);

export { BlobsServer };
