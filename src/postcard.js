// The Postcard (design Q7, Q18): the invitation card rebuilt as live HTML text over art layers.
//
//   mountPostcard(el, config)   el = section#postcard (aria-labelledby="postcard-title")
//
// Layers, back to front: paper → gold arch frame (SVG, src/art/arch.js) → cropped art (assets/art/*.webp)
// → text column. All words come from the strings table (data-i18n); the couple's names stay Latin script.
// Geometry is measured in "u" = card width / 1024 — one pixel of the reference PNG — so the card scales
// as one composition. On phones the card fills the first screen and the extra height goes to spacing.
//
// Entrance: everything is laid out from the start; html.is-open (added by main.js together with the
// `invite:opened` event) starts the CSS entrance (see postcard.css). Reduced motion → static.

import { archPath } from './art/arch.js';
import { rosette, divider, laurel, rings, pin } from './art/ornaments.js';
import { t, onLangChange, applyTranslations, getLocale } from './i18n/index.js';
import { mapsUrl } from './maps.js';

const ART = {
  rosesTL: 'assets/art/roses-top-left.webp',
  rosesBR: 'assets/art/roses-bottom-right.webp',
  lantern1: 'assets/art/lantern-1.webp',
  lantern2: 'assets/art/lantern-2.webp',
  couple: 'assets/art/couple.webp',
};

// Reference geometry (u = PNG px at 1024 wide)
const G = { archX: 66, archTip: 75, baseFromBottom: 86, notch: 24 };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sp = (g) => `<span class="pc-sp" style="--g:${g}" aria-hidden="true"></span>`;

export function mountPostcard(el, config) {
  if (!el) return;
  const venue = config.venue || {};
  el.classList.add('postcard-section');
  el.innerHTML = `
<div class="postcard" data-postcard>
  <div class="postcard__sheet">
    <div class="postcard__paper" aria-hidden="true"></div>
    <svg class="postcard__frame" aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <path class="postcard__arch-glow" pathLength="1"/>
      <path class="postcard__arch-line" pathLength="1"/>
    </svg>
    <div class="postcard__arch" aria-hidden="true"></div>

    <img class="postcard__art postcard__roses postcard__roses--tl" src="${ART.rosesTL}" alt="" width="336" height="476" decoding="async" fetchpriority="high">
    <img class="postcard__art postcard__roses postcard__roses--br" src="${ART.rosesBR}" alt="" width="308" height="448" decoding="async">
    <div class="postcard__lantern postcard__lantern--1" aria-hidden="true">
      <div class="postcard__lantern-swing"><img src="${ART.lantern1}" alt="" width="104" height="300" decoding="async"><span class="postcard__flame"></span></div>
    </div>
    <div class="postcard__lantern postcard__lantern--2" aria-hidden="true">
      <div class="postcard__lantern-swing"><img src="${ART.lantern2}" alt="" width="100" height="380" decoding="async"><span class="postcard__flame"></span></div>
    </div>
    <img class="postcard__art postcard__couple" src="${ART.couple}" alt="" width="338" height="460" decoding="async">

    <div class="postcard__content">
      <span class="pc-in pc-top-rosette" style="--i:0" aria-hidden="true">${rosette()}</span>
      ${sp(150)}
      <h1 id="postcard-title" class="postcard__heading">
        <span class="postcard__invited pc-in" style="--i:1" data-i18n="postcard.invitedTo">${esc(t('postcard.invitedTo'))}</span>
        ${sp(28)}
        <span class="postcard__nikah pc-in" style="--i:2" data-i18n="postcard.nikah">${esc(t('postcard.nikah'))}</span>
        ${sp(16)}
        <span class="pc-in pc-divider-wrap" style="--i:3" aria-hidden="true">${divider('pc-divider--top')}</span>
        ${sp(14)}
        <span class="postcard__of pc-in" style="--i:4" data-i18n="postcard.of">${esc(t('postcard.of'))}</span>
        ${sp(10)}
        <span class="postcard__names pc-in" style="--i:5" dir="ltr" lang="en">
          <span class="postcard__laurel postcard__laurel--start" aria-hidden="true">${laurel(false)}</span>
          <span class="postcard__name postcard__name--1">Asmat</span>
          <span class="postcard__amp"><span class="visually-hidden pc-vh"> &amp; </span><span class="postcard__rings" aria-hidden="true">${rings('pc')}</span></span>
          <span class="postcard__name postcard__name--2">Saima</span>
          <span class="postcard__laurel postcard__laurel--end" aria-hidden="true">${laurel(true)}</span>
        </span>
      </h1>
      ${sp(40)}
      <p class="postcard__when pc-in" style="--i:6">
        <time class="postcard__date" datetime="${esc(config.eventDate || '2026-12-06')}" data-i18n="postcard.date">${esc(t('postcard.date'))}</time>
        <span class="postcard__time" hidden></span>
      </p>
      ${sp(62)}
      <p class="postcard__venue pc-in" style="--i:7">
        <a class="postcard__map" href="${esc(mapsUrl(config))}" target="_blank" rel="noopener"
           data-i18n-attr="aria-label:postcard.mapAria" aria-label="${esc(t('postcard.mapAria'))}">
          <span class="postcard__venue-line postcard__venue-line--1">${pin()}<span>${esc(venue.line1 || '')}</span></span>
          <span class="postcard__venue-line postcard__venue-line--2">${esc(venue.line2 || '')}</span>
        </a>
      </p>
      ${sp(20)}
      <span class="pc-in pc-divider-wrap" style="--i:8" aria-hidden="true">${divider('pc-divider--bottom')}</span>
    </div>
  </div>
</div>`;

  const card = el.querySelector('.postcard');
  const sheet = el.querySelector('.postcard__sheet');
  const frame = el.querySelector('.postcard__frame');
  const archBox = el.querySelector('.postcard__arch');
  const content = el.querySelector('.postcard__content');
  const timeEl = el.querySelector('.postcard__time');

  applyTranslations(el);

  // ── Time line (only when config.eventStart is set) ───────────────────────
  const renderTime = () => {
    if (!config.eventStart) { timeEl.hidden = true; timeEl.textContent = ''; return; }
    const [hh, mm] = String(config.eventStart).split(':').map(Number);
    let time;
    try {
      time = new Intl.DateTimeFormat(getLocale(), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2026, 11, 6, hh, mm || 0)));
    } catch { time = config.eventStart; }
    timeEl.textContent = t('postcard.time', { time });
    timeEl.hidden = false;
  };
  renderTime();

  // ── Frame: arch from src/art/arch.js + concave notched corners + base line ──
  let lastW = 0, lastH = 0;
  const drawFrame = () => {
    const W = sheet.clientWidth, H = sheet.clientHeight;
    if (!W || !H || (W === lastW && H === lastH)) return;
    lastW = W; lastH = H;
    const u = W / 1024;
    const n = (v) => Math.round(v * 100) / 100;
    // Phones (full-bleed): the fixed language switcher (≈46px tall) sits over the top of the screen, so
    // the dome drops just below it; the phone's spare height absorbs the shift.
    const bleed = card.classList.contains('postcard--bleed');
    const tip0 = G.archTip * u, tip = bleed ? Math.max(tip0, 56) : tip0;
    sheet.style.setProperty('--pc-shift', `${n(tip - tip0)}px`);
    const ax = G.archX * u, aw = W - 2 * ax;
    const base = H - G.baseFromBottom * u, r = G.notch * u;
    const sideBottom = base - r;
    const arch = archPath(aw, Math.max(sideBottom - tip, aw * 0.56), { open: true, x: ax, y: tip }).replace(/^M/, 'L');
    const d = `M${n(W / 2)},${n(base)} L${n(ax + r)},${n(base)} A${n(r)},${n(r)} 0 0 0 ${n(ax)},${n(base - r)} ${arch} `
      + `A${n(r)},${n(r)} 0 0 0 ${n(ax + aw - r)},${n(base)} Z`;
    frame.setAttribute('viewBox', `0 0 ${W} ${H}`);
    frame.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
    frame.style.setProperty('--stroke', `${n(Math.max(1, 2.6 * u))}px`);
    // geometry hook for other modules (e.g. the opening doors): the arch's box, tip → base line
    Object.assign(archBox.style, { left: `${n(ax)}px`, top: `${n(tip)}px`, width: `${n(aw)}px`, height: `${n(base - tip)}px` });
    if (card.classList.contains('postcard--card')) deckle(sheet, W, H); else sheet.style.clipPath = '';
  };

  // ── Fit: the names line scales to the column width; if a language/viewport still makes the column
  //    taller than its zone, every line shrinks a touch (--fit) until it fits.
  const names = el.querySelector('.postcard__names');
  let fitting = false;
  const fit = () => {
    if (fitting) return;
    fitting = true;
    content.style.setProperty('--fit', '1');
    names.style.setProperty('--nfit', '1');
    // everything on the names line (script, rings, laurels) scales with --nfit, so one ratio fits it
    const cw = content.clientWidth;
    const lineW = () => { const a = names.firstElementChild.getBoundingClientRect(), b = names.lastElementChild.getBoundingClientRect(); return Math.max(b.right, a.right) - Math.min(a.left, b.left); };
    const nw = lineW();
    if (nw > cw) names.style.setProperty('--nfit', (Math.floor((cw / nw) * 0.99 * 1000) / 1000).toString());
    keepInsideDome();
    let f = 1;
    // layout boxes only (offset*), so entrance transforms never count as overflow
    const last = content.lastElementChild;
    const overflows = () => last.offsetTop + last.offsetHeight > content.clientHeight + 1;
    while (overflows() && f > 0.62) { f -= 0.03; content.style.setProperty('--fit', f.toFixed(2)); }
    fitting = false;
  };

  // The first caps line sits in the dome, between its shoulders. Measure how wide the arch is at that
  // height (hit-testing the frame path) and let the line wrap — balanced — rather than touch the gold line.
  const invited = el.querySelector('.postcard__invited');
  const archLine = el.querySelector('.postcard__arch-line');
  const keepInsideDome = () => {
    invited.style.maxInlineSize = '';
    if (!archLine.isPointInFill || !lastW || typeof DOMPoint === 'undefined') return;
    const W = lastW, cx = W / 2, u = W / 1024;
    const y = content.offsetTop + invited.offsetTop + 2;
    const inside = (x) => { try { return archLine.isPointInFill(new DOMPoint(x, y)); } catch { return true; } };
    if (!inside(cx)) return;
    let lo = 0, hi = cx;
    for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (inside(cx + m)) lo = m; else hi = m; }
    const room = 2 * (lo - 40 * u);
    if (invited.offsetWidth > room) invited.style.maxInlineSize = `${Math.max(0, Math.floor(room))}px`;
  };

  const layout = () => {
    const wide = matchMedia('(min-aspect-ratio: 5/8)').matches;
    card.classList.toggle('postcard--card', wide);
    card.classList.toggle('postcard--bleed', !wide);
    lastW = 0; drawFrame(); fit();
  };

  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { drawFrame(); fit(); }); };
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(sheet);
  matchMedia('(min-aspect-ratio: 5/8)').addEventListener?.('change', layout);
  window.addEventListener('resize', schedule, { passive: true });
  layout();
  document.fonts?.ready.then(() => { fit(); });
  document.fonts?.addEventListener?.('loadingdone', () => fit());

  onLangChange(() => { renderTime(); requestAnimationFrame(fit); });

  // Entrance — CSS keys off html.is-open; the event marks the card for "played" bookkeeping
  const markOpened = () => {
    card.classList.add('is-entered');
    // after the entrance, drop the will-change hints
    setTimeout(() => card.classList.add('is-settled'), 4200);
  };
  if (document.documentElement.classList.contains('is-open')) markOpened();
  else document.addEventListener('invite:opened', markOpened, { once: true });
}

// Deckled paper edge for the desktop card: a softly irregular polygon (deterministic, so it never shimmers).
function deckle(sheet, W, H) {
  const pts = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const amp = Math.max(0.6, Math.min(1.5, W / 420));
  const jitter = (i) => amp * (0.55 * Math.sin(i * 0.9) * Math.sin(i * 0.23 + 1.3) + 0.45 * (rnd() - 0.5) * 2) * 0.5 + amp * 0.5;
  const step = 5;
  let i = 0;
  const n = (v) => Math.round(v * 10) / 10;
  for (let x = 0; x < W; x += step) pts.push(`${n(x)}px ${n(jitter(i++))}px`);
  for (let y = 0; y < H; y += step) pts.push(`${n(W - jitter(i++))}px ${n(y)}px`);
  for (let x = W; x > 0; x -= step) pts.push(`${n(x)}px ${n(H - jitter(i++))}px`);
  for (let y = H; y > 0; y -= step) pts.push(`${n(jitter(i++))}px ${n(y)}px`);
  sheet.style.clipPath = `polygon(${pts.join(',')})`;
}
