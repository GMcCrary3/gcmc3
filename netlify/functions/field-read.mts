/**
 * GET /api/field              → the newest pieces (just left + newest page)
 * GET /api/field?page=K       → an older page of 100 (0 = the very first)
 * GET /api/field/piece?id=X   → one piece
 * Only visible pieces are ever returned. Responses are briefly cached at the CDN.
 */
import type { Config } from '@netlify/functions';
import { PAGE_SIZE, filedCount, json, readOne, readPage, readWaiting, store, toPublic, waitingKeys } from './_lib/field.ts';

export default async (req: Request) => {
  const url = new URL(req.url);
  const s = store();

  if (url.pathname.endsWith('/piece')) {
    const piece = await readOne(s, url.searchParams.get('id') ?? '');
    if (!piece || piece.status !== 'visible') return json({ error: 'not found' }, 404);
    return json({ piece: toPublic(piece) }, 200, {
      'netlify-cdn-cache-control': 'public, s-maxage=30, stale-while-revalidate=120',
    });
  }

  const [filed, waiting] = await Promise.all([filedCount(s), waitingKeys(s)]);
  const pages = Math.ceil(filed / PAGE_SIZE);
  const requested = url.searchParams.get('page');
  const visible = (list: Awaited<ReturnType<typeof readPage>>) => list.filter((p) => p.status === 'visible').map(toPublic);

  if (requested !== null) {
    const page = Math.max(0, Math.min(Math.max(pages - 1, 0), Number.parseInt(requested, 10) || 0));
    return json({ total: filed + waiting.length, page, pages, pieces: pages ? visible(await readPage(s, page)) : [] }, 200, {
      'netlify-cdn-cache-control': 'public, s-maxage=60, stale-while-revalidate=600',
    });
  }

  const [fresh, newest] = await Promise.all([
    readWaiting(s, waiting, PAGE_SIZE),
    pages ? readPage(s, pages - 1) : Promise.resolve([]),
  ]);
  return json(
    { total: filed + waiting.length, page: pages - 1, pages, pieces: [...visible(fresh), ...visible(newest)] },
    200,
    { 'netlify-cdn-cache-control': 'public, s-maxage=10, stale-while-revalidate=60' },
  );
};

export const config: Config = {
  path: ['/api/field', '/api/field/piece'],
  method: ['GET'],
};
