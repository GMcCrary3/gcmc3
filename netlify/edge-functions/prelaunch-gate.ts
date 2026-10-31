/**
 * Prelaunch privacy gate. While the Netlify environment variable
 * PRELAUNCH_PASSWORD is set, every request to the site (pages, images, the
 * field's API, the editor) requires that password via the browser's standard
 * sign-in prompt (HTTP Basic authentication; any username). Remove the
 * variable at launch and the gate disappears.
 *
 * Search-engine exclusion (the `prelaunch` setting) only asks crawlers to stay
 * away; this gate actually restricts access.
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

export default async (req: Request, context: Context) => {
  const password = Netlify.env.get('PRELAUNCH_PASSWORD');
  if (!password) return context.next();

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
  return new Response('GilesMcCrary.com is not public yet.', {
    status: 401,
    headers: {
      'www-authenticate': 'Basic realm="GilesMcCrary.com private preview", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
};

export const config = { path: '/*' };
