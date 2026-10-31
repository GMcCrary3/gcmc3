# Design and editorial rules

## Identity
- Central concept: **abstractly concrete.** Secondary line: *the art of unthinking.*
- Opening statement: “Some ideas need to be dismantled before they can be understood.”
- Byline, always lowercase: **giles c mccrary iii**.
- All of these live in `src/data/site.json` (editable under *settings*).

## Palette and type
| token | value | use |
|---|---|---|
| ivory | `#F3F0E8` | background |
| ink | `#18191B` | text (16:1 contrast) |
| slate | `#53616D` | labels, secondary text (5.6:1) |
| oxide | `#982E37` | sparingly: movement numerals, current place, focus rings (6.6:1) |

Cormorant Garamond for editorial headings, reading and poems; Inter for the interface.
Both are self-hosted, so the site makes no font requests to third parties.

## The exhibition
- Five movements plus a prologue, each an ordered list of paintings, interludes, and
  placeholders, stored in `src/content/exhibition/`.
- Visitors stay in control. Ordinary scrolling only: no auto-scrolling, autoplay, or audio.
  Any movement can be reached directly from the index, the guide, or the previous/next links.
- The **guide** (numerals at the right edge on desktop; a slim bar on phones) shows where
  you are and can be hidden. Hiding it is remembered on that device.
- **Enlargement** opens the original file in a full-screen ivory view (native `<dialog>`:
  Escape closes it and focus returns where it was). Nothing is ever laid over the image.
- **Poem reveal** is a native disclosure (`<details>`) that works without JavaScript. On wide
  screens the poem opens beside the painting, on phones beneath it.
- No curatorial explanation of what any painting means.

## abstract your own concrete.
A space where visitors name something concrete and dismantle it themselves (loosen,
scatter, unweight, erase, drag, turn), then optionally save the result as an image. Every
change is a visitor action. It works fully by keyboard, announces changes to screen
readers, and respects reduced motion. Nothing typed there is sent or stored.

## Images
- Masters are kept unaltered in `src/assets/artwork/`. Web copies (AVIF/WebP/JPEG) are made
  at build time, with colour converted to sRGB. No filters, no generative enhancement.
- Only the homepage opening crops a painting. Everywhere else the whole work is shown.
- Images are never laid out larger than their native pixels on detail pages or in the
  exhibition, and the enlargement view shows the file at most at its natural size.

## Editorial safeguards in code
- Blank fields are never published. Untitled works are labelled by catalogue number only.
- Interludes and the artist statement carry an approval flag. Unapproved text is shown only
  while editorial notes are on.
- No poem is paired with a painting unless the artist chooses it.
- Placement in *archive & process* carries no judgement about a work's status.

## Accessibility
Semantic landmarks and headings, a skip link, visible focus (oxide), keyboard access
throughout, alt text on every image, labelled controls, polite live regions, reduced-motion
support, and no information conveyed only by hover or animation.
