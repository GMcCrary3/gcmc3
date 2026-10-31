/**
 * Scheduled once a minute: files newly left pieces into the field's numbered
 * pages. Netlify runs scheduled functions one at a time, so this is the
 * field's single writer for numbering.
 */
import type { Config } from '@netlify/functions';
import { fileWaiting, store } from './_lib/field.ts';

export default async () => {
  const filed = await fileWaiting(store());
  if (filed) console.log(`filed ${filed} piece(s)`);
};

export const config: Config = { schedule: '* * * * *' };
