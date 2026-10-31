# GilesMcCrary.com

**abstractly concrete** — *the art of unthinking.*
Website for the visual art and writing of giles c mccrary iii.

Built with [Astro](https://astro.build) (static site, fast image delivery), edited through
[Decap CMS](https://decapcms.org) at `/admin/`, and hosted on [Netlify](https://netlify.com)
(HTTPS, custom domain, spam-filtered contact form).

| route | what it is |
|---|---|
| `/` | hero (artwork no. 01), approved homepage copy, selected works, books |
| `/artwork/` | selected works (01, 07, 08, 05, 06, 03), then the archive & process collection (09, 04, 02, 10) |
| `/artwork/work-NN/` | one page per work: whole image, only the details that have been filled in |
| `/writing/` and `/writing/<slug>/` | books, poetry, prose, publications |
| `/about/` | artist statement, optional about text |
| `/contact/` | contact form with spam protection and a privacy note |
| `/privacy/` | how contact details and visitor data are handled |
| `/admin/` | the content editor |

## Before launch: what still has to be supplied

Nothing on the site was invented. Fields left blank are **not published**. The site
ships with **editorial notes** (dashed boxes) showing where content still has to go.
To see what's outstanding at any point, run `npm run status`.

1. **The ten original image files.** Save them as `src/assets/artwork/01.jpg` … `10.jpg`, using
   the upload numbering (`.png` / `.webp` also work, with the same number as the name).
   No image is shown until the real file is there.
2. **Approved homepage copy:** `src/content/pages/home.md` (paste below the `---` lines).
3. **Approved artist statement:** `src/content/pages/statement.md`.
4. **Image descriptions (alt text)** for each work. No. 01 has a draft taken from the brief; please confirm it.
5. Optional per work: title, year, medium, dimensions, availability, note.
6. Optional per book: description, year, publisher, links, cover, excerpt.
7. **Privacy page:** read `src/pages/privacy.astro` and confirm the wording.
8. **Analytics:** off until the artist approves. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#analytics).
9. When everything is in, set `"showEditorialNotes": false` in `src/data/site.json` (or under
   *settings* in the editor). The notes then disappear.

## Working on the site locally

Requires Node 20.3+ (22 recommended).

```sh
npm install
npm run dev          # http://localhost:4321
npm run cms          # optional, in a second terminal: edit locally at http://localhost:4321/admin/
npm run build        # type-check and build to dist/
npm run preview      # serve the built site
npm run status       # list missing images, empty fields, unapproved copy
```

## More

- [docs/ADDING-WORK.md](docs/ADDING-WORK.md): the simple process for adding new artwork and writing
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Netlify, custom domain, the editor login, the contact form, analytics
- [docs/DESIGN.md](docs/DESIGN.md): design decisions and editorial rules built into the code

## Where things live

```
src/assets/artwork/      original artwork files (never altered; web copies are made at build)
src/content/artwork/     one .md file per work (fields + optional note)
src/content/writing/     one .md file per book, poem, prose piece, or publication
src/content/pages/       approved site copy: home, statement, about
src/data/site.json       site settings: byline, concept line, hero focus, form, analytics
src/pages/               the routes
src/components/          image, caption, SEO, and editorial-note components
public/admin/            the content editor
netlify.toml             build, security headers, www → apex redirect
```
