// Page layout behaviours (design Q21, Q22): Directions + Add-to-calendar, the RSVP cue, the footer,
// and the shared scroll-reveal observer.
//
//   mountLayout({ actions, cue, footer }, config)
//   observeReveal(el)   — register an element added after mount for scroll reveal (optional: a
//                         MutationObserver also picks up any `.reveal` element inserted into the page)
//
// Scroll reveal contract: every element with class `reveal` receives `is-visible` the first time it
// scrolls into view, but only after the doors open (`invite:opened`, or html.is-open as a fallback).
// Elements that enter together get `--reveal-order: 0,1,2…` so CSS can stagger them. Style the
// hidden state yourself, scoped as `html.js .your-thing.reveal:not(.is-visible)`, or use the opt-in
// `.reveal--rise` utility from sections.css (fade + 14px rise). Reduced motion shows everything at once.

import { t, formatDate, getLang, getLocale, onLangChange } from './i18n/index.js';
import { mapsUrl } from './maps.js';
import { buildIcs, googleCalendarUrl, downloadIcs, ICS_FILENAME } from './calendar.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isAndroid = () => /Android/i.test(navigator.userAgent || '');

// ── Small DOM helpers ──────────────────────────────────────────────────────────────────────────────

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'i18n') { el.dataset.i18n = v; el.textContent = t(v); }
    else if (k === 'html') el.innerHTML = v; // only ever our own static SVG markup
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.filter(Boolean));
  return el;
}

function svg(viewBox, body, cls = '') {
  return `<svg class="${cls}" viewBox="${viewBox}" aria-hidden="true" focusable="false" xmlns="${SVG_NS}">${body}</svg>`;
}

// ── Ornaments (thin gold line-art, matching the postcard) ─────────────────────────────────────────

/** 8-petal rosette — the same star-flower geometry as the postcard (src/art/ornaments.js), styled for
 *  small sizes: cream-filled petals, a 1px gold line (non-scaling), a gold heart. */
export function rosetteSvg(cls = 'rosette') {
  const outer = 'M0,-47 C6.5,-38 12.5,-30 10.6,-21.2 C9.6,-17 5.2,-13.6 0,-12.2 C-5.2,-13.6 -9.6,-17 -10.6,-21.2 C-12.5,-30 -6.5,-38 0,-47Z';
  const inner = 'M0,-31.5 C4.6,-25.5 6,-19.5 0,-12.5 C-6,-19.5 -4.6,-25.5 0,-31.5Z';
  let petals = '', inners = '';
  for (let i = 0; i < 8; i++) {
    petals += `<path d="${outer}" transform="rotate(${i * 45})"/>`;
    inners += `<path d="${inner}" transform="rotate(${i * 45 + 22.5})"/>`;
  }
  return svg('-50 -50 100 100',
    `<g class="rosette__fill">${petals}</g>` +
    `<g class="rosette__line">${petals}${inners}<circle r="9"/></g>` +
    '<circle class="rosette__dot" r="4"/>', cls);
}

/** Divider: tapered hairline · rosette · tapered hairline (styled by .ornate-rule in sections.css). */
const dividerHtml = () =>
  '<span class="ornate-label__rule"></span>' +
  `<span class="ornate-label__rosette ornate-label__rosette--lg">${rosetteSvg()}</span>` +
  '<span class="ornate-label__rule"></span>';

const ICONS = {
  pin: svg('0 0 24 24',
    '<path d="M12 21.2s-6.4-6.1-6.4-11.1a6.4 6.4 0 0 1 12.8 0c0 5-6.4 11.1-6.4 11.1Z" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="10.1" r="2.3" fill="none" stroke="currentColor" stroke-width="1.15"/>', 'icon'),
  calendar: svg('0 0 24 24',
    '<rect x="3.6" y="5.2" width="16.8" height="15.2" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.15"/>' +
    '<path d="M3.6 9.6h16.8M8 3.2v3.8M16 3.2v3.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>' +
    '<path d="M12 12.1l2.1 2.6-2.1 2.6-2.1-2.6Z" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>', 'icon'),
  download: svg('0 0 24 24',
    '<rect x="3.6" y="5.2" width="16.8" height="15.2" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.15"/>' +
    '<path d="M3.6 9.6h16.8M8 3.2v3.8M16 3.2v3.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>' +
    '<path d="M12 11.6v5.6m-2.4-2.3 2.4 2.4 2.4-2.4" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'),
  web: svg('0 0 24 24',
    '<rect x="3.6" y="5.2" width="16.8" height="15.2" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.15"/>' +
    '<path d="M3.6 9.6h16.8M8 3.2v3.8M16 3.2v3.8" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>' +
    '<path d="M10.2 17.2l4.6-4.6m-3.4 0h3.4v3.4" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'),
  chevron: svg('0 0 24 24', '<path d="M9.5 6.5 15 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', 'icon icon--chevron'),
  external: svg('0 0 24 24', '<path d="M9 7h8v8M17 7 7.5 16.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>', 'icon icon--external'),
  close: svg('0 0 24 24', '<path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>', 'icon'),
  cue: svg('0 0 24 32',
    '<path d="M5 7.5l7 6.5 7-6.5" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" class="rsvp-cue__c1"/>' +
    '<path d="M5 16.5l7 6.5 7-6.5" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" class="rsvp-cue__c2"/>', 'rsvp-cue__chevrons'),
};

// ── Dates (re-rendered on language change) ─────────────────────────────────────────────────────────

function formatTime(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(getLocale(), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, hh, mm)));
}

function whenShort(config) {
  const d = formatDate(config.eventDate, { weekday: 'long', day: 'numeric', month: 'long' });
  return config.eventStart ? `${d} · ${formatTime(config.eventStart)}` : d;
}

function whenLong(config) {
  const d = formatDate(config.eventDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (!config.eventStart) return `${d} · ${t('actions.allDay')}`;
  const start = formatTime(config.eventStart);
  return config.eventEnd ? `${d} · ${start}–${formatTime(config.eventEnd)}` : `${d} · ${start}`;
}

function siteUrl() {
  const { origin, pathname } = window.location;
  return origin.startsWith('http') ? origin + pathname.replace(/index\.html$/, '') : '';
}

function calendarStrings(config) {
  const venue = [config.venue?.line1, config.venue?.line2].filter(Boolean).join(', ');
  return {
    title: t('actions.eventTitle'),
    description: [t('actions.eventDetails'), venue].filter(Boolean).join('\n\n'),
    location: config.venue?.mapQuery,
    url: siteUrl(),
    lang: getLang(),
  };
}

// ── Scroll reveal ──────────────────────────────────────────────────────────────────────────────────

let revealIO = null;
let revealStarted = false;
const revealPending = new Set();

/** Register an element for scroll reveal. Safe to call before or after the doors open. */
export function observeReveal(el) {
  if (!el || !el.classList || el.classList.contains('is-visible')) return;
  if (!el.classList.contains('reveal')) el.classList.add('reveal');
  if (revealIO) revealIO.observe(el);
  else if (revealStarted) el.classList.add('is-visible');
  else revealPending.add(el);
}

function startReveal() {
  if (revealStarted) return;
  revealStarted = true;
  const all = () => [...document.querySelectorAll('.reveal:not(.is-visible)'), ...revealPending];
  if (!('IntersectionObserver' in window)) {
    all().forEach((el) => el.classList.add('is-visible'));
    return;
  }
  revealIO = new IntersectionObserver((entries) => {
    let order = 0;
    entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      .forEach((e) => {
        e.target.style.setProperty('--reveal-order', String(order++));
        e.target.classList.add('is-visible');
        revealIO.unobserve(e.target);
      });
  }, { rootMargin: '0px 0px -7% 0px', threshold: 0.06 });
  all().forEach((el) => revealIO.observe(el));
  revealPending.clear();

  // Pick up `.reveal` elements other modules insert later (RSVP steps, success panels…).
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList.contains('reveal')) observeReveal(n);
        n.querySelectorAll?.('.reveal:not(.is-visible)').forEach(observeReveal);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

function whenOpened(cb) {
  const html = document.documentElement;
  if (html.classList.contains('is-open')) { cb(); return; }
  let done = false;
  const fire = () => { if (!done) { done = true; mo.disconnect(); cb(); } };
  document.addEventListener('invite:opened', fire, { once: true });
  // Fallback: main.js's error path adds html.is-open without dispatching the event.
  const mo = new MutationObserver(() => { if (html.classList.contains('is-open')) fire(); });
  mo.observe(html, { attributes: true, attributeFilter: ['class'] });
}

// ── Actions: Directions + Add to calendar ─────────────────────────────────────────────────────────

function mountActions(root, config) {
  root.classList.add('actions');
  root.setAttribute('aria-labelledby', 'actions-title');

  const heading = h('h2', { id: 'actions-title', class: 'ornate-label' },
    h('span', { class: 'ornate-label__rule', 'aria-hidden': 'true' }),
    h('span', { class: 'ornate-label__rosette', 'aria-hidden': 'true', html: rosetteSvg('rosette') }),
    h('span', { class: 'ornate-label__text', i18n: 'actions.heading' }),
    h('span', { class: 'ornate-label__rosette', 'aria-hidden': 'true', html: rosetteSvg('rosette') }),
    h('span', { class: 'ornate-label__rule', 'aria-hidden': 'true' }),
  );

  const tile = (tag, attrs, icon, titleKey, sub) => h(tag, { class: 'action-tile', ...attrs },
    h('span', { class: 'action-tile__icon', 'aria-hidden': 'true', html: ICONS[icon] }),
    h('span', { class: 'action-tile__title', i18n: titleKey }),
    sub,
  );

  const directions = tile('a', { href: mapsUrl(config), target: '_blank', rel: 'noopener' }, 'pin', 'actions.directions',
    h('span', { class: 'action-tile__sub', i18n: 'actions.directionsSub' }));

  const calSub = h('span', { class: 'action-tile__sub' });
  const calBtn = tile('button', {
    type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'calendar-dialog',
  }, 'calendar', 'actions.calendar', calSub);

  const list = h('ul', { class: 'actions__list', role: 'list' }, h('li', {}, directions), h('li', {}, calBtn));

  // Dialog: anchored popover on wide screens, bottom sheet on phones.
  const when = h('p', { class: 'cal-dialog__when' });
  const optIcs = h('button', { type: 'button', class: 'cal-option', 'data-cal': 'ics' },
    h('span', { class: 'cal-option__icon', 'aria-hidden': 'true', html: ICONS.download }),
    h('span', { class: 'cal-option__text' },
      h('span', { class: 'cal-option__title', i18n: 'actions.calendarApple' }),
      h('span', { class: 'cal-option__sub', i18n: 'actions.calendarAppleSub' })),
    h('span', { class: 'cal-option__end', 'aria-hidden': 'true', html: ICONS.chevron }));
  const optGoogle = h('a', { class: 'cal-option', 'data-cal': 'google', target: '_blank', rel: 'noopener', href: '#' },
    h('span', { class: 'cal-option__icon', 'aria-hidden': 'true', html: ICONS.web }),
    h('span', { class: 'cal-option__text' },
      h('span', { class: 'cal-option__title', i18n: 'actions.calendarGoogle' }),
      h('span', { class: 'cal-option__sub', i18n: 'actions.calendarGoogleSub' })),
    h('span', { class: 'cal-option__end', 'aria-hidden': 'true', html: ICONS.external }));
  const options = h('ul', { class: 'cal-dialog__options', role: 'list' }, h('li', {}, optIcs), h('li', {}, optGoogle));
  const closeBtn = h('button', { type: 'button', class: 'cal-dialog__close', 'data-i18n-attr': 'aria-label:actions.close', 'aria-label': t('actions.close'), html: ICONS.close });

  const dialog = h('dialog', { id: 'calendar-dialog', class: 'cal-dialog', 'aria-labelledby': 'calendar-dialog-title' },
    h('div', { class: 'cal-dialog__panel', tabindex: '-1' },
      h('span', { class: 'cal-dialog__handle', 'aria-hidden': 'true' }),
      h('div', { class: 'cal-dialog__head' },
        h('span', { class: 'cal-dialog__rosette', 'aria-hidden': 'true', html: rosetteSvg('rosette') }),
        h('h3', { id: 'calendar-dialog-title', class: 'cal-dialog__title', i18n: 'actions.calendar' }),
        closeBtn),
      when,
      options),
    h('span', { class: 'cal-dialog__caret', 'aria-hidden': 'true' }));

  // Android guests are almost always on Google Calendar: offer it first there.
  if (isAndroid()) options.prepend(options.lastElementChild);

  const inner = h('div', { class: 'actions__inner reveal reveal--rise' }, heading, list);
  root.replaceChildren(inner, dialog);

  const render = () => {
    calSub.textContent = whenShort(config);
    when.textContent = whenLong(config);
    optGoogle.href = googleCalendarUrl(config, calendarStrings(config));
    directions.href = mapsUrl(config);
  };
  render();
  onLangChange(render);

  // ── Dialog behaviour ──
  const html = document.documentElement;
  const sheetMQ = window.matchMedia('(max-width: 639.98px)');
  let closing = false;

  const position = () => {
    if (!dialog.open || dialog.classList.contains('is-sheet')) return;
    const r = calBtn.getBoundingClientRect();
    const w = dialog.offsetWidth;
    const hgt = dialog.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const gap = 12;
    const margin = 12;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(margin, Math.min(left, vw - w - margin));
    const below = r.bottom + gap + hgt <= vh - margin || r.top - gap - hgt < margin;
    const top = below ? r.bottom + gap : r.top - gap - hgt;
    dialog.style.left = `${Math.round(left)}px`;
    dialog.style.top = `${Math.round(Math.max(margin, top))}px`;
    dialog.style.setProperty('--caret-x', `${Math.round(r.left + r.width / 2 - left)}px`);
    dialog.classList.toggle('is-above', !below);
  };

  // Keyboard opens land on the first option; pointer/touch opens focus the panel itself so no ring
  // flashes on an option the guest hasn't chosen (Tab / arrows still reach the options at once).
  const open = (viaKeyboard = true) => {
    if (dialog.open) return;
    render();
    closing = false;
    dialog.classList.remove('is-closing');
    const sheet = sheetMQ.matches;
    dialog.classList.toggle('is-sheet', sheet);
    dialog.classList.toggle('is-popover', !sheet);
    dialog.style.left = dialog.style.top = '';
    dialog.showModal();
    html.classList.add('has-modal');
    position();
    calBtn.setAttribute('aria-expanded', 'true');
    const first = options.querySelector('.cal-option');
    (viaKeyboard ? first : dialog.querySelector('.cal-dialog__panel'))?.focus({ preventScroll: true });
  };

  const close = () => {
    if (!dialog.open || closing) return;
    closing = true;
    if (reducedMotion()) { dialog.close(); return; }
    dialog.classList.add('is-closing');
    const panel = dialog.querySelector('.cal-dialog__panel');
    let finished = false;
    const finish = () => { if (!finished) { finished = true; dialog.close(); } };
    panel.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 420);
  };

  dialog.addEventListener('close', () => {
    closing = false;
    dialog.classList.remove('is-closing');
    html.classList.remove('has-modal');
    calBtn.setAttribute('aria-expanded', 'false');
    calBtn.focus({ preventScroll: true });
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Esc → animated close
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) close(); // click on the ::backdrop (the panel fills the dialog box)
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...options.querySelectorAll('.cal-option')];
    const i = items.indexOf(document.activeElement);
    e.preventDefault();
    if (i < 0) { (e.key === 'ArrowDown' ? items[0] : items.at(-1)).focus(); return; }
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  });
  closeBtn.addEventListener('click', close);
  // e.detail is 0 for Enter/Space activation, ≥1 for a real click or tap.
  calBtn.addEventListener('click', (e) => (dialog.open ? close() : open(e.detail === 0)));
  window.addEventListener('resize', () => {
    if (!dialog.open) return;
    if (sheetMQ.matches !== dialog.classList.contains('is-sheet')) dialog.close();
    else position();
  });

  optIcs.addEventListener('click', () => {
    const ics = buildIcs(config, calendarStrings(config));
    downloadIcs(ics, { filename: ICS_FILENAME, config });
    close();
  });
  optGoogle.addEventListener('click', () => { optGoogle.href = googleCalendarUrl(config, calendarStrings(config)); setTimeout(close, 0); });
}

// ── RSVP cue ───────────────────────────────────────────────────────────────────────────────────────

function mountCue(root) {
  root.classList.add('rsvp-cue');
  const link = h('a', { class: 'rsvp-cue__link', href: '#rsvp' },
    h('span', { class: 'rsvp-cue__label', i18n: 'cue.rsvp' }),
    h('span', { class: 'visually-hidden', i18n: 'cue.aria' }),
    h('span', { class: 'rsvp-cue__icon', 'aria-hidden': 'true', html: ICONS.cue }));
  root.replaceChildren(link);

  link.addEventListener('click', (e) => {
    const target = document.getElementById('rsvp');
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  // Fade out once the guest scrolls; back again at the very top.
  let ticking = false;
  const update = () => {
    ticking = false;
    root.classList.toggle('is-faded', window.scrollY > 32);
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

// ── Footer ─────────────────────────────────────────────────────────────────────────────────────────

function mountFooter(root, config) {
  root.classList.add('footer');
  const date = h('time', { class: 'footer__date', datetime: config.eventDate });
  root.replaceChildren(h('div', { class: 'footer__inner reveal reveal--rise' },
    h('span', { class: 'footer__divider ornate-label', 'aria-hidden': 'true', html: dividerHtml() }),
    h('p', { class: 'footer__signoff', i18n: 'footer.signoff' }),
    h('p', { class: 'footer__names', lang: 'en', dir: 'ltr', translate: 'no', i18n: 'footer.names' }),
    h('p', { class: 'footer__dua', i18n: 'footer.dua' }),
    h('p', { class: 'footer__meta' }, date),
  ));
  const render = () => { date.textContent = formatDate(config.eventDate, { day: 'numeric', month: 'long', year: 'numeric' }); };
  render();
  onLangChange(render);
}

// ── Desktop entrance ───────────────────────────────────────────────────────────────────────────────
// The opening doors stand in the middle of the screen, but on wide screens the Postcard lives in the
// first column. So while the doors play, the card waits centred (right behind the doors) with the panel
// hidden; once the doors have faded it glides into its column and the panel fades in beside it.

function mountDesktopEntrance() {
  const html = document.documentElement;
  const wide = window.matchMedia('(min-width: 1000px)');
  const card = document.querySelector('.site__card');
  if (!card || html.classList.contains('is-open') || reducedMotion() || !wide.matches) return;
  try { if (new URLSearchParams(location.search).get('open') === '1') return; } catch { /* ignore */ }

  const measure = () => {
    if (!wide.matches) { finish(); return; }
    const centre = card.offsetLeft + card.offsetWidth / 2;    // layout box: ignores the transform
    card.style.setProperty('--card-shift', `${Math.round(html.clientWidth / 2 - centre)}px`);
  };
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    window.removeEventListener('resize', measure);
    html.classList.remove('is-staging');
    html.classList.add('is-staged');
    setTimeout(() => { html.classList.remove('is-staged'); card.style.removeProperty('--card-shift'); }, 2000);
  }
  html.classList.add('is-staging');
  measure();
  window.addEventListener('resize', measure);
  whenOpened(() => {
    // doors finish fading ~1.1 s after the page opens; a skipped/reduced opening leaves sooner
    const timer = setTimeout(finish, 1150);
    const gone = () => !document.getElementById('opening');
    if (gone()) { clearTimeout(timer); finish(); return; }
    const mo = new MutationObserver(() => { if (gone()) { mo.disconnect(); clearTimeout(timer); finish(); } });
    mo.observe(document.body, { childList: true });
    setTimeout(() => mo.disconnect(), 1200);
  });
}

// ── Mount ──────────────────────────────────────────────────────────────────────────────────────────

export function mountLayout({ actions, cue, footer } = {}, config) {
  // The doors play from the top on every visit; don't let the browser restore a mid-page scroll.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!document.documentElement.classList.contains('is-open')) window.scrollTo(0, 0);

  if (actions) mountActions(actions, config);
  if (cue) mountCue(cue);
  if (footer) mountFooter(footer, config);
  mountDesktopEntrance();

  whenOpened(startReveal);
}
