/**
 * Prelaunch privacy gate — closed by default.
 *
 *  - PUBLIC_LAUNCH = "true"     → the site is public (set only at an approved launch).
 *  - PRELAUNCH_PASSWORD is set  → every request (pages, images, the field's API,
 *                                 the editor) needs that password through the
 *                                 browser's standard sign-in box (any username).
 *  - neither is set             → nobody gets in ("not public yet").
 *
 * So a deploy that happens before the variables are configured is closed, not
 * public. Search-engine exclusion (the `prelaunch` setting) only asks crawlers
 * to stay away; this gate actually restricts access. Nothing here logs or
 * echoes the password.
 *
 * Runs on Netlify Edge Functions (Deno). Not part of the Astro type check.
 */
declare const Netlify: { env: { get(name: string): string | undefined } };
type Context = { next: () => Promise<Response> };

const encoder = new TextEncoder();
async function sameSecret(a: string, b: string) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const ax = new Uint8Array(x), by = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ by[i];
  return diff === 0;
}

const closed = (status: number, body: string, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      ...extra,
    },
  });

export default async (req: Request, context: Context) => {
  if (Netlify.env.get('PUBLIC_LAUNCH') === 'true') return context.next();

  const password = Netlify.env.get('PRELAUNCH_PASSWORD');
  if (!password) return closed(503, 'GilesMcCrary.com is not public yet.');

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(':') + 1);
      if (await sameSecret(given, password)) {
        const res = await context.next();
        const out = new Response(res.body, res);
        out.headers.set('x-robots-tag', 'noindex, nofollow');
        out.headers.set('cache-control', 'private, no-store');
        return out;
      }
    } catch {
      /* malformed header: fall through */
    }
  }
  return closed(401, 'GilesMcCrary.com is not public yet.', {
    'www-authenticate': 'Basic realm="GilesMcCrary.com private preview", charset="UTF-8"',
  });
};

export const config = { path: '/*' };
