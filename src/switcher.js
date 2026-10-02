// ─────────────────────────────────────────────────────────────────────────────
//  Language switcher — "EN · SV · TH · اردو", fixed at the top inline-end corner.
//
//  • One <button aria-pressed> per language, inside a role="toolbar" (one Tab stop,
//    ←/→/Home/End move between options, Enter/Space choose). Each button carries the
//    language's own `lang` and accessible name (English, Svenska, ไทย, اردو).
//  • A gold pill slides to the active option. The pill moves the moment a guest taps
//    (optimistic), the page follows once strings + fonts are ready.
//  • RTL: the control mirrors as a unit with the page (it sits at the inline end, so
//    top-left in Urdu) and keeps the same *reading* order: EN → SV → TH → اردو, read
//    right-to-left in Urdu. The active option stays in the outer corner across the flip.
//  • Sits above the opening overlay (see switcher.css) so it works while the doors
//    are still closed.
// ─────────────────────────────────────────────────────────────────────────────
import { t, getLang, setLang, onLangChange, preloadLang } from './i18n/index.js';

const OPTIONS = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'sv', short: 'SV', name: 'Svenska' },
  { code: 'th', short: 'TH', name: 'ไทย' },
  { code: 'ur', short: 'اردو', name: 'اردو' },
];

// A few-kB subset of Noto Nastaliq Urdu containing only "اردو", so the label is
// set in proper Nastaliq even before (or without) the full Urdu font loading.
const URDU_LABEL_FONT =
  'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@500&text=' +
  encodeURIComponent('اردو') + '&display=swap';

// Registered under its own family name so it never mixes with the full Urdu font
// (which loads later, with different metrics) — the label sits identically always.
function loadLabelFont() {
  if (document.getElementById('lang-switcher-font')) return;
  const fallback = () => {
    const link = document.createElement('link');
    link.id = 'lang-switcher-font';
    link.rel = 'stylesheet';
    link.href = URDU_LABEL_FONT;
    document.head.appendChild(link);
  };
  fetch(URDU_LABEL_FONT, { mode: 'cors', credentials: 'omit' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((css) => {
      if (document.getElementById('lang-switcher-font')) return;
      const style = document.createElement('style');
      style.id = 'lang-switcher-font';
      style.textContent = css.replace(/font-family:\s*['"]?Noto Nastaliq Urdu['"]?/g, "font-family: 'Lang Switcher Urdu'");
      document.head.appendChild(style);
    })
    .catch(fallback);
}

export function mountSwitcher(el, config = {}) {
  if (!el) return;
  const enabled = config.languages || OPTIONS.map((o) => o.code);
  const options = OPTIONS.filter((o) => enabled.includes(o.code));
  if (options.length < 2) { el.hidden = true; return; }

  loadLabelFont();

  el.classList.add('lang-switcher');
  el.textContent = '';
  el.setAttribute('data-i18n-attr', 'aria-label:switcher.label');
  el.setAttribute('aria-label', t('switcher.label'));

  const track = document.createElement('div');
  track.className = 'lang-switcher__track';
  track.setAttribute('role', 'toolbar');
  track.setAttribute('data-i18n-attr', 'aria-label:switcher.label');
  track.setAttribute('aria-label', t('switcher.label'));

  const pill = document.createElement('span');
  pill.className = 'lang-switcher__pill';
  pill.setAttribute('aria-hidden', 'true');
  track.appendChild(pill);

  const buttons = options.map((opt, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'lang-switcher__sep';
      sep.setAttribute('aria-hidden', 'true');
      track.appendChild(sep);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-switcher__opt';
    b.dataset.lang = opt.code;
    b.lang = opt.code;
    if (opt.code === 'ur') b.dir = 'rtl';
    if (opt.name !== opt.short) b.setAttribute('aria-label', opt.name);
    const label = document.createElement('span');
    label.className = 'lang-switcher__label';
    label.textContent = opt.short;
    b.appendChild(label);
    track.appendChild(b);
    return b;
  });

  el.appendChild(track);

  // ── state ──────────────────────────────────────────────────────────────────
  let shown = getLang();     // the option the pill points at (may run ahead of getLang)
  let lastDir = document.documentElement.dir;

  const byCode = (code) => buttons.find((b) => b.dataset.lang === code);

  function placePill(animate) {
    const target = byCode(shown);
    if (!target) return;
    if (!animate) track.classList.add('is-instant');
    pill.dataset.on = shown;
    pill.style.setProperty('--pill-x', `${target.offsetLeft}px`);
    pill.style.setProperty('--pill-w', `${target.offsetWidth}px`);
    if (!animate) {
      void pill.offsetWidth; // flush so the jump is not transitioned
      track.classList.remove('is-instant');
    }
  }

  function render({ animate = false } = {}) {
    const active = getLang();
    for (const b of buttons) {
      const on = b.dataset.lang === active;
      b.setAttribute('aria-pressed', String(on));
      b.tabIndex = b.dataset.lang === shown ? 0 : -1;
      b.classList.toggle('is-pending', b.dataset.lang === shown && !on);
    }
    placePill(animate);
  }

  async function choose(code) {
    if (code === shown && code === getLang()) return;
    shown = code;
    render({ animate: true });
    try {
      await setLang(code);
    } finally {
      // If a later choice won, `shown` already points at it.
      if (shown === code && getLang() !== code) shown = getLang();
      render({ animate: true });
    }
  }

  // ── events ─────────────────────────────────────────────────────────────────
  track.addEventListener('click', (e) => {
    const b = e.target.closest('.lang-switcher__opt');
    if (b) choose(b.dataset.lang);
  });

  const warm = (e) => {
    const b = e.target.closest && e.target.closest('.lang-switcher__opt');
    if (b && b.dataset.lang !== getLang()) preloadLang(b.dataset.lang);
  };
  track.addEventListener('pointerover', warm);
  track.addEventListener('pointerdown', warm);
  track.addEventListener('focusin', warm);

  track.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const rtl = getComputedStyle(track).direction === 'rtl';
    let next = null;
    switch (e.key) {
      case 'ArrowRight': next = i + (rtl ? -1 : 1); break;
      case 'ArrowLeft': next = i + (rtl ? 1 : -1); break;
      case 'ArrowDown': next = i + 1; break;
      case 'ArrowUp': next = i - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = buttons.length - 1; break;
      default: return;
    }
    e.preventDefault();
    next = (next + buttons.length) % buttons.length;
    buttons.forEach((b, j) => { b.tabIndex = j === next ? 0 : -1; });
    buttons[next].focus();
  });

  // Roving tabindex returns to the active language when focus leaves the control.
  track.addEventListener('focusout', (e) => {
    if (!track.contains(e.relatedTarget)) render();
  });

  onLangChange((code) => {
    const dir = document.documentElement.dir;
    const flipped = dir !== lastDir;
    lastDir = dir;
    shown = code;
    render({ animate: !flipped });
  });

  // Label widths settle once the web fonts arrive — re-measure without animating.
  if ('ResizeObserver' in window) new ResizeObserver(() => placePill(false)).observe(track);
  if (document.fonts) {
    document.fonts.ready.then(() => placePill(false));
    document.fonts.addEventListener?.('loadingdone', () => placePill(false));
  }

  render();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-ready')));
  tuckOnScroll(el);
}

// Once the page is open, the capsule tucks away while the page scrolls down (so it never sits on top of
// the postcard art, the form or the confirmation) and slides back when the guest scrolls up themselves,
// returns to the top, or moves keyboard focus into it. Scrolls the page makes on its own (the RSVP form
// bringing a confirmation into view) don't bring it back.
function tuckOnScroll(el) {
  const TOP = 96;          // always shown this close to the top of the page
  const STEP = 8;          // ignore scroll jitter smaller than this
  const SCROLL_KEYS = new Set(['ArrowUp', 'PageUp', 'Home', ' ']);
  let lastY = window.scrollY, ticking = false, intent = -1e9;
  const mark = () => { intent = performance.now(); };
  window.addEventListener('wheel', mark, { passive: true });
  window.addEventListener('touchmove', mark, { passive: true });
  window.addEventListener('keydown', (e) => { if (SCROLL_KEYS.has(e.key)) mark(); });
  const set = (on) => el.classList.toggle('is-tucked', on && !el.contains(document.activeElement));
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    if (!document.documentElement.classList.contains('is-open') || y < TOP) { set(false); lastY = y; return; }
    if (y > lastY + STEP) set(true);
    else if (y < lastY - STEP) { if (performance.now() - intent < 1200) set(false); }
    else return;
    lastY = y;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  el.addEventListener('focusin', () => el.classList.remove('is-tucked'));
}
