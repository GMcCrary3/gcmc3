import type { APIRoute } from 'astro';
import site from '../data/site.json';

/** While `prelaunch` is on, search engines are asked to stay away entirely. */
export const GET: APIRoute = ({ site: url }) => {
  const body = site.prelaunch
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /field/moderate/\nDisallow: /api/\n\nSitemap: ${new URL('/sitemap-index.xml', url)}\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
