/**
 * POST /api/works/withdraw         { project, id, token }        withdraw your pending submission
 * POST /api/works/request-removal  { project, seq, id, token, reason }   ask for your published words to be removed
 * POST /api/works/report           { project, seq, reason }      report a published contribution
 */
import type { Config } from '@netlify/functions';
import { json, readBody } from './_lib/field.ts';
import { PROJECTS, addRequest, findSubmission, isSlug, ownsSubmission, readComposition, withdraw, worksStore } from './_lib/works.ts';

const REASONS = ['hate', 'threat', 'personal information', 'impersonation', 'spam', 'other'];

export default async (req: Request) => {
  const action = new URL(req.url).pathname.split('/').pop();
  const body = await readBody(req);
  if (!body) return json({ error: 'invalid' }, 400);
  const slug = typeof body.project === 'string' ? body.project : '';
  if (!isSlug(slug)) return json({ error: 'unknown' }, 404);
  const p = PROJECTS[slug];
  const s = worksStore(p);

  if (action === 'withdraw') {
    const r = await withdraw(s, String(body.id ?? ''), String(body.token ?? ''));
    return r.ok ? json({ ok: true }) : json({ error: r.status === 403 ? 'not allowed' : 'not pending' }, r.status);
  }

  const seq = Number(body.seq);
  const comp = await readComposition(s, p);
  const entry = comp.entries.find((e) => e.seq === seq && e.status === 'published');
  if (!entry) return json({ error: 'not found' }, 404);

  if (action === 'request-removal') {
    const found = await findSubmission(s, String(body.id ?? ''));
    if (!found || found.sub.seq !== seq || !(await ownsSubmission(found.sub, String(body.token ?? '')))) return json({ error: 'not allowed' }, 403);
    await addRequest(s, 'removal', seq, String(body.reason ?? ''), true);
    return json({ ok: true });
  }
  if (action === 'report') {
    const reason = REASONS.includes(String(body.reason)) ? String(body.reason) : 'other';
    await addRequest(s, 'report', seq, reason);
    return json({ ok: true });
  }
  return json({ error: 'unknown' }, 404);
};

export const config: Config = {
  path: ['/api/works/withdraw', '/api/works/request-removal', '/api/works/report'],
  method: ['POST'],
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
