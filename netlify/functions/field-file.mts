/**
 * Scheduled once a minute: files newly left pieces into the field's numbered
 * pages. Netlify runs scheduled functions one at a time, so this is the
 * field's single writer for numbering.
 */
import type { Config } from '@netlify/functions';
import { fileWaiting, health, store } from './_lib/field.ts';

export default async () => {
  const s = store();
  try {
    const filed = await fileWaiting(s);
    if (filed) console.log(`[field] filed ${filed} piece(s)`);
    const h = await health(s);
    if (h.stalled) console.error(`[field] filing may be stalled: ${JSON.stringify(h)}`);
  } catch (e) {
    // Logged and re-thrown so the failed run is visible in Netlify's function logs.
    // Waiting pieces stay where they are; the next run (or "file now") retries.
    console.error('[field] filing failed', e);
    throw e;
  }
};

export const config: Config = { schedule: '* * * * *' };
