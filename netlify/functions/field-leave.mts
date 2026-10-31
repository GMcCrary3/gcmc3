/**
 * POST /api/field/leave  { text, aspect, base, glyphs, agree }  → { id, token, status }
 *
 * - `agree` must equal the current participation terms version.
 * - The typed word is screened (refused, or held for review), then discarded.
 * - The same composition cannot be left twice on the same day.
 * - Netlify limits each visitor to 4 submissions a minute; nothing identifying
 *   the visitor is stored.
 */
import type { Config } from '@netlify/functions';
import site from '../../src/data/site.json' with { type: 'json' };
import { fingerprint, json, randomId, readBody, sha256, store, validate, type Piece } from './_lib/field.ts';

type FieldSettings = { open?: boolean; moderation?: string; termsVersion?: string };

export default async (req: Request) => {
  const f = (site as { field?: FieldSettings }).field ?? {};
  if (!f.open) return json({ error: 'closed' }, 403);
  const body = await readBody(req);
  if (!body) return json({ error: 'invalid' }, 400);
  if (!f.termsVersion || body.agree !== f.termsVersion) return json({ error: 'terms' }, 422);

  const v = validate(body);
  if (!v.ok) return json({ error: v.error }, 422);
  const s = store();

  const day = new Date().toISOString().slice(0, 10);
  const dup = await s.setJSON(`dup/${day}/${await fingerprint(v)}`, {}, { onlyIfNew: true });
  if (!dup.modified) return json({ error: 'duplicate' }, 409);

  const id = randomId();
  const token = randomId(24);
  const key = `new/${String(Date.now()).padStart(15, '0')}-${id}`;
  const piece: Piece = {
    id,
    n: 0, // numbered when filed (within a minute)
    at: day,
    aspect: v.aspect,
    base: v.base,
    glyphs: v.glyphs,
    status: f.moderation === 'pre' || v.hold ? 'pending' : 'visible',
    reports: 0,
    ...(v.hold ? { held: v.hold } : {}),
    terms: f.termsVersion,
    rev: 0,
  };
  // Index first (so the piece is never orphaned), then the piece itself.
  await s.setJSON(`piece/${id}`, { key, deleteHash: await sha256(token) }, { onlyIfNew: true });
  await s.setJSON(key, piece, { onlyIfNew: true });
  return json({ id, token, status: piece.status }, 201);
};

export const config: Config = {
  path: '/api/field/leave',
  method: ['POST'],
  rateLimit: { windowLimit: 4, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
