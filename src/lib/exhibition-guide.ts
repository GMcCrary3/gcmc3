/**
 * The exhibition guide: highlights the current movement, updates the
 * previous/next controls, and can be hidden (remembered on this device).
 * Visitors stay in control — nothing here scrolls the page on its own.
 */
const guide = document.querySelector<HTMLElement>('[data-guide]');
const sections = [...document.querySelectorAll<HTMLElement>('section.movement')];

if (guide && sections.length) {
  const links = [...guide.querySelectorAll<HTMLAnchorElement>('[data-guide-link]')];
  const prev = guide.querySelector<HTMLAnchorElement>('[data-guide-prev]')!;
  const next = guide.querySelector<HTMLAnchorElement>('[data-guide-next]')!;
  const current = guide.querySelector<HTMLElement>('[data-guide-current]')!;
  const toggle = guide.querySelector<HTMLButtonElement>('[data-guide-toggle]')!;
  const showBtn = document.querySelector<HTMLButtonElement>('[data-guide-show]')!;

  const setActive = (index: number) => {
    links.forEach((a, i) => a.setAttribute('aria-current', String(i === index)));
    const s = sections[index];
    current.textContent = index >= 0 ? `${s.dataset.movement} · ${s.dataset.title}` : 'the exhibition';
    prev.href = index > 0 ? `#${sections[index - 1].id}` : '#top-of-exhibition';
    prev.setAttribute('aria-label', index > 0 ? `Previous movement: ${sections[index - 1].dataset.title}` : 'Back to the introduction');
    const n = sections[index + 1];
    next.hidden = !n && index >= 0;
    if (n) {
      next.href = `#${n.id}`;
      next.setAttribute('aria-label', `Next movement: ${n.dataset.title}`);
    }
  };

  // The movement occupying the middle of the viewport is "current".
  const update = () => {
    const mid = window.innerHeight / 2;
    let active = -1;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= mid) active = i; });
    setActive(active);
  };
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(() => { update(); ticking = false; }); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();

  // Optional guide: hide / show, remembered per device (if storage allows).
  const KEY = 'exhibition-guide-hidden';
  const setHidden = (hidden: boolean, focus = false) => {
    document.body.classList.toggle('guide-hidden', hidden);
    showBtn.hidden = !hidden;
    toggle.setAttribute('aria-pressed', String(hidden));
    try { localStorage.setItem(KEY, hidden ? '1' : '0'); } catch { /* storage unavailable */ }
    if (focus) (hidden ? showBtn : toggle).focus();
  };
  let stored = false;
  try { stored = localStorage.getItem(KEY) === '1'; } catch { /* ignore */ }
  setHidden(stored);
  toggle.addEventListener('click', () => setHidden(true, true));
  showBtn.addEventListener('click', () => setHidden(false, true));
}
