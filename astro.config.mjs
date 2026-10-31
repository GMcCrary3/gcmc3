// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const site = JSON.parse(readFileSync(new URL('./src/data/site.json', import.meta.url), 'utf8'));
/** @param {string} s @returns {`sha256-${string}`} */
const sha = (s) => `sha256-${createHash('sha256').update(s).digest('base64')}`;

// Third-party origins are only allowed when the matching feature is switched on.
const analyticsOrigin =
  site.analytics.approvedByArtist && site.analytics.scriptSrc ? new URL(site.analytics.scriptSrc).origin : null;
const recaptcha = site.contactForm.recaptcha;

export default defineConfig({
  site: 'https://gilesmccrary.com',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/contact/thanks/'),
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  experimental: {
    // A strict Content-Security-Policy is written into every page, with
    // hashes for each inline script and style Astro emits.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src 'self'${analyticsOrigin ? ` ${analyticsOrigin}` : ''}`,
        `frame-src ${recaptcha ? 'https://www.google.com https://www.recaptcha.net' : "'none'"}`,
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ],
      scriptDirective: {
        resources: [
          "'self'",
          ...(analyticsOrigin ? [analyticsOrigin] : []),
          ...(recaptcha ? ['https://www.google.com', 'https://www.gstatic.com', 'https://www.recaptcha.net'] : []),
        ],
      },
      styleDirective: {
        // The homepage hero sets its crop focus with an inline style attribute.
        resources: ["'self'", "'unsafe-hashes'"],
        hashes: [sha(`object-position: ${site.hero.focus}`)],
      },
    },
  },
});
