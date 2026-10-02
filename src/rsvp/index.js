// RSVP section — heading, deadline, public count, demo notice, tabs (attend | cancel).
// Public API: mountRsvp(el, config)
import { t, formatDate, onLangChange } from '../i18n/index.js';
import { h, setText, retranslate, session } from './dom.js';
import { createApi } from './api.js';
import { createAttend } from './attend.js';
import { createCancel } from './cancel.js';
import { createCount } from './count.js';
import { divider, icons } from './ornaments.js';

const TAB_KEY = 'asmat-saima-rsvp-tab';
const TABS = ['attend', 'cancel'];

export function mountRsvp(el, config) {
  if (!el) return;
  const api = createApi(config);

  // ── Header ───────────────────────────────────────────────────────────────
  const deadline = h('p', { class: 'rsvp__deadline', hidden: true });
  const count = createCount({ api, config });
  const head = h('header', { class: 'rsvp__head' },
    h('span', { class: 'rsvp__ornament', html: divider('rsvp-divider') }),
    h('h2', { class: 'rsvp__title', id: 'rsvp-title', i18n: 'rsvp.heading' }),
    h('p', { class: 'rsvp__sub', i18n: 'rsvp.subheading' }),
    deadline,
    count.el,
  );

  function renderDeadline() {
    const iso = config.rsvpDeadline;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) { deadline.hidden = true; return; }
    let date;
    try { date = formatDate(String(iso), { day: 'numeric', month: 'long', year: 'numeric' }); } catch { deadline.hidden = true; return; }
    setText(deadline, 'rsvp.deadline', { date });
    deadline.hidden = false;
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────
  // "Cancel / can't come" must break after the slash, never before it (and never mid-phrase),
  // in every script — so each side of " / " is its own unbreakable-if-possible chunk.
  function renderTabLabel(span) {
    const text = t(span.dataset.key);
    const parts = text.split(/\s+\/\s+/);
    span.replaceChildren(...parts.flatMap((p, i) => [
      i ? ' ' : null,
      h('span', { class: 'rsvp-tabs__chunk', text: i < parts.length - 1 ? `${p} /` : p }),
    ].filter(Boolean)));
  }
  const pill = h('span', { class: 'rsvp-tabs__pill', 'aria-hidden': 'true' });
  const tabs = {}, panels = {};
  TABS.forEach((name) => {
    tabs[name] = h('button', {
      type: 'button', role: 'tab', class: 'rsvp-tabs__tab', id: `rsvp-tab-${name}`,
      'aria-controls': `rsvp-panel-${name}`, 'aria-selected': 'false', tabindex: '-1',
      on: { click: () => select(name, { user: true }) },
    }, h('span', { class: 'rsvp-tabs__label', dataset: { key: `rsvp.tabs.${name}` } }));
    panels[name] = h('div', { class: 'rsvp-panel', role: 'tabpanel', id: `rsvp-panel-${name}`, 'aria-labelledby': `rsvp-tab-${name}`, tabindex: '-1', hidden: true });
  });
  const renderTabs = () => TABS.forEach((n) => renderTabLabel(tabs[n].firstChild));
  renderTabs();
  const tablist = h('div', { class: 'rsvp-tabs', role: 'tablist', 'aria-labelledby': 'rsvp-title', on: { keydown: onTabKey } },
    pill, tabs.attend, tabs.cancel);
  const hint = h('p', { class: 'rsvp__hint' }, h('span', { class: 'rsvp__hint-icon', html: icons.info }), h('span', { i18n: 'rsvp.hint' }));

  const count$ = () => count.refresh();
  const attend = createAttend({ api, config, onSuccess: count$ });
  const cancel = createCancel({ api, onSuccess: count$ });
  panels.attend.append(attend.el);
  panels.cancel.append(cancel.el);

  const demo = api.demo
    ? h('p', { class: 'rsvp__demo' }, h('span', { class: 'rsvp__demo-icon', html: icons.info }), h('span', { i18n: 'rsvp.demo' }))
    : null;

  const card = h('div', { class: 'rsvp__card' },
    h('span', { class: 'rsvp__corner rsvp__corner--ss', 'aria-hidden': 'true' }),
    h('span', { class: 'rsvp__corner rsvp__corner--se', 'aria-hidden': 'true' }),
    h('span', { class: 'rsvp__corner rsvp__corner--es', 'aria-hidden': 'true' }),
    h('span', { class: 'rsvp__corner rsvp__corner--ee', 'aria-hidden': 'true' }),
    head, tablist, hint, panels.attend, panels.cancel, demo);

  el.classList.add('rsvp');
  el.replaceChildren(card);

  let active = null;
  function select(name, { user = false, focusTab = false } = {}) {
    if (!TABS.includes(name)) name = 'attend';
    const changed = active !== name;
    active = name;
    TABS.forEach((n) => {
      const on = n === name;
      tabs[n].setAttribute('aria-selected', String(on));
      tabs[n].tabIndex = on ? 0 : -1;
      tabs[n].classList.toggle('is-active', on);
      panels[n].hidden = !on;
    });
    if (changed && user) {
      panels[name].classList.remove('is-in'); void panels[name].offsetWidth; panels[name].classList.add('is-in');
    }
    if (focusTab) tabs[name].focus();
    session.set(TAB_KEY, name);
    placePill(user);
  }

  function onTabKey(e) {
    const rtl = getComputedStyle(tablist).direction === 'rtl';
    const i = TABS.indexOf(active);
    let next = null;
    if (e.key === 'ArrowRight') next = TABS[(i + (rtl ? -1 : 1) + TABS.length) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i + (rtl ? 1 : -1) + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    select(next, { user: true, focusTab: true });
  }

  function placePill(animate = false) {
    const tab = tabs[active];
    if (!tab || !tab.offsetWidth) return;
    if (!animate) pill.classList.add('is-instant');
    pill.style.width = `${tab.offsetWidth}px`;
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.classList.add('is-placed');
    if (!animate) requestAnimationFrame(() => requestAnimationFrame(() => pill.classList.remove('is-instant')));
  }

  // keep the pill under the active tab whatever changes the layout (fonts, language, resize)
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => placePill(false));
    ro.observe(tablist);
    TABS.forEach((n) => ro.observe(tabs[n]));
  }
  document.fonts?.ready?.then(() => placePill(false)).catch(() => {});
  document.addEventListener('invite:opened', () => placePill(false));

  // ── Language ─────────────────────────────────────────────────────────────
  onLangChange(() => {
    retranslate(card);
    renderTabs();
    renderDeadline();
    count.render();
    attend.refresh();
    cancel.refresh();
    requestAnimationFrame(() => placePill(false));
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  renderDeadline();
  // A link to #rsvp-cancel / #rsvp-attend opens that tab; otherwise the guest's last tab this session.
  const fromHash = () => { const m = /^#rsvp-(attend|cancel)$/.exec(location.hash); return m && m[1]; };
  select(fromHash() || session.get(TAB_KEY) || 'attend');
  window.addEventListener('hashchange', () => {
    const n = fromHash();
    if (!n) return;
    select(n, { user: true });
    try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { el.scrollIntoView(); }
  });
  count.refresh();

  return { api, select };
}
