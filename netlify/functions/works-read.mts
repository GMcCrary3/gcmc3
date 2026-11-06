/**
 * GET /api/works/unfinished-sentence      the published work (public view)
 * GET /api/works/space-in-between-us      the published work (public view)
 * GET /api/works/receipt?project=…&id=…   a contributor's own submission status
 *                                         (header x-works-key: the private key)
 * Pending, rejected and withdrawn submissions never appear in the public view.
 */
import type { Config } from '@netlify/functions';
import { json } from './_lib/field.ts';
import { PROJECTS, findSubmission, isSlug, ownsSubmission, publicView, readComposition, settings, worksStore } from './_lib/works.ts';

export default async (req: Request) => {
  const url = new URL(req.url);
  const slug = url.pathname.split('/').pop() ?? '';

  if (slug === 'receipt') {
    const project = url.searchParams.get('project') ?? '';
    if (!isSlug(project)) return json({ error: 'unknown' }, 404);
    const s = worksStore(PROJECTS[project]);
    const found = await findSubmission(s, url.searchParams.get('id') ?? '');
    if (!found || !(await ownsSubmission(found.sub, req.headers.get('x-works-key') ?? ''))) return json({ error: 'not found' }, 404);
    const { sub } = found;
    return json({ status: sub.status, seq: sub.seq ?? null, receivedAt: sub.receivedAt });
  }

  if (!isSlug(slug)) return json({ error: 'unknown' }, 404);
  const p = PROJECTS[slug];
  const view = publicView(await readComposition(worksStore(p), p), settings(p));
  return json(view, 200, { 'netlify-cdn-cache-control': 'public, s-maxage=10, stale-while-revalidate=60' });
};

export const config: Config = {
  path: ['/api/works/unfinished-sentence', '/api/works/space-in-between-us', '/api/works/receipt'],
  method: ['GET'],
};
