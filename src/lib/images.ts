import type { ImageMetadata } from 'astro';

/**
 * Resolves image paths stored in content files (e.g. "/src/assets/artwork/01.jpg")
 * to the actual files in src/assets. If the exact file is missing, any file with
 * the same name but a different extension (01.png, 01.tif → not supported, 01.webp …)
 * is used instead. Missing files resolve to undefined and render a neutral
 * placeholder — no image is ever generated or substituted.
 */
const optimised = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}',
  { eager: true },
);

/** URLs of the untouched original files, emitted as-is for "view full image". */
const originals = import.meta.glob<string>(
  '/src/assets/**/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}',
  { eager: true, query: '?url', import: 'default' },
);

const normalise = (p: string) => {
  const clean = p.trim().replace(/^\.?\/?/, '/');
  return clean.startsWith('/src/') ? clean : `/src/assets${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const stem = (p: string) => p.replace(/\.[^./]+$/, '').toLowerCase();

function findKey(path: string | undefined, table: Record<string, unknown>) {
  if (!path) return undefined;
  const wanted = normalise(path);
  if (wanted in table) return wanted;
  const wantedStem = stem(wanted);
  return Object.keys(table).find((k) => stem(k) === wantedStem);
}

export function resolveImage(path: string | undefined): ImageMetadata | undefined {
  const key = findKey(path, optimised);
  return key ? optimised[key].default : undefined;
}

export function originalUrl(path: string | undefined): string | undefined {
  const key = findKey(path, originals);
  return key ? originals[key] : undefined;
}
