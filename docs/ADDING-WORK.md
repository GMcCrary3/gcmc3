# Adding and arranging work

Everything below is done in the editor at **https://gilesmccrary.com/admin/** (sign in with
GitHub). Every change is saved as a draft, then published, and the site rebuilds itself in
a couple of minutes. No code needs editing.

## Add a painting

1. **artwork → New work.**
2. **catalogue number**: the next number in your index, e.g. `11`. The page becomes `/artwork/work-11/`.
3. **original image file**: the best photograph you have, straight-on, uncropped beyond
   the canvas edge, unfiltered, JPEG or PNG, ideally 2500px+ on the long side. Keep your own master
   copy too; the site stores this file untouched and makes web copies from it.
4. **image description (alt text)**: what can be seen, in a sentence or two.
5. **title / year / medium / dimensions / description**: only what is confirmed. *Blank fields are
   never published, and a work without a title is shown as “no. 11”.*
6. Optional: **detail photographs**, **works within this photograph** (for one photo of
   several works), **interpretation or note**.
7. **Publish.** Then place it (below).

To **replace a photograph**, open the work and upload the new file in *original image file*.

## Place it on the artwork page

**settings → site settings → gallery.** Add it to *selected works* or the second section
(*archive & process*), and drag to set the order. Placement carries no judgement about a
work's status. A work in neither list still appears at the end of the second section.

## Put it in the exhibition

**exhibition → choose a movement → sequence.** Add a *painting*, choose the work, and drag
it into place. The same screen is where you:

- **reorder** works within a movement;
- add an **interlude** (text between works). Interludes stay hidden from visitors until
  *approved by the artist* is ticked;
- **pair a poem** with a painting. Choose the poem in that painting's *poem visitors may
  reveal* field. Visitors see a quiet "read the poem" control and decide for themselves
  whether to open it;
- write the **closing text** (movement V, *text* field).

Movement names are navigation labels, not titles for the paintings.

## Add a poem or other writing

**writing → New writing.**

- **kind**: poem, prose / essay, book, or publication (elsewhere).
- **text**: paste the poem exactly. Every line break, blank line between stanzas, leading
  space (indent) and punctuation is kept as written. `*asterisks*` around words make italics.
- **from the book**: links a poem or excerpt to *beyond? beyond: words for a captive audience*
  or *act iii*; the book's page then lists it.
- **recorded reading**: optional audio file. It never plays by itself.
- **links**: where to buy or read published editions.

## Splitting no. 10 later

No. 10 is one photograph showing three works, recorded under *works within this
photograph*. To give them separate catalogue entries later, create works `10a`, `10b` and
`10c`, each with its own photograph, and remove (or keep) the grouped entry. Update the
gallery and the exhibition to use the new entries.

## Site copy and settings

- **site copy**: homepage introduction (optional), artist statement, about (biography,
  portrait, publications, exhibitions, press, professional contact).
- **settings**: the identity lines, opening statement and button labels, the homepage crop
  focus, gallery order, the wording of *abstract your own concrete*, availability display,
  contact form, analytics, and the editorial-notes switch.

## By hand (for whoever maintains the code)

Files live in `src/content/` (one Markdown file per work, poem, book, movement) and
`src/data/site.json`. Run `npm run status` to see what's missing, `npm run dev` to preview.
