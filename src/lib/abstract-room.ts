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
  };

  // Save the composition as an image, drawn fresh onto a canvas.
  async function keep() {
    await document.fonts.ready;
    const rect = field!.getBoundingClientRect();
    const scale = 1600 / rect.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const ctx = canvas.getContext('2d')!;
    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue('--ivory-deep').trim() || '#e9e4d8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const fsPx = (base / 100) * canvas.width;
    for (const g of glyphs) {
      const cs = getComputedStyle(g.el);
      ctx.save();
      ctx.translate((g.x / 100) * canvas.width, (g.y / 100) * canvas.height);
      ctx.rotate((g.r * Math.PI) / 180);
      ctx.scale(g.s, g.s);
      ctx.font = `${cs.fontWeight} ${fsPx}px ${cs.fontFamily}`;
      ctx.fillStyle = cs.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
    if (!glyphs.length) {
      ctx.font = `italic 400 ${canvas.width * 0.035}px ${getComputedStyle(remains!).fontFamily}`;
      ctx.fillStyle = css.getPropertyValue('--slate').trim() || '#53616d';
      ctx.textAlign = 'center';
      ctx.fillText(remains!.textContent ?? '', canvas.width / 2, canvas.height / 2);
    }
    ctx.font = `400 ${canvas.width * 0.012}px ${css.getPropertyValue('--sans')}`;
    ctx.fillStyle = css.getPropertyValue('--slate').trim() || '#53616d';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('abstractly concrete · gilesmccrary.com', canvas.width * 0.025, canvas.height * 0.97);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const safe = word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'concrete';
      a.download = `abstracted-${safe}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      say('image saved.');
    }, 'image/png');
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
