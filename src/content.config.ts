import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Every descriptive field is optional. A field left blank is simply not
 * published — nothing is ever filled in automatically.
 */
const optionalText = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const artwork = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/artwork' }),
  schema: z.object({
    /** Site reference number, e.g. "01". Used when no title is published. */
    ref: z.string(),
    /** Path to the original file, e.g. /src/assets/artwork/01.jpg */
    image: z.string(),
    /** Accessible description of what is visible in the image. */
    alt: optionalText,
    title: optionalText,
    year: optionalText,
    medium: optionalText,
    dimensions: optionalText,
    availability: optionalText,
    /** "selected" = selected works; "archive" = archive / process collection. */
    collection: z.enum(['selected', 'archive']).default('archive'),
    order: z.number().default(100),
    draft: z.boolean().default(false),
  }),
});

const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    kind: z.enum(['book', 'poetry', 'prose', 'publication']),
    subtitle: optionalText,
    year: optionalText,
    publisher: optionalText,
    description: optionalText,
    cover: optionalText,
    coverAlt: optionalText,
    links: z
      .array(z.object({ label: z.string(), url: z.string().url() }))
      .optional()
      .default([]),
    order: z.number().default(100),
    draft: z.boolean().default(false),
  }),
});

/** Approved site copy: homepage text, artist statement, about. */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    approved: z.boolean().default(false),
  }),
});

export const collections = { artwork, writing, pages };
