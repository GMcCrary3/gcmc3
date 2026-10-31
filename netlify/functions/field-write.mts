/**
 * POST /api/field/leave   { text, aspect, base, glyphs }  → { id, n, token }
 * POST /api/field/report  { id }
 * POST /api/field/remove  { id, token }   (the visitor who left it)
 *
 * Rate-limited per visitor by Netlify; no IP address or identifier is stored.
 */
import type { Config } from '@netlify/functions';
import site from '../../src/data/site.json' with { type: 'json' };
import {
  REPORT_THRESHOLD, json, locate, mutate, randomId, sha256, store, validate, type Piece,
} from './_lib/field.ts';

const readBody = async (req: Request) => {
  const text = await req.text();
  if (text.length > 16_000) return null;
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return null; }
};

export default async (req: Request) => {
  if (!(site as { field?: { open?: boolean } }).field?.open) return json({ error: 'closed' }, 403);
  const action = new URL(req.url).pathname.split('/').pop();
  const body = await readBody(req);
  if (!body) return json({ error: 'invalid' }, 400);
  const s = store();

  if (action === 'leave') {
    const v = validate(body);
    if (!v.ok) return json({ error: v.error }, 422);
    const moderation = (site as { field?: { moderation?: string } }).field?.moderation === 'pre' ? 'pre' : 'post';

    // Only keys unique to this piece are written, so simultaneous visitors never collide.
    const id = randomId();
    const token = randomId(24);
    const key = `new/${String(Date.now()).padStart(15, '0')}-${id}`;
    const piece: Piece = {
      id,
      n: 0, // numbered when filed (within a minute)
      at: new Date().toISOString().slice(0, 10),
      aspect: v.aspect,
      base: v.base,
      glyphs: v.glyphs,
      status: moderation === 'pre' ? 'pending' : 'visible',
      reports: 0,
    };
    await s.setJSON(key, piece, { onlyIfNew: true });
    await s.setJSON(`piece/${id}`, { key, deleteHash: await sha256(token) }, { onlyIfNew: true });
    return json({ id, token, status: piece.status }, 201);
  }

  const id = typeof body.id === 'string' ? body.id : '';

  if (action === 'report') {
    const p = await mutate(s, id, (p) => {
      p.reports += 1;
      if (p.status === 'visible' && p.reports >= REPORT_THRESHOLD) p.status = 'pending';
      return p;
    });
    return p ? json({ ok: true }) : json({ error: 'not found' }, 404);
  }

  if (action === 'remove') {
    const loc = await locate(s, id);
    const token = typeof body.token === 'string' ? body.token : '';
    if (!loc || !token || (await sha256(token)) !== loc.deleteHash) return json({ error: 'not allowed' }, 403);
    await mutate(s, id, (p) => ({ ...p, glyphs: [], status: 'removed' }));
    return json({ ok: true });
  }

  return json({ error: 'unknown' }, 404);
};

export const config: Config = {
  path: ['/api/field/leave', '/api/field/report', '/api/field/remove'],
  method: ['POST'],
  rateLimit: { windowLimit: 8, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
