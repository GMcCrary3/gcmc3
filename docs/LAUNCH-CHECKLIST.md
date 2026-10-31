# Launch checklist

Status: ✅ verified · 🟡 built, must be verified on the deployed site · ⬜ waiting on a
decision or on access.

**Public launch is not authorised.** Two separate protections apply before launch:

- **Privacy (restricts access):** the `PRELAUNCH_PASSWORD` environment variable turns on
  a password gate for every request, pages and API alike (docs/DEPLOYMENT.md, "Prelaunch
  privacy gate"). This is what keeps the preview private.
- **Search exclusion (does not restrict access):** `prelaunch: true` in settings adds
  `noindex` to every page and a disallow-all robots.txt.

## A. Production deployment checklist (in order)

1. ⬜ **GitHub access.** Diagnosed: the remote URL is correct, the GitHub account
   (GMcCrary3) is connected and can read the repository, and the repository is empty, so
   branch protection does not apply. The push is refused because **the Claude GitHub App is
   not installed on `GMcCrary3/gcmc3`** (or its installation is not linked to this Claude
   account). Fix: install it at https://github.com/apps/claude/installations/select_target
   (account GMcCrary3 → only select repositories → gcmc3), or re-link at
   https://claude.ai/customize/connectors?auth_start=github&auth_start_force=1. Then push
   branch `claude/gilesmccrary-website-2ingnt`. All local commits are preserved; nothing is
   force-pushed or discarded.
2. ⬜ **Review and merge** to `main` (or deploy the branch, see 4).
3. ⬜ **Netlify site** from the repo (docs/DEPLOYMENT.md §1). Do **not** add the custom
   domain yet. Optionally enable Netlify *password protection* for the whole site (paid
   plans), or keep the `*.netlify.app` address private.
4. ⬜ **Environment variables** (Netlify → Site configuration → Environment variables),
   set **before the first deploy** so the site is never publicly reachable:
   - `PRELAUNCH_PASSWORD`: the preview password (the privacy gate).
   - `FIELD_ADMIN_TOKEN`: a random passphrase of **32+ characters**, kept in a password manager.
   - (`FIELD_STORE` is set automatically: previews/branch deploys use `field-preview`.)
5. ⬜ **Verify on a deploy preview or branch deploy** (separate storage):
   `node scripts/field-verify.mjs https://<preview-url> <FIELD_ADMIN_TOKEN> <PRELAUNCH_PASSWORD>`
   Checks that the **gate refuses visitors without the password** (pages and API), HTTPS/HSTS, prelaunch robots, persistent storage, server-side moderation auth,
   terms enforcement, pre-moderation and owner view, approve/report/hide, **rate limiting**,
   **100 simultaneous writes**, **filing without loss or duplicates**, owner removal, cleanup.
6. ⬜ **Verify on the production deploy** (`*.netlify.app`, before the domain): run the same
   script once, confirm the **scheduled filing** runs by itself (pieces get numbers within
   ~1 minute without pressing "file now"; the moderation page's health line reads "filing
   healthy"; Netlify → Logs → Functions → field-file shows the runs), then hide the
   verification pieces. Also confirm in a private browser window that the site asks for the
   password, including for cached pages.
7. ⬜ **Contact form**: submit a test message; confirm the email notification arrives.
8. ⬜ **Editor**: GitHub OAuth set up; sign in at `/admin/`; make and publish a test edit.
9. ⬜ **Approvals**: terms (legal review), privacy page, field wording, artist statement,
   interludes/poems as applicable, analytics decision.
10. ⬜ **Custom domain + HTTPS** (docs/DEPLOYMENT.md §2); re-run step 5's script against
    `https://gilesmccrary.com`.
11. ⬜ **Launch** (only when approved): delete `PRELAUNCH_PASSWORD`; set `prelaunch` and
    `showEditorialNotes` off; redeploy; confirm the site opens without a password,
    robots.txt allows indexing, and pages no longer carry `noindex`.
12. ⬜ **After launch**: moderate daily at first; watch Netlify usage; consider moving
    the field to post-moderation only after real-world experience.

## B. Status

| item | status | notes |
|---|---|---|
| All ten artworks display; catalogue 01–10 | ✅ | |
| No generated imagery | ✅ | |
| Exhibition (five movements), keyboard, reduced motion, mobile | ✅ | |
| Poems preserve formatting | ✅ / ⬜ | mechanism verified; no approved poems yet |
| Field: consent, screening, pre-moderation, reports, removal, moderation | ✅ local / 🟡 live | `npm run test:field` 16/16 |
| Field: concurrency; filing recovery under simulated crashes and races | ✅ local / 🟡 live | tested safeguards, not a guarantee; re-verify on Netlify (A5–A6) |
| Field: rate limiting | 🟡 | only exists on Netlify (A5) |
| Shared images match stored compositions; credit legible at 400 px | ✅ | one drawing routine for display and export |
| Privacy page reflects the system, incl. host processing | ✅ draft / ⬜ approval | |
| Participation terms | ✅ draft / ⬜ legal review | |
| Contact delivery, editor sign-in, HTTPS on domain | ⬜ | need deployment |
| Prelaunch privacy gate | ✅ local / 🟡 live | `npm run test:gate` 8/8; verify on Netlify (A5–A6) |
| Prelaunch noindex | ✅ | on until launch |
| Filing health visible (logs + moderation health line) | ✅ local / 🟡 live | |
