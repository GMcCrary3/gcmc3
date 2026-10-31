/** Shared client helpers for the field: drawing a piece, talking to the API. */

export type Glyph = { c: string; x: number; y: number; r: number; s: number; f: 0 | 1; t: 0 | 1 };
export type PublicPiece = {
  id: string;
  n: number;
  at: string;
  aspect: 'landscape' | 'portrait';
  base: number;
  glyphs: Glyph[];
};

/**
 * Draws a piece onto a canvas. The field's tiles, the enlarged view, and the
 * shared image all use this one routine (drawGlyphs), so what is shown is
 * exactly what was submitted.
 */
export function pieceSvg(p: PublicPiece, label?: string): HTMLCanvasElement {
  const W = p.aspect === 'portrait' ? 300 : 400;
  const H = p.aspect === 'portrait' ? 400 : 300;
  const dpr = Math.min(2, window.devicePixelRatio || 1) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.className = 'piece-svg';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label ?? pieceLabel(p));
  void fontsReady().then(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    drawGlyphs(ctx, p, W, H, palette());
  });
  return canvas;
}

type Palette = { serif: string; sans: string; ink: string; slate: string };
const palette = (): Palette => ({
  serif: cssVar('--serif', 'Georgia, serif'),
  sans: cssVar('--sans', 'Arial, sans-serif'),
  ink: cssVar('--ink', '#18191b'),
  slate: cssVar('--slate', '#53616d'),
});

let fontsPromise: Promise<unknown> | null = null;
function fontsReady() {
  if (!fontsPromise) {
    const { serif, sans } = palette();
    fontsPromise = Promise.all([
      document.fonts.load(`450 40px ${serif}`),
      document.fonts.load(`italic 450 40px ${serif}`),
      document.fonts.load(`300 40px ${sans}`),
      document.fonts.load(`450 40px ${sans}`),
    ]).catch(() => undefined);
  }
  return fontsPromise;
}

/** The single drawing routine for a composition, in an art area W × H. */
function drawGlyphs(ctx: CanvasRenderingContext2D, c: Composition, W: number, H: number, pal: Palette) {
  const fs = (c.base / 100) * W;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const g of c.glyphs) {
    ctx.save();
    ctx.translate((g.x / 100) * W, (g.y / 100) * H);
    ctx.rotate((g.r * Math.PI) / 180);
    ctx.scale(g.s, g.s);
    ctx.font = g.f ? `300 ${fs}px ${pal.sans}` : `450 ${fs}px ${pal.serif}`;
    ctx.fillStyle = g.t ? pal.slate : pal.ink;
    ctx.fillText(g.c, 0, 0);
    ctx.restore();
  }
}

export const pieceLabel = (p: PublicPiece) =>
  `${p.n ? `piece no. ${p.n.toLocaleString('en')}` : 'a piece just left'}: the letters ${p.glyphs.map((g) => g.c).join(' ')}, abstracted`;

export const pieceUrl = (id: string) => `${location.origin}/field/?piece=${encodeURIComponent(id)}`;

/** Pieces this browser left, with the private token that lets it remove them. */
const MINE = 'field-mine';
export function mine(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MINE) ?? '{}'); } catch { return {}; }
}
export function rememberMine(id: string, token: string) {
  try { localStorage.setItem(MINE, JSON.stringify({ ...mine(), [id]: token })); } catch { /* storage unavailable */ }
}
export function forgetMine(id: string) {
  try { const m = mine(); delete m[id]; localStorage.setItem(MINE, JSON.stringify(m)); } catch { /* ignore */ }
}

export async function api<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

export const reasons: Record<string, string> = {
  language: 'the field does not accept that word. try something else.',
  links: 'the field does not accept links.',
  'contact details': 'the field does not accept emails or phone numbers.',
  characters: 'the field accepts letters, numbers, and simple punctuation.',
  'too long': 'that is too long for the field.',
  closed: 'the field is closed for now.',
  terms: 'please agree to the participation terms first.',
  duplicate: 'this exact piece was already left today. change something, and leave it again.',
  empty: 'the field needs at least one letter.',
};

export function errorMessage(status: number, error?: string) {
  if (status === 429) return 'too many pieces at once. try again in a minute.';
  if (status === 0) return 'the field could not be reached. try again shortly.';
  return (error && reasons[error]) || 'something went wrong. try again shortly.';
}

/** Share a link (and the image, where the device allows), else copy the link. */
export async function share(url: string, text: string, file?: File): Promise<'shared' | 'copied' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (file && nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text: `${text} ${url}`, title: 'abstractly concrete' });
      return 'shared';
    }
    if (nav.share) {
      await nav.share({ url, text, title: 'abstractly concrete' });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
  }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'cancelled'; }
}

/* ------------------------------------------------------------ image export */

export type Composition = Pick<PublicPiece, 'aspect' | 'base' | 'glyphs'>;

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * Draws a composition to a PNG using exactly the geometry the field uses to
 * display stored pieces (positions as % of the art area, size = base% of its
 * width, rotation and scale about each letter's centre), so a shared image
 * matches what was submitted. The credit sits in its own band below the
 * art, never over it.
 */
export async function compositionImage(c: Composition, credit: string[], note: string): Promise<Blob | null> {
  await fontsReady();
  const pal = palette();
  const artW = c.aspect === 'portrait' ? 1200 : 1600;
  const artH = c.aspect === 'portrait' ? 1600 : 1200;
  const unit = artW / 100; // 1% of the width
  const band = Math.round(unit * 19);
  const canvas = document.createElement('canvas');
  canvas.width = artW;
  canvas.height = artH + band;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = cssVar('--ivory-deep', '#e9e4d8');
  ctx.fillRect(0, 0, artW, artH);
  ctx.fillStyle = cssVar('--ivory', '#f3f0e8');
  ctx.fillRect(0, artH, artW, band);
  drawGlyphs(ctx, c, artW, artH, pal);

  // Credit band: below the art, never over it; sized to stay legible small.
  const pad = unit * 4;
  const [title, byline, url] = credit;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = pal.ink;
  ctx.font = `italic 450 ${unit * 4.6}px ${pal.serif}`;
  ctx.fillText(title ?? '', pad, artH + unit * 7);
  ctx.font = `450 ${unit * 2.8}px ${pal.sans}`;
  ctx.fillText(byline ?? '', pad, artH + unit * 11.6);
  ctx.fillStyle = pal.slate;
  ctx.fillText(url ?? '', pad, artH + unit * 15.4);
  if (note) {
    ctx.textAlign = 'right';
    ctx.font = `450 ${unit * 2.4}px ${pal.sans}`;
    ctx.fillText(note, artW - pad, artH + unit * 15.4);
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export const contributionNote = (n?: number) => (n ? `made by a visitor · field no. ${n.toLocaleString('en')}` : 'made by a visitor');
