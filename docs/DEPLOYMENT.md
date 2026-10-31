# Deployment

The site is a static build (`dist/`) hosted on Netlify. Netlify supplies HTTPS, the
custom domain, the contact-form inbox with spam filtering, and the GitHub sign-in for
the editor.

## 1. Create the Netlify site

1. Sign in at netlify.com → **Add new site → Import an existing project → GitHub** →
   choose `GMcCrary3/gcmc3`.
2. Branch to deploy: `main`. Build settings come from `netlify.toml`
   (`npm run build`, publish `dist`, Node 22). Click **Deploy**.
3. Every push to `main` deploys. Every pull request gets its own **deploy preview** URL,
   which is the working preview to review changes before they go live.

## 2. Custom domain and HTTPS

1. **Site configuration → Domain management → Add a domain** → `gilesmccrary.com`.
2. Either let Netlify run DNS (change the nameservers at your registrar to the four Netlify
   shows), or keep your DNS and add:
   - `A` record for `@` → `75.2.60.5`
   - `CNAME` record for `www` → `<your-site>.netlify.app`

   (Check the values Netlify shows on screen. They are authoritative.)
3. Under **HTTPS**, Netlify provisions a free Let's Encrypt certificate automatically once
   DNS resolves. `netlify.toml` redirects `www` to the bare domain and sends HSTS.

## 3. Editor sign-in (`/admin/`)

The editor commits to GitHub through Netlify's OAuth service.

1. On GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**
   - Homepage URL: `https://gilesmccrary.com`
   - Authorization callback URL: `https://api.netlify.com/auth/done`
2. In Netlify: **Site configuration → Access & security → OAuth → Install provider →
   GitHub**, then paste the Client ID and Secret.
3. Anyone with write access to the GitHub repository can now sign in at `/admin/`.
   Give the artist a GitHub account with access to the repo.

If the content should be published from a branch other than `main`, change `branch:` in
`public/admin/config.yml`.

## 4. Contact form

The form is detected automatically by Netlify at build time (`data-netlify="true"`).

- **Where messages go:** Netlify → **Forms → contact**. Set up email notifications under
  **Forms → Form notifications → Add notification → Email** to the artist's address.
- **Spam protection:** a hidden honeypot field plus Netlify's built-in Akismet filtering.
  If spam gets through, turn on *require reCAPTCHA* in *settings → site settings → contact
  form*. The form and Content-Security-Policy adjust themselves on the next build.
- **Privacy:** the privacy note under the form links to `/privacy/`. Delete old submissions
  in the Netlify Forms dashboard in line with what that page promises.
- Optional: put a public email in *settings → public contact email* to show a direct
  address as well.

## The field (collective work)

The field runs on Netlify Functions and Netlify Blobs: no other service or account is
needed. Both deploy automatically with the site.

1. **Set the moderation key.** In Netlify: *Site configuration → Environment variables →
   Add a variable*: `FIELD_ADMIN_TOKEN` = a long random passphrase (at least 16 characters;
   a password manager can generate one). Redeploy. Keep it private.
2. **Moderate** at `https://gilesmccrary.com/field/moderate/` with that key. *Needs review*
   lists reported pieces (and, under pre-moderation, everything waiting). *Show* or *hide*
   each one.
3. **Settings** (*settings → the field* in the editor):
   - *open for new pieces*: pause new contributions at any time; the field stays visible.
   - *moderation*: "post" (pieces appear at once; three reports hide a piece until reviewed)
     or "pre" (every piece waits for approval).

How it holds up if it spreads:
- Leaving a piece writes only keys unique to that piece, so simultaneous visitors never
  collide. A scheduled function files new pieces into numbered pages once a minute
  (about 36,000 an hour; any backlog simply waits its turn and is still shown at once).
- Reads are cached briefly at Netlify's edge, and each request reads at most one page of
  100 pieces.
- Netlify limits each visitor to 8 submissions a minute.
- Words are screened automatically for offensive language, links, emails and phone numbers.
- Watch usage under *Netlify → Usage*. The free plan includes generous function and blob
  allowances; a sustained viral spike may need a paid plan. You can close the field to new
  pieces at any moment without losing anything.

Locally: `npm run build && npm run field:dev` runs the whole site with the field at
http://localhost:8888 (moderation key `local-dev-moderation-token`; data in `.field-data/`).

## Analytics

Analytics are **off** until the artist approves them. The configured option is
[Plausible](https://plausible.io): it sets no cookies, keeps no personal data, and needs no
consent banner.

1. Create a Plausible site for `gilesmccrary.com`.
2. In *settings → site settings → analytics*, turn on **approved by the artist**.
3. On the next build, the tracking script and its CSP permission are added, and the
   privacy page switches to describe it automatically.

(Netlify's own server-side analytics is an alternative that needs no script. Enable it in
the Netlify dashboard and update the analytics paragraph in `src/pages/privacy.astro`.)

## Security

- A strict Content-Security-Policy is generated into every page at build time with hashes
  for each inline script and style (see `experimental.csp` in `astro.config.mjs`).
- `netlify.toml` adds HSTS, `X-Content-Type-Options`, `X-Frame-Options`, a referrer
  policy, and a permissions policy.
- The site has no server code, database, or cookies. The only data collected is what
  someone types into the contact form.

## Social sharing images

Each page gets Open Graph and Twitter card tags. The homepage and artwork index use a
1200×630 crop of the hero work. Each artwork page uses that work, uncropped. Pages without
an image use `public/og-default.png`, which `npm run og` regenerates from the site settings.

## Other hosts

`npm run build` produces a plain static site in `dist/` that any host can serve. On a host
other than Netlify, the contact form needs a replacement endpoint (e.g. Formspree), and the
headers in `netlify.toml` need re-creating in that host's format.
