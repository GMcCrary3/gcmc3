import { api, compositionImage, contributionNote, forgetMine, mine, pieceLabel, pieceSvg, pieceUrl, share, type PublicPiece } from './field-render';

type ListResponse = { total?: number; page?: number; pages?: number; pieces?: PublicPiece[] };

const list = document.querySelector<HTMLOListElement>('[data-field]')!;
const status = document.querySelector<HTMLElement>('[data-status]')!;
const more = document.querySelector<HTMLButtonElement>('[data-more]')!;
const countEl = document.querySelector<HTMLElement>('[data-count]')!;
const countLabel = document.querySelector<HTMLElement>('[data-count-label]')!;
const viewBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-view]')];
const credit = (document.querySelector<HTMLElement>('[data-credit]')?.dataset.credit ?? '').split('\n');
const reportForm = document.querySelector<HTMLFormElement>('[data-report-form]')!;
const focusState = document.querySelector<HTMLElement>('[data-focus-state]')!;
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
  countLabel.textContent = total === 1 ? 'piece left so far.' : 'pieces left so far.';
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

function open(p: PublicPiece, push = true, state = '') {
  current = p;
  focusState.textContent = state ? `· ${state}` : '';
  reportForm.hidden = true;
  reportBtn.setAttribute('aria-expanded', 'false');
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
  const blob = await compositionImage(current, credit, contributionNote(current.n));
  const file = blob ? new File([blob], `the-field-${current.n || current.id}.png`, { type: 'image/png' }) : undefined;
  const r = await share(pieceUrl(current.id), 'abstractly concrete — a piece of the field.', file);
  focusStatus.textContent = r === 'copied' ? 'link copied.' : r === 'shared' ? 'shared.' : '';
});

reportBtn.addEventListener('click', () => {
  const opening = reportForm.hidden;
  reportForm.hidden = !opening;
  reportBtn.setAttribute('aria-expanded', String(opening));
  if (opening) reportForm.querySelector<HTMLInputElement>('input')?.focus();
});

reportForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const reason = new FormData(reportForm).get('reason');
  const r = await api('/api/field/report', { method: 'POST', body: JSON.stringify({ id: current.id, reason }) });
  reportForm.hidden = true;
  reportBtn.setAttribute('aria-expanded', 'false');
  focusStatus.textContent = r.ok ? 'reported. thank you — it will be reviewed.' : 'could not report just now. try again shortly.';
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

for (const b of viewBtns) {
  b.addEventListener('click', () => {
    const asOne = b.dataset.view === 'one';
    list.classList.toggle('as-one', asOne);
    viewBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
}

more.addEventListener('click', async () => {
  more.disabled = true;
  await load(nextPage);
  more.disabled = false;
});

(async () => {
  await load();
  const id = new URLSearchParams(location.search).get('piece');
  if (id) {
    const key = mine()[id];
    const r = await api<{ piece?: PublicPiece; status?: string }>(`/api/field/piece?id=${encodeURIComponent(id)}`, {
      headers: key ? { 'x-field-key': key } : {},
    });
    if (r.ok && r.data.piece) open(r.data.piece, false, r.data.status === 'awaiting review' ? 'awaiting review — only you can see it until then' : '');
    else status.textContent = 'that piece is not in the field.';
  }
})();
