/**
 * abstract your own concrete — the visitor's own dismantling.
 * Letters are positioned in percentages of the field so the composition
 * survives any screen size. Every change is a deliberate visitor action:
 * nothing moves on its own. Nothing typed here leaves the browser.
 */

type Glyph = {
  ch: string;
  x: number; // % of field width (centre)
  y: number; // % of field height (centre)
  r: number; // degrees
  s: number; // scale
  sans: boolean;
  slate: boolean;
  el: HTMLButtonElement;
};

import { api, compositionImage, contributionNote, errorMessage, pieceUrl, rememberMine, share } from './field-render';

const form = document.querySelector<HTMLFormElement>('[data-name-form]');
const wrap = document.querySelector<HTMLElement>('[data-field-wrap]');
const field = document.querySelector<HTMLElement>('[data-field]');
const remains = document.querySelector<HTMLElement>('[data-remains]');
const live = document.querySelector<HTMLElement>('[data-live]');

if (form && wrap && field && remains && live) {
  const input = form.querySelector<HTMLInputElement>('input')!;
  let word = '';
  let glyphs: Glyph[] = [];
  let base = 10; // font size in cqw

  const rand = (min: number, max: number) => min + Math.random() * (max - min);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const say = (msg: string) => { live.textContent = ''; requestAnimationFrame(() => (live.textContent = msg)); };
  const left = () => glyphs.map((g) => g.ch).join('');

  const render = (g: Glyph) => {
    g.el.style.setProperty('--x', `${(g.x / 100) * field.clientWidth}px`);
    g.el.style.setProperty('--y', `${(g.y / 100) * field.clientHeight}px`);
    g.el.style.setProperty('--r', `${g.r}deg`);
    g.el.style.setProperty('--s', String(g.s));
    g.el.classList.toggle('sans', g.sans);
    g.el.classList.toggle('slate', g.slate);
  };
  const renderAll = () => glyphs.forEach(render);

  const concreteLayout = () => {
    const chars = [...word];
    const n = chars.length;
    base = clamp(78 / (n * 0.56), 4, 16);
    const step = base * 0.56;
    const start = 50 - ((n - 1) * step) / 2;
    return chars.map((ch, i) => ({ ch, x: start + i * step, y: 50, r: 0, s: 1, sans: false, slate: false }));
  };

  const build = () => {
    field.querySelectorAll('.glyph').forEach((el) => el.remove());
    glyphs = concreteLayout()
      .filter((g) => g.ch.trim() !== '')
      .map((g) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'glyph';
        el.textContent = g.ch;
        el.style.setProperty('--fs', `${base}cqw`);
        el.setAttribute('aria-label', `letter ${g.ch}`);
        field.appendChild(el);
        const glyph: Glyph = { ...g, el };
        attach(glyph);
        return glyph;
      });
    remains.hidden = true;
    renderAll();
    resetLeave();
  };

  const remove = (g: Glyph) => {
    const i = glyphs.indexOf(g);
    if (i < 0) return;
    g.el.remove();
    glyphs.splice(i, 1);
    if (glyphs.length === 0) {
      remains.hidden = false;
      say(remains.textContent ?? '');
    } else {
      say(`erased ${g.ch}. remaining: ${left().split('').join(' ')}`);
      glyphs[Math.min(i, glyphs.length - 1)].el.focus();
    }
  };

  // Dragging with mouse, pen, or touch.
  function attach(g: Glyph) {
    let dragging = false;
    let ox = 0, oy = 0;
    g.el.addEventListener('pointerdown', (e) => {
      dragging = true;
      g.el.setPointerCapture(e.pointerId);
      g.el.classList.add('dragging');
      const rect = field!.getBoundingClientRect();
      ox = ((e.clientX - rect.left) / rect.width) * 100 - g.x;
      oy = ((e.clientY - rect.top) / rect.height) * 100 - g.y;
    });
    g.el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = field!.getBoundingClientRect();
      g.x = clamp(((e.clientX - rect.left) / rect.width) * 100 - ox, 0, 100);
      g.y = clamp(((e.clientY - rect.top) / rect.height) * 100 - oy, 0, 100);
      render(g);
    });
    const end = () => { dragging = false; g.el.classList.remove('dragging'); };
    g.el.addEventListener('pointerup', end);
    g.el.addEventListener('pointercancel', end);

    // Keyboard: arrows move, [ ] turn, Delete/Backspace erases.
    g.el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 8 : 2;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      if (moves[e.key]) {
        e.preventDefault();
        g.x = clamp(g.x + moves[e.key][0], 0, 100);
        g.y = clamp(g.y + moves[e.key][1], 0, 100);
        render(g);
      } else if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        g.r += e.key === '[' ? -15 : 15;
        render(g);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove(g);
      }
    });
  }

  const actions: Record<string, () => void> = {
    loosen() {
      glyphs.forEach((g) => {
        g.x = clamp(g.x + rand(-4, 4), 2, 98);
        g.y = clamp(g.y + rand(-6, 6), 2, 98);
        g.r += rand(-14, 14);
      });
      renderAll();
      say('loosened.');
    },
    scatter() {
      glyphs.forEach((g) => {
        g.x = rand(8, 92);
        g.y = rand(10, 90);
        g.r = rand(-90, 90);
      });
      renderAll();
      say('scattered.');
    },
    unweight() {
      glyphs.forEach((g) => {
        g.s = Math.random() < 0.2 ? rand(1.6, 3.2) : rand(0.35, 1.3);
        g.sans = Math.random() < 0.45;
        g.slate = Math.random() < 0.3;
      });
      renderAll();
      say('unweighted.');
    },
    erase() {
      if (!glyphs.length) return;
      remove(glyphs[Math.floor(Math.random() * glyphs.length)]);
    },
    restore() {
      build();
      say(`returned to concrete: ${word}.`);
    },
    again() {
      wrap.hidden = true;
      form.hidden = false;
      input.value = '';
      input.focus();
    },
    keep() {
      void keep();
    },
    leave() {
      if (!leaveBtn || !leavePanel) return;
      const open = leavePanel.hidden;
      leavePanel.hidden = !open;
      leaveBtn.setAttribute('aria-expanded', String(open));
      if (open) leavePanel.querySelector<HTMLButtonElement>('[data-act="confirm-leave"]')?.focus();
    },
    'confirm-leave'() {
      void confirmLeave();
    },
    'cancel-leave'() {
      if (!leaveBtn || !leavePanel) return;
      leavePanel.hidden = true;
      leaveBtn.setAttribute('aria-expanded', 'false');
      leaveBtn.focus();
    },
    share() {
      void shareIt();
    },
  };

  /** The composition exactly as it is submitted and stored. */
  const composition = () => ({
    aspect: (field!.clientWidth >= field!.clientHeight ? 'landscape' : 'portrait') as 'landscape' | 'portrait',
    base,
    glyphs: glyphs.map((g) => ({ c: g.ch, x: g.x, y: g.y, r: g.r, s: g.s, f: (g.sans ? 1 : 0) as 0 | 1, t: (g.slate ? 1 : 0) as 0 | 1 })),
  });
  const credit = (wrap.closest('[data-credit]') as HTMLElement | null)?.dataset.credit?.split('\n') ?? [];
  let leftN = 0;
  const renderPng = () => compositionImage(composition(), credit, contributionNote(leftN));

  const fileName = () => {
    const safe = word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'concrete';
    return `abstracted-${safe}.png`;
  };

  async function keep() {
    const blob = await renderPng();
    if (!blob) return;
    {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      say('image saved.');
    }
  }

  /* ---------- leaving it for others ---------- */
  const leaveBtn = wrap.querySelector<HTMLButtonElement>('[data-act="leave"]');
  const leavePanel = wrap.querySelector<HTMLElement>('[data-leave-panel]');
  const leftPanel = wrap.querySelector<HTMLElement>('[data-left-panel]');
  const leaveError = wrap.querySelector<HTMLElement>('[data-leave-error]');
  const leftLink = wrap.querySelector<HTMLAnchorElement>('[data-left-link]');
  const shareStatus = wrap.querySelector<HTMLElement>('[data-share-status]');
  let leftId = '';

  const resetLeave = () => {
    if (!leaveBtn || !leavePanel || !leftPanel || !leaveError) return;
    leaveBtn.hidden = false;
    leaveBtn.setAttribute('aria-expanded', 'false');
    leavePanel.hidden = true;
    leftPanel.hidden = true;
    leaveError.hidden = true;
    leftId = '';
    leftN = 0;
  };

  async function confirmLeave() {
    if (!leaveBtn || !leavePanel || !leftPanel || !leaveError || !leftLink) return;
    if (!glyphs.length) {
      leaveError.textContent = 'nothing remains to leave. that, too, is a piece, but the field needs at least one letter.';
      leaveError.hidden = false;
      return;
    }
    const agree = leavePanel.querySelector<HTMLInputElement>('[data-agree]');
    if (agree && !agree.checked) {
      leaveError.textContent = 'please read and agree to the participation terms first.';
      leaveError.hidden = false;
      agree.focus();
      return;
    }
    const confirmBtn = leavePanel.querySelector<HTMLButtonElement>('[data-act="confirm-leave"]')!;
    confirmBtn.disabled = true;
    const body = { text: word, ...composition(), agree: agree?.value ?? '' };
    const res = await api<{ id?: string; token?: string; status?: string; error?: string }>('/api/field/leave', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    confirmBtn.disabled = false;
    if (!res.ok || !res.data.id) {
      leaveError.textContent = errorMessage(res.status, res.data.error);
      leaveError.hidden = false;
      say(leaveError.textContent);
      return;
    }
    leftId = res.data.id;
    if (res.data.token) rememberMine(leftId, res.data.token);
    leftLink.href = `/field/?piece=${encodeURIComponent(leftId)}`;
    if (res.data.status === 'pending') {
      leftPanel.querySelector('.left-msg')!.textContent =
        'left. it will appear in the field once it has been reviewed. you can see it, and remove it, from its link on this device.';
    }
    leavePanel.hidden = true;
    leaveBtn.hidden = true;
    leftPanel.hidden = false;
    leftPanel.focus();
    say('left for others.');
  }

  async function shareIt() {
    if (!leftId || !shareStatus) return;
    const blob = await renderPng();
    const file = blob ? new File([blob], fileName(), { type: 'image/png' }) : undefined;
    const result = await share(pieceUrl(leftId), 'I abstracted my own concrete.', file);
    shareStatus.textContent = result === 'copied' ? 'link copied.' : result === 'shared' ? 'shared.' : '';
  }

  wrap.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    if (btn) actions[btn.dataset.act!]?.();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    word = input.value.trim().slice(0, 32);
    if (!word) return;
    form.hidden = true;
    wrap.hidden = false;
    build();
    say(`${word}. ${glyphs.length} letters. use the buttons below, or select a letter to move it.`);
    (wrap.querySelector('[data-act="loosen"]') as HTMLButtonElement).focus();
  });

  window.addEventListener('resize', renderAll);
}
