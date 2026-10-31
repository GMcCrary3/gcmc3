import { api, pieceSvg, type PublicPiece } from './field-render';

type ModPiece = PublicPiece & { status: string; reports: number };
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
  info.textContent = `${pieces.length} shown · ${r.data.total ?? 0} pieces in the field`;
  items.replaceChildren(...pieces.map(item));
}

function item(p: ModPiece) {
  const li = document.createElement('li');
  const art = document.createElement('div');
  art.className = 'art';
  art.appendChild(pieceSvg(p));
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.innerHTML = `<span>${p.n ? `no. ${p.n}` : 'not yet filed'} · ${p.at} · reports: ${p.reports}</span> · <span class="st"></span>`;
  meta.querySelector('.st')!.textContent = p.status;
  const btns = document.createElement('p');
  btns.className = 'btns';
  for (const action of ['show', 'hide'] as const) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-btn';
    b.textContent = action;
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
