// Public guest count — "N guests from M families" (Q13, Q16). Aggregates only; hidden below the
// threshold, whenever the request fails, and always when config.showGuestCount is false.
import { t, formatNumber } from '../i18n/index.js';
import { h } from './dom.js';

export function createCount({ api, config }) {
  const enabled = config.showGuestCount === true;   // off unless switched on, even with a stale cached config.js
  const threshold = Number.isFinite(Number(config.guestCountThreshold)) ? Number(config.guestCountThreshold) : 10;
  const line = h('span', { class: 'rsvp-count__line' });
  const el = h('p', { class: 'rsvp-count', hidden: true },
    h('span', { class: 'rsvp-count__lead', i18n: 'rsvp.countLead' }), line);
  let data = null;
  let seq = 0;

  function render() {
    const show = enabled && !!data && data.guests >= threshold && data.households > 0;
    el.hidden = !show;
    if (!show) return;
    line.textContent = t('rsvp.count', {
      count: data.households,
      guests: formatNumber(data.guests),
      households: formatNumber(data.households),
    });
  }

  async function refresh() {
    if (!enabled) return;
    const my = ++seq;
    let res;
    try { res = await api.count(); } catch { res = null; }
    if (my !== seq) return;                         // a newer request won
    const ok = res && res.ok && Number.isFinite(res.guests) && Number.isFinite(res.households);
    data = ok ? { guests: res.guests, households: res.households } : null;
    render();
  }

  return { el, refresh, render };
}
