/**
 * GET /api/field              → the newest pieces (just left + newest page)
 * GET /api/field?page=K       → an older page of 100 (0 = the very first)
 * GET /api/field/piece?id=X   → one piece. With header `x-field-key: <removal key>`
 *                               the visitor who left it also sees it while it
 *                               awaits review.
 * Only visible pieces are returned to everyone else. Briefly cached at the CDN.
 */
import type { Config } from '@netlify/functions';
import {
  PAGE_SIZE, filedCount, json, ownsPiece, readOne, readPage, readWaiting, store, toPublic, uniqueById, waitingKeys,
  type Piece,
} from './_lib/field.ts';

const visible = (list: Piece[]) => list.filter((p) => p.status === 'visible').map(toPublic);

export default async (req: Request) => {
  const url = new URL(req.url);
  const s = store();

  if (url.pathname.endsWith('/piece')) {
    const found = await readOne(s, url.searchParams.get('id') ?? '');
    if (!found) return json({ error: 'not found' }, 404);
    const { piece, loc } = found;
    const key = req.headers.get('x-field-key') ?? '';
    if (key && (await ownsPiece(loc, key)) && piece.status !== 'removed') {
      return json({ piece: toPublic(piece), status: piece.status === 'visible' ? 'visible' : 'awaiting review', mine: true });
    }
    if (piece.status !== 'visible') return json({ error: 'not found' }, 404);
    return json({ piece: toPublic(piece) }, 200, {
      'netlify-cdn-cache-control': 'public, s-maxage=30, stale-while-revalidate=120',
      vary: 'x-field-key',
    });
  }

  const [filed, waiting] = await Promise.all([filedCount(s), waitingKeys(s)]);
  const pages = Math.ceil(filed / PAGE_SIZE);
  const requested = url.searchParams.get('page');

  if (requested !== null) {
    const page = Math.max(0, Math.min(Math.max(pages - 1, 0), Number.parseInt(requested, 10) || 0));
    return json({ total: filed + waiting.length, page, pages, pieces: pages ? visible(await readPage(s, page)) : [] }, 200, {
      'netlify-cdn-cache-control': 'public, s-maxage=60, stale-while-revalidate=600',
    });
  }

  const [fresh, newest] = await Promise.all([
    readWaiting(s, waiting, PAGE_SIZE),
    pages ? readPage(s, pages - 1) : Promise.resolve([] as Piece[]),
  ]);
  const merged = uniqueById(fresh, newest).sort((a, b) => (b.n || Infinity) - (a.n || Infinity) || b.at.localeCompare(a.at));
  // "total" counts every piece left (including any awaiting review); "shown" what is public.
  return json({ total: filed + waiting.length, page: pages - 1, pages, pieces: visible(merged) }, 200, {
    'netlify-cdn-cache-control': 'public, s-maxage=10, stale-while-revalidate=60',
  });
};

export const config: Config = {
  path: ['/api/field', '/api/field/piece'],
  method: ['GET'],
};
