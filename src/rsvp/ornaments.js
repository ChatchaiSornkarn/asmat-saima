// Inline SVG ornaments in the Postcard's gold line-art language. All decorative (aria-hidden).
// Colours come from CSS (`currentColor`), so they follow the tokens.

const petals = (r, rx, ry, n = 8) =>
  Array.from({ length: n }, (_, i) => `<ellipse cx="0" cy="${-r}" rx="${rx}" ry="${ry}" transform="rotate(${(360 / n) * i})"/>`).join('');

/** The eight-petal rosette used as dividers on the Postcard. */
export function rosette(cls = '') {
  return `<svg class="${cls}" viewBox="-12 -12 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="0.75">
    <g>${petals(5.6, 2.1, 4.1)}</g>
    <g transform="rotate(22.5)">${petals(8.4, 1.1, 2.2)}</g>
    <circle r="2.1"/><circle r="0.7" fill="currentColor" stroke="none"/>
  </svg>`;
}

/** Hairline — rosette — hairline. */
export function divider(cls = 'rsvp-divider') {
  return `<span class="${cls}" aria-hidden="true"><span class="${cls}__line"></span>${rosette(`${cls}__rosette`)}<span class="${cls}__line"></span></span>`;
}

/** Interlocked rings with a diamond, inside a double laurel circle — draws itself (CSS). */
export function ringsSeal() {
  return `<svg class="rsvp-seal" viewBox="0 0 120 120" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <circle class="rsvp-seal__draw rsvp-seal__outer" cx="60" cy="60" r="56" pathLength="1" stroke-width="0.8"/>
    <circle class="rsvp-seal__draw rsvp-seal__inner" cx="60" cy="60" r="51" pathLength="1" stroke-width="0.5"/>
    <circle class="rsvp-seal__draw rsvp-seal__ring1" cx="49" cy="66" r="17" pathLength="1" stroke-width="2"/>
    <circle class="rsvp-seal__draw rsvp-seal__ring2" cx="71" cy="66" r="17" pathLength="1" stroke-width="2"/>
    <path class="rsvp-seal__draw rsvp-seal__gem" d="M64 42 L71 35 L78 42 L71 50 Z M64 42 H78 M68 35.6 L66.5 42 L71 50 L75.5 42 L74 35.6" pathLength="1" stroke-width="1"/>
    <g class="rsvp-seal__spark" stroke-width="0.9">
      <path d="M33 34 v6 M30 37 h6"/><path d="M90 84 v5 M87.5 86.5 h5"/><path d="M88 30 v4 M86 32 h4"/>
    </g>
  </svg>`;
}

/** A single rosette within a circle, drawing itself — for the cancel confirmation. */
export function rosetteSeal() {
  const p = Array.from({ length: 8 }, (_, i) =>
    `<ellipse class="rsvp-seal__draw" cx="60" cy="45" rx="4.6" ry="9.5" transform="rotate(${45 * i} 60 60)" pathLength="1" stroke-width="1"/>`).join('');
  return `<svg class="rsvp-seal rsvp-seal--rosette" viewBox="0 0 120 120" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-linecap="round">
    <circle class="rsvp-seal__draw rsvp-seal__outer" cx="60" cy="60" r="56" pathLength="1" stroke-width="0.8"/>
    <circle class="rsvp-seal__draw rsvp-seal__inner" cx="60" cy="60" r="51" pathLength="1" stroke-width="0.5"/>
    <g class="rsvp-seal__petals">${p}</g>
    <circle class="rsvp-seal__draw" cx="60" cy="60" r="5" pathLength="1" stroke-width="1"/>
  </svg>`;
}

export const icons = {
  plus: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 4v12M4 10h12"/></svg>',
  close: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg>',
  check: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path class="rsvp-check__tick" d="M4.5 10.5l3.6 3.6L15.5 6.5" pathLength="1"/></svg>',
  dash: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5.5 10h9"/></svg>',
  alert: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v5"/><circle cx="10" cy="13.8" r="0.6" fill="currentColor"/></svg>',
  info: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5"/><circle cx="10" cy="6.4" r="0.6" fill="currentColor"/></svg>',
  back: '<svg class="rsvp-flip" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5l-5 5 5 5"/></svg>',
  search: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5"/><path d="M12.5 12.5l4 4"/></svg>',
};
