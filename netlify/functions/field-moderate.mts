/**
 * The artist's moderation endpoint. Requires the FIELD_ADMIN_TOKEN environment
 * variable (set in Netlify) as a Bearer token.
 *
 * GET  /api/field/moderate?view=review|recent&page=K
 * POST /api/field/moderate  { id, action: "show" | "hide" }
 */
import type { Config } from '@netlify/functions';
import { PAGE_SIZE, filedCount, json, mutate, readPage, readWaiting, safeEqual, store, waitingKeys } from './_lib/field.ts';

export default async (req: Request) => {
  const secret = process.env.FIELD_ADMIN_TOKEN ?? '';
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (secret.length < 16 || !safeEqual(given, secret)) return json({ error: 'not allowed' }, 401);
  const s = store();

  if (req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as { id?: string; action?: string } | null;
    if (!body?.id || !['show', 'hide'].includes(body.action ?? '')) return json({ error: 'invalid' }, 400);
    const p = await mutate(s, body.id, (p) => {
      if (p.status === 'removed') return p;
      p.status = body.action === 'show' ? 'visible' : 'hidden';
      if (body.action === 'show') p.reports = 0;
      return p;
    });
    return p ? json({ ok: true, status: p.status }) : json({ error: 'not found' }, 404);
  }

  const url = new URL(req.url);
  const [filed, waiting] = await Promise.all([filedCount(s), waitingKeys(s)]);
  const count = filed + waiting.length;
  const pages = Math.ceil(filed / PAGE_SIZE);
  const fresh = await readWaiting(s, waiting, 500);
  const view = url.searchParams.get('view') === 'recent' ? 'recent' : 'review';
  const start = Number.parseInt(url.searchParams.get('page') ?? '', 10);
  // "review": pieces awaiting a decision (reported, or held under pre-moderation),
  // scanning back from the newest page; "recent": one page, newest first.
  if (view === 'recent') {
    const page = Number.isNaN(start) ? pages - 1 : Math.max(0, Math.min(pages - 1, start));
    const filedPieces = pages ? await readPage(s, page) : [];
    return json({ total: count, page, pages, pieces: Number.isNaN(start) ? [...fresh, ...filedPieces] : filedPieces });
  }
  const needsReview = (p: { status: string; reports: number }) => p.status === 'pending' || (p.status === 'visible' && p.reports > 0);
  const found = Number.isNaN(start) ? fresh.filter(needsReview) : [];
  let page = Number.isNaN(start) ? pages - 1 : start;
  for (let scanned = 0; page >= 0 && scanned < 20 && found.length < 100; page--, scanned++) {
    found.push(...(await readPage(s, page)).filter(needsReview));
  }
  return json({ total: count, nextPage: page >= 0 ? page : null, pieces: found });
};

export const config: Config = {
  path: '/api/field/moderate',
  method: ['GET', 'POST'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
