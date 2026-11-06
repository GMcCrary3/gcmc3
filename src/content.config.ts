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

const imageRef = z.object({
  image: z.string(),
  alt: optionalText,
  caption: optionalText,
});

const listOf = <T extends z.ZodTypeAny>(t: T) =>
  z.array(t).optional().nullable().transform((v) => v ?? []);

const artwork = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/artwork' }),
  schema: z.object({
    /** Catalogue number from the artist's index: "01" … "10" (or "10a" if split later). */
    ref: z.string(),
    /** Original image file, e.g. /src/assets/artwork/01.png */
    image: z.string(),
    /** Accessible description of what is visible in the image. */
    alt: optionalText,
    title: optionalText,
    year: optionalText,
    medium: optionalText,
    dimensions: optionalText,
    /** Artist-approved description. Published only when supplied. */
    description: optionalText,
    /** Shown only when availability display is switched on in site settings. */
    availability: optionalText,
    /** Additional close-up or detail photographs. */
    details: listOf(imageRef),
    /**
     * Separate works or panels shown in one photograph (e.g. the three works in
     * no. 10). Keep them grouped here, or split them into their own entries
     * later (10a, 10b, 10c) — see docs/ADDING-WORK.md.
     */
    parts: listOf(
      z.object({
        label: optionalText,
        image: optionalText,
        alt: optionalText,
        note: optionalText,
      }),
    ),
    draft: z.boolean().default(false),
  }),
});

const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    kind: z.enum(['book', 'poetry', 'prose', 'publication']),
    subtitle: optionalText,
    /** For a poem or excerpt: the id of the book it belongs to. */
    book: optionalText,
    year: optionalText,
    publisher: optionalText,
    description: optionalText,
    cover: optionalText,
    coverAlt: optionalText,
    /** Optional recorded reading, approved by the artist. Never autoplays. */
    audio: optionalText,
    links: listOf(z.object({ label: z.string(), url: z.string().url() })),
    order: z.number().default(100),
    draft: z.boolean().default(false),
  }),
});

const linkItem = z.object({ text: z.string(), url: optionalText });

/** Approved site copy: homepage text, artist statement, about. */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    approved: z.boolean().default(false),
    /** The section's heading, as the artist wrote it. */
    heading: optionalText,
    /** A line under the heading (e.g. "artist. writer."). */
    subheading: optionalText,
    /** The bold opening line. */
    lead: optionalText,
    portrait: optionalText,
    portraitAlt: optionalText,
    publications: listOf(linkItem),
    exhibitions: listOf(linkItem),
    press: listOf(linkItem),
    professionalContact: optionalText,
  }),
});

/** The exhibition: five movements, each an ordered list of works and interludes. */
const exhibition = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/exhibition' }),
  schema: z.object({
    numeral: z.string(),
    title: z.string(),
    order: z.number(),
    items: listOf(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('artwork'),
          /** Artwork entry id, e.g. "work-01". */
          work: z.string(),
          /** Optional poem (writing entry id) the visitor may choose to reveal. */
          poem: optionalText,
        }),
        z.object({
          type: z.literal('interlude'),
          label: optionalText,
          text: optionalText,
          /** Who wrote it / where it comes from, shown only to editors. */
          source: optionalText,
          /** Interludes are published only once the artist approves the text. */
          approved: z.boolean().default(false),
        }),
        z.object({
          /** A placeholder for a poem pairing the artist has yet to choose. */
          type: z.literal('poem-slot'),
          note: optionalText,
        }),
      ]),
    ),
  }),
});

export const collections = { artwork, writing, pages, exhibition };
