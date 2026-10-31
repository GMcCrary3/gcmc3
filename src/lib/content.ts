import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import site from '../data/site.json';

export type Artwork = CollectionEntry<'artwork'>;
export type Writing = CollectionEntry<'writing'>;
export type Movement = CollectionEntry<'exhibition'>;
export type MovementItem = Movement['data']['items'][number];

export const isProd = import.meta.env.PROD;

/** Drafts are visible while developing locally, never in a production build. */
const visible = (e: { data: { draft: boolean } }) => !isProd || !e.data.draft;

const byRef = (a: Artwork, b: Artwork) =>
  a.data.ref.localeCompare(b.data.ref, 'en', { numeric: true });

/** All artworks in catalogue order (01, 02 … 10). */
export async function getArtworks() {
  return (await getCollection('artwork', visible)).sort(byRef);
}

export async function getWriting() {
  const all = await getCollection('writing', visible);
  return all.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export async function getPage(id: 'home' | 'statement' | 'about') {
  return getEntry('pages', id);
}

/** Movements in order. The prologue (order 0) is not a numbered movement. */
export async function getMovements() {
  const all = (await getCollection('exhibition')).sort((a, b) => a.data.order - b.data.order);
  return {
    prologue: all.find((m) => m.data.order === 0),
    movements: all.filter((m) => m.data.order > 0),
  };
}

export const movementAnchor = (m: Movement) => `movement-${m.data.numeral.toLowerCase()}`;

/** Catalogue range for a movement, e.g. "01 → 08". */
export function movementRange(m: Movement, works: Map<string, Artwork>) {
  const refs = m.data.items
    .filter((i): i is Extract<MovementItem, { type: 'artwork' }> => i.type === 'artwork')
    .map((i) => works.get(i.work)?.data.ref)
    .filter(Boolean);
  return refs.join(' → ');
}

/** Where a work appears in the exhibition (for "back to the exhibition" links). */
export async function findMovementFor(workId: string) {
  const { movements } = await getMovements();
  return movements.find((m) => m.data.items.some((i) => i.type === 'artwork' && i.work === workId));
}

/** Poems paired with a work anywhere in the exhibition. */
export async function poemsPairedWith(workId: string) {
  const { movements } = await getMovements();
  const ids = movements
    .flatMap((m) => m.data.items)
    .filter((i): i is Extract<MovementItem, { type: 'artwork' }> => i.type === 'artwork' && i.work === workId)
    .map((i) => i.poem)
    .filter((p): p is string => Boolean(p));
  const writing = await getWriting();
  return writing.filter((w) => ids.includes(w.id));
}

/** An interlude is shown publicly only when approved and non-empty. */
export const interludeIsPublic = (i: Extract<MovementItem, { type: 'interlude' }>) =>
  i.approved && Boolean(i.text);

/**
 * Display label. A painting with no published title is never given one:
 * it is shown by its catalogue number instead (e.g. "no. 07").
 */
export function artworkLabel(a: Artwork) {
  return a.data.title ?? `no. ${a.data.ref}`;
}

export function artworkAlt(a: Artwork) {
  if (a.data.alt) return a.data.alt;
  const t = a.data.title ? `“${a.data.title}”, ` : '';
  return `${t}artwork by ${site.byline} (no. ${a.data.ref}).`;
}

export const writingKinds: Record<Writing['data']['kind'], string> = {
  book: 'books',
  poetry: 'poetry',
  prose: 'prose',
  publication: 'publications',
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Renders a poem exactly as written: every line break, blank-line stanza
 * break, leading space and punctuation is kept. Only *italic* / _italic_ and
 * **bold** markers are interpreted; nothing else is changed.
 */
export function poemToHtml(raw: string) {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '');
  const stanzas = text.split(/\n[ \t]*\n/);
  const inline = (line: string) =>
    escapeHtml(line)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\\*])\*(?!\s)(.+?)(?<!\s)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^\w\\])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/\\([*_\\])/g, '$1');
  return stanzas
    .map((st) => {
      const lines = st.split('\n').map((l) => `<span class="line">${inline(l) || '&nbsp;'}</span>`);
      return `<p class="stanza">${lines.join('')}</p>`;
    })
    .join('');
}
