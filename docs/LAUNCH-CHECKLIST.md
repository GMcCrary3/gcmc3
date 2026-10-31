# Launch checklist

Status: ✅ verified · 🟡 built, must be verified on the deployed site · ⬜ waiting on a
decision or on access.

**Public launch is not authorised.** The site ships with `prelaunch: true` (every page
`noindex`, robots.txt disallows everything) and should stay unannounced until the
production checklist below is complete and approved.

## A. Production deployment checklist (in order)

1. ⬜ **GitHub access.** Reconnect the Claude GitHub App (the 403) and push branch
   `claude/gilesmccrary-website-2ingnt`. All local commits are preserved; nothing is
   force-pushed or discarded.
2. ⬜ **Review and merge** to `main` (or deploy the branch, see 4).
3. ⬜ **Netlify site** from the repo (docs/DEPLOYMENT.md §1). Do **not** add the custom
   domain yet. Optionally enable Netlify *password protection* for the whole site (paid
   plans), or keep the `*.netlify.app` address private.
4. ⬜ **Environment variables** (Netlify → Site configuration → Environment variables):
   - `FIELD_ADMIN_TOKEN`: a random passphrase of **32+ characters**, kept in a password manager.
   - (`FIELD_STORE` is set automatically: previews/branch deploys use `field-preview`.)
5. ⬜ **Verify on a deploy preview or branch deploy** (separate storage):
   `node scripts/field-verify.mjs https://<preview-url> <FIELD_ADMIN_TOKEN>`
   Checks HTTPS/HSTS, prelaunch robots, persistent storage, server-side moderation auth,
   terms enforcement, pre-moderation and owner view, approve/report/hide, **rate limiting**,
   **100 simultaneous writes**, **filing without loss or duplicates**, owner removal, cleanup.
6. ⬜ **Verify on the production deploy** (`*.netlify.app`, before the domain): run the same
   script once, confirm the **scheduled filing** runs by itself (pieces get numbers within
   ~1 minute without pressing "file now"; Netlify → Functions → field-file → logs), then
   hide the verification pieces.
7. ⬜ **Contact form**: submit a test message; confirm the email notification arrives.
8. ⬜ **Editor**: GitHub OAuth set up; sign in at `/admin/`; make and publish a test edit.
9. ⬜ **Approvals**: terms (legal review), privacy page, field wording, artist statement,
   interludes/poems as applicable, analytics decision.
10. ⬜ **Custom domain + HTTPS** (docs/DEPLOYMENT.md §2); re-run step 5's script against
    `https://gilesmccrary.com`.
11. ⬜ **Launch**: set `prelaunch` off and `showEditorialNotes` off; redeploy; confirm
    robots.txt allows indexing and pages no longer carry `noindex`.
12. ⬜ **After launch**: moderate daily at first; watch Netlify usage; consider moving
    the field to post-moderation only after real-world experience.

## B. Status

| item | status | notes |
|---|---|---|
| All ten artworks display; catalogue 01–10 | ✅ | |
| No generated imagery | ✅ | |
| Exhibition (five movements), keyboard, reduced motion, mobile | ✅ | |
| Poems preserve formatting | ✅ / ⬜ | mechanism verified; no approved poems yet |
| Field: consent, screening, pre-moderation, reports, removal, moderation | ✅ local / 🟡 live | `npm run test:field` 15/15 |
| Field: concurrency and filing without loss under crashes and races | ✅ local / 🟡 live | must re-verify on Netlify (A5–A6) |
| Field: rate limiting | 🟡 | only exists on Netlify (A5) |
| Shared images match stored compositions; credit legible at 400 px | ✅ | one drawing routine for display and export |
| Privacy page reflects the system, incl. host processing | ✅ draft / ⬜ approval | |
| Participation terms | ✅ draft / ⬜ legal review | |
| Contact delivery, editor sign-in, HTTPS on domain | ⬜ | need deployment |
| Prelaunch noindex | ✅ | on until launch |
