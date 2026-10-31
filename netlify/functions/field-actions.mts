/**
 * POST /api/field/report  { id, reason }
 * POST /api/field/remove  { id, token }   (only the visitor who left it)
 */
import type { Config } from '@netlify/functions';
import { REPORT_REASONS, REPORT_THRESHOLD, json, locate, mutate, ownsPiece, readBody, store } from './_lib/field.ts';

export default async (req: Request) => {
  const action = new URL(req.url).pathname.split('/').pop();
  const body = await readBody(req);
  if (!body) return json({ error: 'invalid' }, 400);
  const id = typeof body.id === 'string' ? body.id : '';
  const s = store();

  if (action === 'report') {
    const reason = (REPORT_REASONS as readonly string[]).includes(body.reason as string) ? (body.reason as string) : 'other';
    const p = await mutate(s, id, (p) => {
      if (p.status === 'removed') return p;
      p.reports += 1;
      p.reasons = { ...(p.reasons ?? {}), [reason]: (p.reasons?.[reason] ?? 0) + 1 };
      // Threats and personal information are hidden at once; others after repeated reports.
      const urgent = reason === 'threat' || reason === 'personal information';
      if (p.status === 'visible' && (urgent || p.reports >= REPORT_THRESHOLD)) p.status = 'pending';
      return p;
    });
    return p ? json({ ok: true }) : json({ error: 'not found' }, 404);
  }

  if (action === 'remove') {
    const token = typeof body.token === 'string' ? body.token : '';
    if (!(await ownsPiece(await locate(s, id), token))) return json({ error: 'not allowed' }, 403);
    // The letters are erased at once; only an empty record remains so links resolve to "removed".
    await mutate(s, id, (p) => ({ ...p, glyphs: [], status: 'removed', reports: 0, reasons: {} }));
    return json({ ok: true });
  }

  return json({ error: 'unknown' }, 404);
};

export const config: Config = {
  path: ['/api/field/report', '/api/field/remove'],
  method: ['POST'],
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
