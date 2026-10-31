import { api, pieceSvg, type PublicPiece } from './field-render';

type ModPiece = PublicPiece & { status: string; reports: number; reasons?: Record<string, number>; held?: string; terms?: string };
const KEY = 'field-moderation-key';
const form = document.querySelector<HTMLFormElement>('[data-key-form]')!;
const panel = document.querySelector<HTMLElement>('[data-panel]')!;
const items = document.querySelector<HTMLOListElement>('[data-items]')!;
const info = document.querySelector<HTMLElement>('[data-info]')!;
let key = '';
try { key = sessionStorage.getItem(KEY) ?? ''; } catch { /* ignore */ }

const auth = () => ({ authorization: `Bearer ${key}` });

async function view(which: 'review' | 'recent') {
  info.textContent = 'loading…';
  const r = await api<{ total?: number; pieces?: ModPiece[] }>(`/api/field/moderate?view=${which}`, { headers: auth() });
  if (r.status === 401) {
    info.textContent = 'that key was not accepted.';
    panel.hidden = true;
    form.hidden = false;
    return;
  }
  if (!r.ok) { info.textContent = 'could not load. try again.'; return; }
  const pieces = r.data.pieces ?? [];
  info.textContent = `${pieces.length} shown · ${r.data.total ?? 0} pieces left in total`;
  shownIds = pieces.map((p) => p.id);
  items.replaceChildren(...pieces.map(item));
}

let shownIds: string[] = [];
async function bulk(action: 'show' | 'hide') {
  if (!shownIds.length) return;
  const label = action === 'show' ? 'Approve' : 'Hide';
  if (!confirm(`${label} all ${shownIds.length} pieces shown?`)) return;
  for (let i = 0; i < shownIds.length; i += 100) {
    await api('/api/field/moderate', { method: 'POST', headers: auth(), body: JSON.stringify({ ids: shownIds.slice(i, i + 100), action }) });
  }
  info.textContent = `${label.toLowerCase()}d ${shownIds.length}. reload the view to check.`;
}
document.querySelector('[data-file-now]')?.addEventListener('click', async () => {
  const r = await api<{ filed?: number }>('/api/field/moderate', { method: 'POST', headers: auth(), body: JSON.stringify({ action: 'file' }) });
  info.textContent = r.ok ? `filed ${r.data.filed ?? 0} piece(s).` : 'filing failed. try again.';
});
document.querySelector('[data-bulk-show]')?.addEventListener('click', () => void bulk('show'));
document.querySelector('[data-bulk-hide]')?.addEventListener('click', () => void bulk('hide'));

function item(p: ModPiece) {
  const li = document.createElement('li');
  const art = document.createElement('div');
  art.className = 'art';
  art.appendChild(pieceSvg(p));
  const meta = document.createElement('p');
  meta.className = 'meta';
  const reasons = Object.entries(p.reasons ?? {}).map(([k, v]) => `${k} ×${v}`).join(', ');
  meta.textContent = [
    p.n ? `no. ${p.n}` : 'not yet filed',
    p.at,
    `letters: ${p.glyphs.map((g) => g.c).join('')}`,
    p.held ? `held: ${p.held}` : '',
    p.reports ? `reports: ${p.reports}${reasons ? ` (${reasons})` : ''}` : '',
    p.terms ? `terms ${p.terms}` : '',
  ].filter(Boolean).join(' · ') + ' · ';
  const st = document.createElement('span');
  st.className = 'st';
  st.textContent = p.status;
  meta.appendChild(st);
  const btns = document.createElement('p');
  btns.className = 'btns';
  for (const action of ['show', 'hide'] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-btn';
    b.textContent = action === 'show' ? 'approve / show' : 'hide';
    b.addEventListener('click', async () => {
      const r = await api<{ status?: string }>('/api/field/moderate', {
        method: 'POST', headers: auth(), body: JSON.stringify({ id: p.id, action }),
      });
      meta.querySelector('.st')!.textContent = r.ok ? (r.data.status ?? '') : 'failed';
    });
    btns.appendChild(b);
  }
  li.append(art, meta, btns);
  return li;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  key = (form.querySelector('input') as HTMLInputElement).value.trim();
  try { sessionStorage.setItem(KEY, key); } catch { /* ignore */ }
  form.hidden = true;
  panel.hidden = false;
  void view('review');
});
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
  b.addEventListener('click', () => void view(b.dataset.view as 'review' | 'recent')),
);
if (key) { form.hidden = true; panel.hidden = false; void view('review'); }
