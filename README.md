# GilesMcCrary.com

**abstractly concrete** — *the art of unthinking.*
Website for the visual art and writing of giles c mccrary iii.

An interactive exhibition, artwork archive, and literary archive.

Built with [Astro](https://astro.build) (static site, fast image delivery; chosen over Next.js because
the site needs no server, which keeps it faster, simpler, and more secure), edited through
[Decap CMS](https://decapcms.org) at `/admin/`, and hosted on [Netlify](https://netlify.com)
(HTTPS, custom domain, spam-filtered contact form).

| route | what it is |
|---|---|
| `/` | full-viewport opening: artwork no. 01, *abstractly concrete.*, *the art of unthinking.*, the opening statement, "Enter the exhibition" / "Explore the artwork" |
| `/exhibition/` | **the primary experience**: five movements of paintings, interludes and optional poem reveals, with a hideable movement guide, previous/next controls and enlargement |
| `/abstract/` | *abstract your own concrete.* — visitors name something concrete and take it apart themselves (loosen, scatter, unweight, erase, drag); they can save the result as an image. Nothing they type leaves their browser |
| `/field/` | **the field.** — *abstractly concrete / participation*: a participatory artwork. Visitors' contributions, *seen as one.* or *one by one.*; each has its own link and shareable image |
| `/field/terms/` | participation terms (draft, pending legal review) |
| `/field/moderate/` | the artist's private moderation view (needs the moderation key) |
| `/artwork/` | selected works (01, 07, 08, 05, 06, 03), then archive & process (09, 04, 02, 10) |
| `/artwork/work-NN/` | one page per work: the whole image, enlargeable, only confirmed details, a link to where it hangs in the exhibition |
| `/writing/` and `/writing/<slug>/` | books, poems (exact line breaks), prose, publications, optional readings |
| `/about/` | artist statement, biography, portrait, publications, exhibitions, press, professional contact. Each appears only once it has content |
| `/contact/`, `/privacy/` | contact form with spam protection, and how contact details are handled |
| `/admin/` | the content editor |

## Before launch: what still has to be supplied

Nothing on the site was invented. Fields left blank are **not published**. Text that
has not been approved (interludes, the working artist statement) is visible only while
**editorial notes** are switched on. Run `npm run status` to see what's outstanding.

1. **Better photographs** of the low-resolution works: 10, 09, 03, 04, 06, 05 and 02 (all under
   800px wide). Replace a file under the same number. The site never enlarges an image
   beyond its native size on detail pages or in the exhibition.
2. **Site copy**: the artist's approved copy is in place on every page (home, about,
   selected works, archive & process, words, books, the exhibition, the field, contact, footer),
   stored in `src/content/pages/` and editable under *site copy*. Copy for *the unfinished
   sentence* and *the space between us* is stored, not shown, until those installations exist.
   The older working artist statement is hidden unless marked approved.
3. **Interludes**: the proposed prologue interlude and the movement II slot await the
   artist's text and approval.
4. **Poems**: add approved poems under *writing*, then pair them with paintings in
   *exhibition* (see docs/ADDING-WORK.md). No poem is paired until the artist chooses.
5. **Closing text** for movement V, *Without conclusion*.
6. **Image descriptions (alt text)**: drafts for all ten works. Please review.
7. Optional: titles, years, media, dimensions, descriptions; biography and portrait; book details.
8. **Privacy page** and **analytics** approval. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#analytics).
9. At launch, set *show editorial notes* to off under *settings*.

The production deployment checklist, with what has and has not been verified, is in
[docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md). The field's consent language,
moderation, deletion and failure behaviour are in
[docs/FIELD-OPERATIONS.md](docs/FIELD-OPERATIONS.md). The site stays hidden from search
engines (`prelaunch`) until launch is approved.

## Working on the site locally

Requires Node 20.3+ (22 recommended).

```sh
npm install
npm run dev          # http://localhost:4321
npm run cms          # optional, in a second terminal: edit locally at http://localhost:4321/admin/
npm run build        # type-check and build to dist/
npm run preview      # serve the built site
npm run status       # list missing images, empty fields, unapproved copy
npm run field:dev    # after a build: the whole site *with the field working*, at http://localhost:8888
npm run test:field   # automated tests for the field (consent, moderation, concurrency, crash recovery)
```

## More

- [docs/ADDING-WORK.md](docs/ADDING-WORK.md): the simple process for adding new artwork and writing
- [docs/NETLIFY-SETUP.md](docs/NETLIFY-SETUP.md): connecting Netlify for the private preview, step by step
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Netlify, custom domain, the editor login, the contact form, analytics
- [docs/DESIGN.md](docs/DESIGN.md): design decisions and editorial rules built into the code

## Where things live

```
src/assets/artwork/      original artwork files (never altered; web copies are made at build)
src/content/artwork/     one .md file per work (fields + optional note)
src/content/writing/     one .md file per book, poem, prose piece, or publication
src/content/exhibition/  the five movements (and prologue): sequence, interludes, poem pairings
src/content/pages/       site copy: home, statement, about (biography, portrait, lists)
src/data/site.json       settings: identity lines, opening statement, hero, gallery order,
                         the abstract-your-own space's wording, form, analytics
src/pages/               the routes
src/components/          image, caption, SEO, and editorial-note components
public/admin/            the content editor
netlify/functions/       the field's server side: leave, read, report, remove, moderate, file
netlify.toml             build, security headers, www → apex redirect
```
