import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import site from '../data/site.json';

export type Artwork = CollectionEntry<'artwork'>;
export type Writing = CollectionEntry<'writing'>;

export const isProd = import.meta.env.PROD;

/** Drafts are visible while developing locally, never in a production build. */
const visible = (e: { data: { draft: boolean } }) => !isProd || !e.data.draft;

export async function getArtworks(collection?: 'selected' | 'archive') {
  const all = await getCollection('artwork', visible);
  return all
    .filter((a) => !collection || a.data.collection === collection)
    .sort((a, b) => a.data.order - b.data.order || a.data.ref.localeCompare(b.data.ref));
}

export async function getWriting() {
  const all = await getCollection('writing', visible);
  return all.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export async function getPage(id: 'home' | 'statement' | 'about') {
  return getEntry('pages', id);
}

/**
 * Display label. A painting with no published title is never given one:
 * it is shown by its catalogue reference instead (e.g. "no. 07").
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
