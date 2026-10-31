# Design and editorial rules

## Identity
- Central concept: **abstractly concrete**. Secondary line: *the art of unthinking.*
- The byline is always lowercase: **giles c mccrary iii**.
- Both strings live in `src/data/site.json` and are used everywhere from there.

## Look
- Gallery ivory (`#f5f1e8`) and dark ink (`#161513`). Grey is used only for labels, and
  there are no accent colours. The paintings supply the colour.
- Type: Newsreader (a text serif with optical sizes) for reading and display. Inter Tight,
  small and lowercase, for gallery-style labels. Both are self-hosted, so the site makes
  no font requests to third parties.
- Negative space: wide gutters, large vertical rhythm, and an irregular two-column gallery
  so the selected works are hung rather than tiled.

## Images
- Original files are kept unaltered in `src/assets/artwork/`. At build time Astro/sharp
  makes resized AVIF, WebP, and JPEG copies, converting any colour profile to sRGB so
  browsers show the colours faithfully. No filters, no AI, no retouching.
- The homepage hero is the only crop (`object-fit: cover`, with focus point set in settings).
  Gallery thumbnails and artwork pages always show the whole work. Each artwork page also
  links to the untouched original file ("view full image").
- A missing file shows an empty, labelled frame, never a substitute image.

## Editorial safeguards in code
- Every descriptive field is optional. Blank fields render nothing; they are never filled
  with defaults.
- Works without a title are labelled by catalogue number (`no. 07`), never given a title.
- Writing pages show only the title and byline until a description, text, or links are
  supplied.
- Editorial notes (dashed boxes) mark what is still pending. They switch off with
  `showEditorialNotes: false`.

## Motion and accessibility
- One effect: a slow, short fade-in as content scrolls into view, plus soft hover states.
  These are disabled entirely under `prefers-reduced-motion`, and content is never hidden
  when JavaScript is off.
- Skip link, visible focus outlines, `aria-current` on navigation, labelled form fields,
  and alt text on every image (with a factual fallback until real descriptions are written).
- Text colours meet WCAG AA contrast on ivory.
