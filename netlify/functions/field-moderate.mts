/**
 * The artist's moderation endpoint. Authenticated here, on the server, against
 * the FIELD_ADMIN_TOKEN environment variable (at least 32 characters). The key
 * never appears in the site's code; the artist types it into the moderation page.
 *
 * GET  /api/field/moderate?view=review|recent|health&page=K
 * POST /api/field/moderate  { id | ids: [...], action: "show" | "hide" }
 * POST /api/field/moderate  { action: "file" }            file waiting pieces now
 *                                                          (also a manual recovery tool)
 * POST /api/field/moderate  { action: "selftest", count }  write `count` hidden test
 *                                                          pieces in parallel (≤ 200)
 */
import type { Config } from '@netlify/functions';
import {
  PAGE_SIZE, fileWaiting, filedCount, health, json, mutate, randomId, readBody, readPage, readWaiting, safeEqual, sha256, store,
  uniqueById, waitingKeys, type Piece,
} from './_lib/field.ts';

const needsReview = (p: Piece) => p.status === 'pending' || (p.status === 'visible' && p.reports > 0);

export default async (req: Request) => {
  const secret = process.env.FIELD_ADMIN_TOKEN ?? '';
  // Refuse the local development key if it is ever configured on Netlify by mistake.
  const isDevKey = /^(local-dev|test-)/.test(secret) && !process.env.FIELD_BLOBS_EDGE_URL;
  // Its own header, so it never collides with the prelaunch gate's Basic sign-in.
  const given = req.headers.get('x-field-admin-key') ?? '';
  if (secret.length < 32 || isDevKey || !safeEqual(given, secret)) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return json({ error: 'not allowed' }, 401);
  }
  const s = store();

  if (req.method === 'POST') {
    const body = await readBody(req);
    const action = body?.action;
    if (action === 'file') return json({ ok: true, filed: await fileWaiting(s) });
    if (action === 'selftest') {
      const count = Math.max(1, Math.min(200, Number(body?.count) || 20));
      const day = new Date().toISOString().slice(0, 10);
      const ids = await Promise.all(Array.from({ length: count }, async (_, i) => {
        const id = randomId();
        const key = `new/${String(Date.now()).padStart(15, '0')}-${id}`;
        const piece: Piece = {
          id, n: 0, at: day, aspect: 'landscape', base: 12, status: 'hidden', reports: 0, rev: 0, test: true,
          glyphs: [...'test'].map((c, j) => ({ c, x: 20 + j * 15, y: 30 + (i % 40), r: 0, s: 1, f: 0, t: 0 })),
        };
        await s.setJSON(`piece/${id}`, { key, deleteHash: await sha256(randomId(24)) }, { onlyIfNew: true });
        await s.setJSON(key, piece, { onlyIfNew: true });
        return id;
      }));
      return json({ ok: true, ids });
    }
    const ids = (Array.isArray(body?.ids) ? body.ids : [body?.id]).filter((x): x is string => typeof x === 'string').slice(0, 100);
    if (!ids.length || (action !== 'show' && action !== 'hide')) return json({ error: 'invalid' }, 400);
    const results: Record<string, string> = {};
    for (const id of ids) {
      const p = await mutate(s, id, (p) => {
        if (p.status === 'removed') return p;
        p.status = action === 'show' ? 'visible' : 'hidden';
        if (action === 'show') { p.reports = 0; p.reasons = {}; }
        return p;
      });
      results[id] = p?.status ?? 'not found';
    }
    return json({ ok: true, results, status: results[ids[0]] });
  }

  const url = new URL(req.url);
  if (url.searchParams.get('view') === 'health') return json(await health(s));
  const [filed, waiting] = await Promise.all([filedCount(s), waitingKeys(s)]);
  const count = filed + waiting.length;
  const pages = Math.ceil(filed / PAGE_SIZE);
  const view = url.searchParams.get('view') === 'recent' ? 'recent' : 'review';
  const start = Number.parseInt(url.searchParams.get('page') ?? '', 10);
  const fresh = Number.isNaN(start) ? await readWaiting(s, waiting, 500) : [];

  if (view === 'recent') {
    const page = Number.isNaN(start) ? pages - 1 : Math.max(0, Math.min(pages - 1, start));
    const filedPieces = pages ? await readPage(s, page) : [];
    return json({ total: count, page, pages, pieces: uniqueById(fresh, filedPieces) });
  }
  const found: Piece[] = [...fresh.filter(needsReview)];
  let page = Number.isNaN(start) ? pages - 1 : start;
  for (let scanned = 0; page >= 0 && scanned < 20 && found.length < 200; page--, scanned++) {
    found.push(...(await readPage(s, page)).filter(needsReview));
  }
  return json({ total: count, nextPage: page >= 0 ? page : null, pieces: uniqueById(found).filter(needsReview) });
};

export const config: Config = {
  path: '/api/field/moderate',
  method: ['GET', 'POST'],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
