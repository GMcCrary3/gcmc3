import { api, forgetMine, mine, pieceLabel, pieceSvg, pieceUrl, share, type PublicPiece } from './field-render';

type ListResponse = { total?: number; page?: number; pages?: number; pieces?: PublicPiece[] };

const list = document.querySelector<HTMLOListElement>('[data-field]')!;
const status = document.querySelector<HTMLElement>('[data-status]')!;
const more = document.querySelector<HTMLButtonElement>('[data-more]')!;
const countEl = document.querySelector<HTMLElement>('[data-count]')!;
const countLabel = document.querySelector<HTMLElement>('[data-count-label]')!;
const toggle = document.querySelector<HTMLButtonElement>('[data-view-toggle]')!;
const focus = document.querySelector<HTMLElement>('[data-focus]')!;
const focusArt = focus.querySelector<HTMLElement>('[data-focus-art]')!;
const focusTitle = focus.querySelector<HTMLElement>('[data-focus-title]')!;
const focusStatus = focus.querySelector<HTMLElement>('[data-focus-status]')!;
const removeBtn = focus.querySelector<HTMLButtonElement>('[data-remove]')!;
const reportBtn = focus.querySelector<HTMLButtonElement>('[data-report]')!;

const seen = new Set<string>();
let nextPage = -1;
let current: PublicPiece | null = null;
let lastOpener: HTMLElement | null = null;

const title = (p: PublicPiece) => (p.n ? `piece no. ${p.n.toLocaleString('en')}` : 'just left') + ` · ${p.at}`;

function tile(p: PublicPiece) {
  const li = document.createElement('li');
  li.dataset.id = p.id;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tile';
  btn.setAttribute('aria-label', `${pieceLabel(p)}. open`);
  btn.appendChild(pieceSvg(p, ''));
  btn.querySelector('svg')?.setAttribute('aria-hidden', 'true');
  btn.addEventListener('click', () => { lastOpener = btn; open(p); });
  const cap = document.createElement('span');
  cap.className = 'cap label';
  cap.textContent = p.n ? `no. ${p.n.toLocaleString('en')}` : 'just left';
  li.append(btn, cap);
  return li;
}

function add(pieces: PublicPiece[]) {
  const frag = document.createDocumentFragment();
  for (const p of pieces) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    frag.appendChild(tile(p));
  }
  list.appendChild(frag);
}

function setCount(total: number) {
  countEl.textContent = total.toLocaleString('en');
  countLabel.textContent = total === 1 ? 'piece so far.' : 'pieces so far.';
}

async function load(page?: number) {
  const res = await api<ListResponse>(page === undefined ? '/api/field' : `/api/field?page=${page}`);
  if (!res.ok) {
    status.textContent = 'the field is resting. try again shortly.';
    return;
  }
  const d = res.data;
  setCount(d.total ?? 0);
  add(d.pieces ?? []);
  status.textContent = seen.size ? '' : 'the field is empty. be the first to leave something.';
  nextPage = (d.page ?? 0) - 1;
  more.hidden = nextPage < 0;
}

function open(p: PublicPiece, push = true) {
  current = p;
  focusArt.replaceChildren(pieceSvg(p));
  focusTitle.textContent = title(p);
  focusStatus.textContent = '';
  removeBtn.hidden = !mine()[p.id];
  reportBtn.hidden = Boolean(mine()[p.id]);
  focus.hidden = false;
  if (push) history.replaceState(null, '', `?piece=${encodeURIComponent(p.id)}`);
  focus.scrollIntoView({ block: 'start' });
  focus.focus({ preventScroll: true });
}

function close() {
  focus.hidden = true;
  current = null;
  history.replaceState(null, '', location.pathname);
  lastOpener?.focus();
}

focus.querySelector('[data-close]')!.addEventListener('click', close);
focus.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

focus.querySelector('[data-share]')!.addEventListener('click', async () => {
  if (!current) return;
  const r = await share(pieceUrl(current.id), 'abstractly concrete — a piece of the field.');
  focusStatus.textContent = r === 'copied' ? 'link copied.' : r === 'shared' ? 'shared.' : '';
});

reportBtn.addEventListener('click', async () => {
  if (!current) return;
  if (!confirm('Report this piece for review? It will be looked at, and hidden if it does not belong here.')) return;
  const r = await api('/api/field/report', { method: 'POST', body: JSON.stringify({ id: current.id }) });
  focusStatus.textContent = r.ok ? 'reported. thank you.' : 'could not report just now. try again shortly.';
});

removeBtn.addEventListener('click', async () => {
  if (!current) return;
  const token = mine()[current.id];
  if (!token || !confirm('Remove your piece from the field? This cannot be undone.')) return;
  const r = await api('/api/field/remove', { method: 'POST', body: JSON.stringify({ id: current.id, token }) });
  if (r.ok) {
    forgetMine(current.id);
    list.querySelector(`li[data-id="${current.id}"]`)?.remove();
    focusStatus.textContent = 'removed.';
    focusArt.replaceChildren();
    removeBtn.hidden = true;
  } else {
    focusStatus.textContent = 'could not remove it just now. try again shortly.';
  }
});

toggle.addEventListener('click', () => {
  const asOne = list.classList.toggle('as-one');
  toggle.setAttribute('aria-pressed', String(asOne));
});

more.addEventListener('click', async () => {
  more.disabled = true;
  await load(nextPage);
  more.disabled = false;
});

(async () => {
  await load();
  const id = new URLSearchParams(location.search).get('piece');
  if (id) {
    const r = await api<{ piece?: PublicPiece }>(`/api/field/piece?id=${encodeURIComponent(id)}`);
    if (r.ok && r.data.piece) open(r.data.piece, false);
    else status.textContent = 'that piece is no longer in the field.';
  }
})();
