/**
 * The artist's controls for both literary works. Authenticated on the server
 * with the same moderation key as the field (FIELD_ADMIN_TOKEN, header
 * x-field-admin-key). Never exposed to visitors.
 *
 * GET  /api/works/admin?project=…&view=overview|audit
 * POST /api/works/admin  { project, action, … }
 *   approve   { ids }            publish in submission order; stops at a milestone
 *   reject    { ids, reason }
 *   intervene { text }           the artist's words; never counted toward the twelve
 *   remove    { seq, reason }    erase published words, keeping the sequence number
 *   request   { id, status }     resolve or dismiss a report / removal request
 */
import type { Config } from '@netlify/functions';
import { json, readBody, safeEqual } from './_lib/field.ts';
import {
  PROJECTS, approve, intervene, isSlug, listAudit, listRequests, listSubmissions, readComposition, reject,
  removeEntry, resolveRequest, settings, windowFor, worksStore,
} from './_lib/works.ts';

export default async (req: Request) => {
  const secret = process.env.FIELD_ADMIN_TOKEN ?? '';
  const isDevKey = /^(local-dev|test-)/.test(secret) && !process.env.FIELD_BLOBS_EDGE_URL;
  const given = req.headers.get('x-field-admin-key') ?? '';
  if (secret.length < 32 || isDevKey || !safeEqual(given, secret)) {
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: 'not allowed' }, 401);
  }

  const url = new URL(req.url);
  const body = req.method === 'POST' ? await readBody(req) : null;
  const slug = String(body?.project ?? url.searchParams.get('project') ?? '');
  if (!isSlug(slug)) return json({ error: 'unknown' }, 404);
  const p = PROJECTS[slug];
  const s = worksStore(p);
  const st = settings(p);

  if (req.method === 'GET') {
    if (url.searchParams.get('view') === 'audit') return json({ audit: await listAudit(s) });
    const [comp, subs, reqs] = await Promise.all([readComposition(s, p), listSubmissions(s), listRequests(s)]);
    const published = new Set(comp.entries.map((e) => e.id));
    const queue = subs
      .filter((x) => x.status === 'pending' && !published.has(x.id))
      .map(({ receiptHash: _r, ...x }) => x);
    return json({
      settings: st,
      composition: comp,
      queue,
      decided: subs.filter((x) => x.status !== 'pending').slice(-50).map(({ receiptHash: _r, ...x }) => x),
      requests: reqs.map((x) => x.req).filter((r) => r.status === 'open'),
      milestones: comp.milestones.map((m) => ({ ...m, window: windowFor(m, st) })),
    });
  }

  const action = body?.action;
  if (action === 'approve') {
    const ids = (Array.isArray(body?.ids) ? body.ids : []).map(String).slice(0, 100);
    const results: Record<string, string> = {};
    for (const id of ids) {
      const r = await approve(s, p, st, id, 'artist');
      results[id] = r.ok ? `published #${r.entry.seq}${r.milestone ? ` · milestone ${r.milestone.n}` : ''}` : r.error;
      if (!r.ok && r.error === 'awaiting-artist') {
        for (const rest of ids.slice(ids.indexOf(id) + 1)) results[rest] = 'awaiting-artist';
        break;
      }
    }
    return json({ ok: true, results });
  }
  if (action === 'reject') {
    const ids = (Array.isArray(body?.ids) ? body.ids : []).map(String).slice(0, 100);
    const results: Record<string, string> = {};
    for (const id of ids) results[id] = (await reject(s, id, String(body?.reason ?? ''))).ok ? 'rejected' : 'not pending';
    return json({ ok: true, results });
  }
  if (action === 'intervene') {
    const r = await intervene(s, p, String(body?.text ?? ''));
    return r.ok ? json({ ok: true, seq: r.entry.seq, resolved: r.resolved }) : json({ error: r.error }, 422);
  }
  if (action === 'remove') {
    const ok = await removeEntry(s, Number(body?.seq), String(body?.reason ?? ''));
    return ok ? json({ ok: true }) : json({ error: 'not found' }, 404);
  }
  if (action === 'request') {
    const status = body?.status === 'resolved' ? 'resolved' : 'dismissed';
    return (await resolveRequest(s, String(body?.id ?? ''), status)) ? json({ ok: true }) : json({ error: 'not found' }, 404);
  }
  return json({ error: 'unknown action' }, 400);
};

export const config: Config = {
  path: '/api/works/admin',
  method: ['GET', 'POST'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
