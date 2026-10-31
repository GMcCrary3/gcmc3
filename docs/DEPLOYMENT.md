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
