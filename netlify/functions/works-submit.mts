/**
 * POST /api/works/submit  { project, text, display, agree }
 *   → 201 { id, token, status, seq? }   only after the submission is stored
 * Rate-limited per visitor by Netlify; duplicates refused for the day.
 */
import type { Config } from '@netlify/functions';
import { json, readBody } from './_lib/field.ts';
import { resolve, settings, submit, worksStore } from './_lib/works.ts';

export default async (req: Request) => {
  const body = await readBody(req);
  if (!body) return json({ error: 'invalid' }, 400);
  const slug = typeof body.project === 'string' ? body.project : '';
  const work = resolve(slug);
  if (!work) return json({ error: 'unknown' }, 404);
  const p = work.project;
  try {
    const r = await submit(worksStore(p), p, settings(p), body);
    if (!r.ok) return json({ error: r.error }, r.status);
    return json({ id: r.sub.id, token: r.token, status: r.sub.status, seq: r.sub.seq ?? null }, 201);
  } catch (e) {
    console.error('[works] submit failed', e);
    return json({ error: 'storage' }, 503);
  }
};

export const config: Config = {
  path: '/api/works/submit',
  method: ['POST'],
  rateLimit: { windowLimit: 4, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
