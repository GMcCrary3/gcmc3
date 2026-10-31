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

const SVG = 'http://www.w3.org/2000/svg';

/** Draws a piece as an SVG, from its stored letters and positions. */
export function pieceSvg(p: PublicPiece, label?: string): SVGSVGElement {
  const W = p.aspect === 'portrait' ? 300 : 400;
  const H = p.aspect === 'portrait' ? 400 : 300;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'piece-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label ?? pieceLabel(p));
  const fs = (p.base / 100) * W;
  for (const g of p.glyphs) {
    const t = document.createElementNS(SVG, 'text');
    t.textContent = g.c;
    t.setAttribute('transform', `translate(${(g.x / 100) * W} ${(g.y / 100) * H}) rotate(${g.r}) scale(${g.s})`);
    t.setAttribute('font-size', String(fs));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('class', [g.f ? 'sans' : '', g.t ? 'slate' : ''].join(' ').trim());
    svg.appendChild(t);
  }
  return svg;
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
