/**
 * Client side of the literary works. Every message about a submission reflects
 * what the server actually confirmed; the visitor's unsent words are kept (in
 * the form and in this browser) until the server has stored them.
 */
import { api } from './field-render';

export type PublicEntry = {
  seq: number; id: string; kind: 'visitor' | 'artist';
  text?: string; display?: string | null; at?: string; removed?: boolean;
};
export type PublicWork = {
  entries: PublicEntry[]; visitorCount: number; every: number | null; sinceMilestone: number;
  awaiting: boolean; milestones: number; open: boolean;
};
type Copy = Record<'success' | 'pending' | 'milestone' | 'empty' | 'error', string>;
type Mine = { id: string; token: string; text: string; at: string };

const MINE = 'works-mine';
const readMine = (project: string): Mine[] => {
  try { return (JSON.parse(localStorage.getItem(MINE) ?? '{}')[project] ?? []) as Mine[]; } catch { return []; }
};
const writeMine = (project: string, list: Mine[]) => {
  try {
    const all = JSON.parse(localStorage.getItem(MINE) ?? '{}');
    all[project] = list;
    localStorage.setItem(MINE, JSON.stringify(all));
  } catch { /* storage unavailable: the key lives only in this page */ }
};
const draftKey = (project: string) => `works-draft-${project}`;

const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const inWords = (n: number) => words[n] ?? String(n);

const refusals: Record<string, string> = {
  terms: 'please agree to the participation terms first.',
  duplicate: 'these exact words were already left here today.',
  'awaiting-artist': 'the work is waiting for the artist. try again after the intervention.',
  closed: 'this work is closed for now.',
  language: 'the work does not accept that language.',
  links: 'the work does not accept links.',
  'contact details': 'the work does not accept emails or phone numbers.',
  'too long': 'that is longer than the work can hold.',
  empty: 'there are no words here yet.',
  impersonation: 'please choose a different name for your credit.',
  'credit too long': 'that credit is too long.',
};

export function load(project: string) {
  return api<PublicWork>(`/api/works/${project}`);
}

/** Wires up the contribution form. `onDraft` receives the unsent text as it changes. */
export function setupForm(project: string, copy: Copy, onDraft: (t: string) => void, onPublished: () => void) {
  const form = document.querySelector<HTMLFormElement>(`[data-works-form][data-project="${project}"]`);
  if (!form) return;
  const text = form.querySelector<HTMLTextAreaElement>('[data-text]')!;
  const count = form.querySelector<HTMLElement>('[data-count]')!;
  const display = form.querySelector<HTMLInputElement>('[data-display]')!;
  const agree = form.querySelector<HTMLInputElement>('[data-agree]')!;
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const max = text.maxLength;

  try { text.value = localStorage.getItem(draftKey(project)) ?? ''; } catch { /* ignore */ }
  const changed = () => {
    count.textContent = text.value.length > max * 0.8 ? `${max - text.value.length} characters left` : '';
    try { localStorage.setItem(draftKey(project), text.value); } catch { /* ignore */ }
    onDraft(text.value);
  };
  text.addEventListener('input', changed);
  changed();

  form.querySelectorAll<HTMLInputElement>('input[name="credit"]').forEach((r) =>
    r.addEventListener('change', () => {
      display.disabled = r.value !== 'name' || !r.checked;
      if (!display.disabled) display.focus();
    }),
  );

  const say = (msg: string, error = false) => {
    status.textContent = msg;
    status.classList.toggle('error', error);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!text.value.trim()) { say(refusals.empty, true); text.focus(); return; }
    if (!agree.checked) { say(refusals.terms, true); agree.focus(); return; }
    submit.disabled = true;
    say('');
    const credit = form.querySelector<HTMLInputElement>('input[name="credit"]:checked')?.value;
    const res = await api<{ id?: string; token?: string; status?: string; error?: string }>('/api/works/submit', {
      method: 'POST',
      body: JSON.stringify({ project, text: text.value, display: credit === 'name' ? display.value : '', agree: agree.value }),
    });
    submit.disabled = false;
    if (res.status === 201 && res.data.id && res.data.token) {
      // Stored on the server: only now is the draft cleared.
      writeMine(project, [...readMine(project), { id: res.data.id, token: res.data.token, text: text.value, at: new Date().toISOString() }]);
      text.value = '';
      try { localStorage.removeItem(draftKey(project)); } catch { /* ignore */ }
      onDraft('');
      agree.checked = false;
      say(res.data.status === 'published' ? copy.success : copy.pending);
      if (res.data.status === 'published') onPublished();
      void renderMine(project);
      return;
    }
    // Not stored: the words stay exactly where they were.
    const known = res.data.error && refusals[res.data.error];
    if (res.status === 429) say('too many contributions at once. wait a minute and try again.', true);
    else say(known || copy.error, true);
  });

  void renderMine(project);
}

/** "your contributions, on this device": status from the server, withdraw, ask for removal. */
export async function renderMine(project: string) {
  const box = document.querySelector<HTMLElement>(`[data-works-form][data-project="${project}"] ~ [data-mine]`);
  const list = box?.querySelector<HTMLUListElement>('[data-mine-list]');
  const mine = readMine(project);
  if (!box || !list || !mine.length) return;
  box.hidden = false;
  const items = await Promise.all(mine.slice(-12).reverse().map(async (m) => {
    const r = await api<{ status?: string; seq?: number | null }>(`/api/works/receipt?project=${project}&id=${m.id}`, { headers: { 'x-works-key': m.token } });
    return { m, status: r.ok ? r.data.status ?? 'unknown' : 'unknown', seq: r.data.seq ?? null };
  }));
  list.replaceChildren(...items.map(({ m, status, seq }) => {
    const li = document.createElement('li');
    const p = document.createElement('p');
    p.className = 'mine-text';
    p.textContent = m.text;
    const meta = document.createElement('p');
    meta.className = 'mine-meta label';
    const label = { pending: 'waiting to be read', published: `in the work, no. ${seq}`, rejected: 'not published', withdrawn: 'withdrawn' }[status] ?? 'status unavailable';
    meta.append(label);
    const act = (text: string, fn: () => Promise<void>) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'text-btn'; b.textContent = text;
      b.addEventListener('click', () => { b.disabled = true; void fn(); });
      meta.append(b);
    };
    if (status === 'pending') act('withdraw', async () => {
      const r = await api('/api/works/withdraw', { method: 'POST', body: JSON.stringify({ project, id: m.id, token: m.token }) });
      meta.firstChild!.textContent = r.ok ? 'withdrawn' : 'could not withdraw just now';
    });
    if (status === 'published' && seq) act('ask for removal', async () => {
      const r = await api('/api/works/request-removal', { method: 'POST', body: JSON.stringify({ project, seq, id: m.id, token: m.token, reason: 'requested by the contributor' }) });
      meta.firstChild!.textContent = r.ok ? 'removal requested' : 'could not send the request just now';
    });
    li.append(p, meta);
    return li;
  }));
}

/** Report a published contribution, with a reason. */
export async function report(project: string, seq: number, reason: string) {
  return api('/api/works/report', { method: 'POST', body: JSON.stringify({ project, seq, reason }) });
}
