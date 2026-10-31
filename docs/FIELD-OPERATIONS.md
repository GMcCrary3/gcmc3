# the field — consent, moderation, deletion, and failure behaviour

*abstractly concrete / participation.* A participatory artwork by giles c mccrary iii.
Visitors are contributors; giles c mccrary iii is the originating artist. Nothing in the
field is presented as the artist's own work or as individually endorsed by the artist.

---

## 1. What visitors see before leaving a piece

Shown in full, every time, after **leave it for others.** and before anything is sent:

> **before you leave it**
> - Your piece becomes **publicly visible** in the field, a participatory artwork by giles c mccrary iii, alongside pieces by other visitors.
> - Anyone may **view, link to, and share** it, with the field's credit line.
> - It stays until **you remove it** (from its link, on this device) or it is removed in moderation. Copies others have already shared cannot be recalled.
> - **You keep ownership** of what you made. You give the project a non-exclusive licence to show and share it as part of the field.
> - Pieces are reviewed before they appear. No hate, threats, impersonation, or anyone's personal information.
>
> ☐ I have read and agree to the participation terms.  *(required; links to /field/terms/)*
>
> **[ leave it for others. ]**   not yet

The server refuses a piece unless this box was ticked for the **current** terms version,
and stores that version with the piece.

The full **participation terms** are at `/field/terms/` (`src/pages/field/terms.astro`),
version-dated in *settings → the field*. In summary:

1. **What the field is.** A participatory artwork by giles c mccrary iii. Each piece is a
   contribution by the visitor who made it, not created or individually endorsed by the artist.
2. **What leaving a piece means.** Publicly visible; anyone may view, link to and share it
   (including as an image with the credit line); visible until removed; shared copies
   cannot be recalled.
3. **Ownership and licence.** Contributors keep their rights. Leaving a piece grants
   giles c mccrary iii a **non-exclusive, worldwide, royalty-free licence** to display,
   reproduce and share it as part of the field and its documentation (this website,
   exhibitions of the work, publications and records about the work), and permits visitors
   to share it with its credit line through the field's sharing features. The licence lasts
   while the piece remains in the field; after removal no new uses are made, though
   documentation already created may remain.
4. **What may not be left.** Hate, harassment, threats, impersonation, anyone's personal
   information, links/advertising/spam, anything the contributor has no right to share.
5. **Removal.** By the contributor (removal key on their device), or on request via the
   contact page quoting the piece's link.
6. **Privacy.** Points to the privacy page.
7. **No guarantee.** The field may change, pause or end.

> ⚠️ These terms are intended to describe the system accurately but are **not legal advice**. Have them
> reviewed before public launch.

**Credit on every saved or shared image** (in its own band below the composition, never
over it; legible at 400 px wide):

```
abstractly concrete
a participatory artwork by giles c mccrary iii
gilesmccrary.com/field                          made by a visitor · field no. 123
```

---

## 2. Moderation workflow

**Launch setting: pre-moderation.** Every new piece is stored as *pending* and is visible
only to the person who left it (from its link, on their device) until approved.

Before a piece is stored, the server:

| check | result |
|---|---|
| terms not agreed (or out-of-date version) | refused |
| offensive language and slurs (English, including disguised spellings) | refused |
| links, emails, @handles, phone numbers | refused |
| same composition already left today | refused (stops replayed / scripted repeats) |
| more than 4 submissions a minute from one connection | refused by Netlify (rate limit) |
| violent or threatening words | **held** for review, reason "violence" |
| the artist's name, "official", "admin", "moderator", "verified"… | **held**, reason "impersonation" |
| street-address patterns | **held**, reason "personal information" |

The typed word is screened and then discarded; only the letters and their arrangement are kept.

**Reviewing** (`/field/moderate/`, moderation key required):

1. *needs review* lists everything pending (with any **held** reason) and anything reported.
2. For each piece: **approve / show** or **hide**. Or **approve all shown** / **hide all shown**.
3. *most recent* lists everything, newest first.
4. **file waiting pieces now** runs filing immediately (normally automatic, once a minute).

**Reports** (any visitor, from an opened piece, with a reason: hateful, threatening,
someone's personal information, impersonation, spam, something else):
- *threatening* or *personal information*: the piece is hidden at once, pending review;
- other reasons: hidden pending review after three reports.

**Access is authenticated on the server.** The moderation key is the Netlify environment
variable `FIELD_ADMIN_TOKEN` (at least 32 characters). It never appears in the site's
code or in any file sent to browsers. The artist types it into the moderation page, which
keeps it only for that browser tab and sends it with each moderation request. Wrong keys
are refused after a deliberate delay, and the endpoint is rate-limited. (A later
improvement would be single sign-on via Netlify Identity or similar.)

**Moving to immediate publication** later: *settings → the field → moderation → post*.
Held pieces still wait for review; everything else appears at once.

---

## 3. Deletion and removal keys

- **Removal key.** When a piece is left, the server generates a random 24-character key,
  returns it once, and stores only its SHA-256 hash. The visitor's browser keeps the key in
  local storage. "remove my piece" appears only on that device, for that piece.
- **Removing.** The piece's letters are erased from the live record at once and it leaves
  the field; a small empty record (status *removed*) remains so old links resolve to
  "not in the field". Removed pieces cannot be shown again.
- **Lost key.** The contributor sends the piece's link via the contact page; the artist
  hides it in moderation. (A hidden piece's letters remain in storage; if full erasure is
  requested, use the contributor's removal path or ask the maintainer to erase it.)
- **Backups.** The site keeps no backups of its own. Netlify may hold operational copies
  of stored data under its own practices; these are not used to republish anything.
- **Shared copies** (images or links others have saved) cannot be recalled. The terms say so.

---

## 4. If storage or filing fails

No software can promise that data will never be lost or duplicated. What the field has
is a design that makes loss and duplication unlikely, tests that exercise the failure
cases, failures that are visible when they happen, and a manual recovery path.

**Leaving a piece** writes two keys unique to that piece (its index, then the piece). If
storage is unavailable, the request fails and the visitor is told the field could not be
reached and to try again. The visitor either receives their piece's link and removal key,
or sees an error. If only the first write succeeds, an orphaned index entry remains; it
holds no content and is never shown.

**Filing** (numbering pieces into pages of 100) runs once a minute as a scheduled function.
Its safeguards:

1. a lease so two runs do not overlap (a crashed run's lease expires after 55 s);
2. a **journal** of the batch (which piece gets which number and page), written *before*
   anything else changes;
3. pieces are appended to pages, skipping any already there;
4. the counter only moves forward;
5. for each piece, its index is pointed at its page, any newer change made meanwhile (for
   example, a moderation decision) is carried over, and **only then** is the waiting copy
   deleted;
6. the journal is cleared.

If a run stops part-way, the next run finds the journal and completes the same batch with
the same numbers before starting anything new. Every change to a piece carries a revision
number, and the higher revision is kept when two copies briefly exist.

**Seeing problems.**
- Every filing run logs what it filed, any interrupted batch it completed, and any error
  (Netlify → Logs → Functions → `field-file`). A failed run is reported as a failure.
- The moderation page shows a **health line**: pieces filed, pieces waiting, the age of the
  oldest waiting piece, any interrupted batch, and a warning ("filing may be stalled") if
  anything has waited more than five minutes.

**If scheduled filing stops** (for example, Netlify scheduling is unavailable): new pieces
remain in the waiting area, the newest 100 still appear in the field, and the moderation
page still lists up to 500 waiting pieces. Use **file waiting pieces now** on the
moderation page; numbering resumes where it stopped.

**If storage is unavailable for reading**, the field page says "the field is resting. try
again shortly." The exhibition, artwork and writing pages are unaffected.

**What has been tested.** `npm run test:field` (15 tests, run repeatedly, all passing)
covers: 300 simultaneous submissions kept and numbered 1…N; filing deliberately
interrupted after each of 14 storage writes, then recovered with no missing or duplicate
pieces and a correct counter; moderation racing filing 20 times with the decision kept;
the lease preventing overlap. These ran against a local stand-in for Netlify Blobs
configured to behave like production (atomic conditional writes, content ETags). That is
evidence, not proof: the same checks must be repeated on Netlify's real storage and
functions with `scripts/field-verify.mjs` before launch (LAUNCH-CHECKLIST.md).
