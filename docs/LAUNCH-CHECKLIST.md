# Launch acceptance checklist

Status as of the latest build. ✅ verified · 🟡 built, needs verifying after deployment ·
⬜ waiting on the artist or on access.

| criterion | status | notes |
|---|---|---|
| Every artwork displays correctly | ✅ | All ten render in the archive, the exhibition, and on their own pages (checked in a desktop and phone browser) |
| Artwork numbers match the original catalogue | ✅ | 01–10 per the artist's contact sheet |
| No artwork replaced with generated imagery | ✅ | Only the supplied files are used, stored unaltered |
| Poems preserve exact formatting | ✅ / ⬜ | Line breaks, stanzas, indents and italics verified with a test text; no approved poems added yet |
| All navigation works | ✅ | Main nav, movement index, guide, previous/next, archive ↔ exhibition links |
| Mobile layouts are usable | ✅ | Checked at 390px and 820px; no horizontal scrolling |
| Keyboard navigation works | ✅ | Tab order, enlargement (Escape returns focus), poem reveal, guide, abstract space |
| Reduced-motion settings respected | ✅ | Fades, smooth scrolling and transitions disabled |
| The field: leave, view, share, report, remove, moderate | ✅ local / 🟡 live | Tested end to end against a local Netlify Blobs server, including 250 simultaneous submissions (all kept, numbered without gaps or duplicates), word screening, reporting, owner removal and moderation. Must be re-checked once deployed |
| Field moderation key set | ⬜ | `FIELD_ADMIN_TOKEN` in Netlify (docs/DEPLOYMENT.md) |
| Field wording approved | ⬜ | Title, subtitle, consent text, button labels (settings → the field) |
| Contact submissions delivered | 🟡 | Netlify Forms is wired up; delivery can only be tested once the site is deployed with email notifications set |
| Content editable without programming | 🟡 | Editor configuration complete; sign-in needs Netlify + GitHub OAuth (docs/DEPLOYMENT.md) |
| HTTPS on the intended domain | ⬜ | Not deployed. Requires the Netlify site and DNS (docs/DEPLOYMENT.md) |
| Artist statement approved | ⬜ | Working version in place |
| Interludes, poem pairings, closing text | ⬜ | Structure built; text awaits the artist |
| Higher-resolution photographs | ⬜ | 10, 09, 03, 04, 06, 05, 02 |
| Privacy page confirmed, analytics approved | ⬜ | Analytics off until approved |
| Editorial notes switched off | ⬜ | Last step before launch |

Production deployment and domain connection are **not** complete and should not be
described as complete until verified on the live domain.
