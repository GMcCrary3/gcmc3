# Adding new work

There are two ways to add work. Both end up in the same place, and the site rebuilds
itself in about two minutes.

## A. With the editor (recommended)

1. Go to **https://gilesmccrary.com/admin/** and sign in with GitHub.
2. Choose **artwork → New work**.
3. Fill in:
   - **reference number**: the next free number, e.g. `11`. This becomes the page address `/artwork/work-11/`.
   - **original image file**: upload the original photograph of the work. Use JPEG or PNG
     in sRGB, at least 2500px on the long side. Don't crop or filter it; the site shows it whole.
   - **image description (alt text)**: one or two plain sentences on what can be seen.
   - **title / year / medium / dimensions / availability**: only what is known.
     *Anything left blank is not published.*
   - **collection**: *selected works* or *archive & process*.
   - **order**: position within the collection (1 comes first).
   - **interpretation or note**: optional text shown beside the work.
4. Click **Save**, then **Publish** (with the review workflow on, set status to *Ready* and
   then **Publish now**).

To **move a work** from the archive into selected works, open it, change *collection* to
*selected works*, set *order*, and publish.

To **change the homepage hero**, go to *settings → site settings → hero*. Choose the
work, and adjust *crop focus* (`50% 45%` = horizontally centred, slightly above middle)
so the most important part of the painting stays visible. The hero is the only place
an image is ever cropped.

## Writing

**writing → New writing**. Choose a *kind* (book, poetry, prose, publication). For poems,
type the poem in the text box: line breaks are kept as written. Description, year,
publisher, cover, and links are all optional and are not shown until filled in.

## B. By hand (for whoever maintains the code)

1. Copy the original file to `src/assets/artwork/11.jpg`.
2. Create `src/content/artwork/work-11.md`:

   ```md
   ---
   ref: "11"
   image: /src/assets/artwork/11.jpg
   alt: "What can be seen in the image."
   title: ""
   year: ""
   medium: ""
   dimensions: ""
   availability: ""
   collection: archive
   order: 5
   draft: false
   ---
   Optional interpretation or note, in Markdown.
   ```

3. `npm run status` to check, `npm run dev` to look, then commit and push to `main`.

## Site copy

Homepage copy, the artist statement, and the about text are under **site copy** in the
editor (or in `src/content/pages/`). Paste approved text exactly. Capitalisation and
wording are rendered as written.
