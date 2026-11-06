/**
 * The opening: "The Artist's Gift", letter by letter, on black.
 *
 * Timing is computed from the poem itself so the whole sequence lasts
 * `totalSeconds` from the first letter to the start of the dissolve: a short
 * opening beat, the poem typed with natural pauses at line and stanza breaks,
 * then a hold on the final line. Everything is driven by one clock that only
 * advances while not paused, so pause/resume is exact.
 *
 * Self-contained (no imports): the same code runs on the site and in the
 * standalone review preview.
 */
export type IntroConfig = {
  totalSeconds: number;
  holdEndSeconds: number;
  skipHoldSeconds: number;
  dissolveSeconds: number;
  oncePerSession: boolean;
};
export type IntroPoem = { title: string; lines: string[] };

const START_BEAT = 900; // ms of black before the first letter
const AFTER_TITLE = 1400;
const LINE_GAP = 1; // weights: a line break is a short breath,
const STANZA_GAP = 3; // a stanza break a longer one

export function startIntro(root: HTMLElement, poem: IntroPoem, cfg: IntroConfig, onDone?: () => void) {
  const stage = root.querySelector<HTMLElement>('[data-intro-stage]')!;
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-intro-pause]')!;
  const skipBtn = root.querySelector<HTMLButtonElement>('[data-intro-skip]')!;
  const enterBtn = root.querySelector<HTMLButtonElement>('[data-intro-enter]')!;
  const status = root.querySelector<HTMLElement>('[data-intro-status]')!;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- build the text, every character pre-placed (no layout shift) ---- */
  const chars: HTMLSpanElement[] = [];
  const gaps: number[] = []; // gap weight before each character (0 = none)
  const addLine = (container: HTMLElement, text: string, cls: string, gapBefore: number) => {
    const p = document.createElement('span');
    p.className = cls;
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'c';
      s.textContent = ch;
      p.append(s);
      chars.push(s);
      gaps.push(i === 0 ? gapBefore : 0);
    });
    container.append(p);
  };
  stage.replaceChildren();
  const title = document.createElement('p');
  title.className = 'intro-title';
  addLine(title, poem.title, 'l', 0);
  stage.append(title);
  let stanza = document.createElement('p');
  stanza.className = 'intro-stanza';
  stage.append(stanza);
  let pending = -1; // -1: first line after the title
  // The final line is written separately: large, red, by hand, across the poem.
  const lastIndex = poem.lines.map((l) => l.trim() !== '').lastIndexOf(true);
  const final = document.createElement('p');
  final.className = 'intro-final';
  poem.lines.forEach((line, i) => {
    if (!line.trim()) {
      if (stanza.childNodes.length) {
        stanza = document.createElement('p');
        stanza.className = 'intro-stanza';
        stage.append(stanza);
      }
      pending = STANZA_GAP;
      return;
    }
    addLine(i === lastIndex ? final : stanza, line, 'l', pending === -1 ? -1 : pending || LINE_GAP);
    pending = 0;
  });
  if (!stanza.childNodes.length) stanza.remove();
  stage.append(final);
  const lastLine = final;

  /* ---- schedule: when each character appears ---- */
  const typingEnd = cfg.totalSeconds * 1000 - cfg.holdEndSeconds * 1000;
  const fixed = START_BEAT + AFTER_TITLE;
  const gapUnits = gaps.reduce((a, g) => a + (g > 0 ? g : 0), 0);
  // Characters and gap units share the remaining time: a gap unit = 6 characters' worth.
  const unit = (typingEnd - fixed) / (chars.length + gapUnits * 6);
  const at: number[] = [];
  let t = START_BEAT;
  chars.forEach((_, i) => {
    if (gaps[i] === -1) t += AFTER_TITLE;
    else if (gaps[i] > 0) t += gaps[i] * 6 * unit;
    at.push(t);
    t += unit;
  });

  /* ---- the clock ---- */
  let elapsed = 0;
  let paused = false;
  let shown = 0;
  let leaveAt = typingEnd + cfg.holdEndSeconds * 1000; // = totalSeconds
  let mode: 'typing' | 'hold' | 'leaving' = 'typing';
  let last = performance.now();
  let raf = 0;

  const reveal = (upTo: number) => {
    while (shown < upTo) chars[shown++].classList.add('on');
  };
  const say = (msg: string) => { status.textContent = msg; };

  const leave = (fast = false) => {
    if (mode === 'leaving') return;
    mode = 'leaving';
    cancelAnimationFrame(raf);
    if (cfg.oncePerSession) { try { sessionStorage.setItem('intro-seen', '1'); } catch { /* ignore */ } }
    const ms = reduce ? 0 : fast ? 600 : cfg.dissolveSeconds * 1000;
    root.style.setProperty('--dissolve', `${ms}ms`);
    root.classList.add('leaving');
    window.setTimeout(() => {
      root.hidden = true;
      document.documentElement.classList.remove('intro-open');
      document.documentElement.classList.add('intro-seen'); // keep it hidden from here on
      document.removeEventListener('keydown', onKey, true);
      onDone?.();
    }, ms);
  };

  const showAll = (holdMs: number) => {
    reveal(chars.length);
    mode = 'hold';
    leaveAt = elapsed + holdMs;
    lastLine.classList.add('written');
  };

  const frame = (now: number) => {
    const dt = Math.min(100, now - last); // never jump after a background tab
    last = now;
    if (!paused) {
      elapsed += dt;
      if (mode === 'typing') {
        let n = shown;
        while (n < chars.length && at[n] <= elapsed) n++;
        reveal(n);
        if (shown === chars.length) { mode = 'hold'; lastLine.classList.add('written'); }
      }
      if (elapsed >= leaveAt) { leave(); return; }
    }
    raf = requestAnimationFrame(frame);
  };

  const setPaused = (p: boolean) => {
    paused = p;
    pauseBtn.setAttribute('aria-pressed', String(p));
    pauseBtn.textContent = p ? 'resume' : 'pause';
    root.classList.toggle('paused', p);
    say(p ? 'paused' : '');
  };

  pauseBtn.addEventListener('click', () => setPaused(!paused));
  skipBtn.addEventListener('click', () => {
    if (mode === 'leaving') return;
    showAll(cfg.skipHoldSeconds * 1000);
    skipBtn.disabled = true;
    say('the whole poem is shown');
  });
  enterBtn.addEventListener('click', () => leave(true));

  // Keyboard: Escape enters the site; space pauses or resumes; Tab stays inside.
  function onKey(e: KeyboardEvent) {
    if (root.hidden || mode === 'leaving') return;
    if (e.key === 'Escape') { e.preventDefault(); leave(true); return; }
    const onButton = (e.target as HTMLElement).tagName === 'BUTTON';
    if ((e.key === ' ' || e.key === 'k') && !onButton) { e.preventDefault(); setPaused(!paused); return; }
    if (e.key === 'Tab') {
      const items = [pauseBtn, skipBtn, enterBtn].filter((b) => !b.disabled);
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
    }
  }
  document.addEventListener('keydown', onKey, true);

  /* ---- begin ---- */
  root.hidden = false;
  root.classList.remove('leaving', 'paused');
  document.documentElement.classList.add('intro-open');
  root.querySelector<HTMLElement>('[data-intro-heading]')?.focus();
  if (reduce) showAll(cfg.skipHoldSeconds * 1000); // no letter-by-letter movement
  last = performance.now();
  raf = requestAnimationFrame(frame);

  return {
    /** For review tools: the computed timing. */
    timing: { characters: chars.length, msPerCharacter: Math.round(unit), typingEndsAt: Math.round(typingEnd), dissolveStartsAt: cfg.totalSeconds * 1000 },
  };
}
