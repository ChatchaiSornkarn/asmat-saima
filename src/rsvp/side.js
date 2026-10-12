// Side — which family invited the guest (2_main_idea issue 15, design Q1). Pure — no DOM — so it runs
// under node for tests/rsvp/.
//
// Each family sends its own link:  …/asmat-saima/?side=asmat   and   …/asmat-saima/?side=saima
// (any letter case; combines with ?lang=, e.g. ?side=saima&lang=ur). The page reads it ONCE on load
// (rsvp/index.js → sideFromUrl), never shows it, and sends it with the attend reply only.
//
//   cleanSide(v)           → 'asmat' | 'saima' | ''   ('' = missing or invalid)
//   sideFromSearch(search) → cleanSide of the `side` query parameter of a '?a=b' string or URLSearchParams
//   sideFromUrl(loc?)      → the same for the current page (location); '' outside a browser
//
// '' means a bare or invalid link: the We're coming tab then shows a required "Asmat's guest" /
// "Saima's guest" choice (issue 16, design Q6 — UI in rsvp/side-choice.js). Every attend reply carries
// a side; the Apps Script (apps-script/Rsvp.gs → cleanSide_) and the demo mock reject one without.
// Cancels never carry a side: the Party keeps its own.
//
//   needsSideChoice(linkSide)       → true when the link gave no valid side (show the choice)
//   resolveSide(linkSide, chosen)   → the side to send: the link's wins; else the guest's choice; else ''
//   checkSide(v)                    → 'sideChoice.required' | ''   (i18n error key, like validate.js)
//   sideKeyStep(key, i, n, rtl)     → index after an arrow/Home/End key in the two-button radiogroup, or -1

export const SIDES = Object.freeze(['asmat', 'saima']);

export function cleanSide(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim().toLowerCase();
  return SIDES.includes(s) ? s : '';
}

export function sideFromSearch(search) {
  let q;
  try { q = search instanceof URLSearchParams ? search : new URLSearchParams(String(search ?? '')); } catch { return ''; }
  return cleanSide(q.get('side'));
}

export function sideFromUrl(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc) return '';
  return sideFromSearch(loc.search);
}

export const needsSideChoice = (linkSide) => !cleanSide(linkSide);

export function resolveSide(linkSide, chosen) {
  return cleanSide(linkSide) || cleanSide(chosen);
}

export function checkSide(v) {
  return cleanSide(v) ? '' : 'sideChoice.required';
}

/** Roving-focus step for a radiogroup laid out in a row. In RTL the row is mirrored, so ←/→ swap. */
export function sideKeyStep(key, i, n, rtl = false) {
  if (n < 1) return -1;
  const fwd = rtl ? 'ArrowLeft' : 'ArrowRight', back = rtl ? 'ArrowRight' : 'ArrowLeft';
  if (key === fwd || key === 'ArrowDown') return (i + 1) % n;
  if (key === back || key === 'ArrowUp') return (i - 1 + n) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return -1;
}
