// The Postcard's Mughal arch, shared by the postcard frame and the opening doors so they match exactly.
// Geometry traced from requirements/references/invite_postcard.png. The dome scales with WIDTH only,
// so the arch keeps its shape at any aspect ratio (needs h ≥ 0.55·w).
//
//   archPath(w, h)                → closed path (bottom edge included), origin top-left, tip at (w/2, 0)
//   archPath(w, h, { open: true}) → no bottom edge (for a stroked frame that runs off the card)
//   ARCH_TOP_RATIO                → dome height ÷ width (where the straight sides begin)

export const ARCH_TOP_RATIO = 0.465;

export function archPath(w, h, { open = false, x = 0, y = 0 } = {}) {
  const P = (fx, fy) => `${round(x + fx)},${round(y + fy)}`;
  const L = (fx, fyw) => P(fx * w, fyw * w);          // left-half point, y as fraction of width
  const R = (fx, fyw) => P((1 - fx) * w, fyw * w);    // mirrored right-half point
  const side = ARCH_TOP_RATIO;
  return [
    `M${P(0, h)}`,
    `L${L(0, side)}`,
    // lower shoulder: convex sweep from the straight side up to the lower cusp
    `C${L(0, 0.39)} ${L(0.06, 0.33)} ${L(0.123, 0.308)}`,
    // upper shoulder: rises from the lower cusp into the dome's cusp
    `C${L(0.13, 0.26)} ${L(0.17, 0.2)} ${L(0.251, 0.176)}`,
    // dome, then pinched onion finial
    `C${L(0.27, 0.12)} ${L(0.36, 0.075)} ${L(0.43, 0.045)}`,
    `C${L(0.46, 0.032)} ${L(0.49, 0.015)} ${L(0.5, 0)}`,
    `C${R(0.49, 0.015)} ${R(0.46, 0.032)} ${R(0.43, 0.045)}`,
    `C${R(0.36, 0.075)} ${R(0.27, 0.12)} ${R(0.251, 0.176)}`,
    `C${R(0.17, 0.2)} ${R(0.13, 0.26)} ${R(0.123, 0.308)}`,
    `C${R(0.06, 0.33)} ${R(0, 0.39)} ${R(0, side)}`,
    `L${P(w, h)}`,
    open ? '' : 'Z',
  ].join(' ');
}

/** Left half of the arch (one door leaf), in a (w/2)×h box where w is the FULL arch width.
 *  For the right leaf, draw the same path mirrored: transform="scale(-1,1)" / CSS scaleX(-1). */
export function archHalfPath(w, h) {
  const half = w / 2;
  const L = (fx, fyw) => `${round(fx * w)},${round(fyw * w)}`;
  const s = ARCH_TOP_RATIO;
  return [
    `M0,${round(h)}`, `L${L(0, s)}`,
    `C${L(0, 0.39)} ${L(0.06, 0.33)} ${L(0.123, 0.308)}`,
    `C${L(0.13, 0.26)} ${L(0.17, 0.2)} ${L(0.251, 0.176)}`,
    `C${L(0.27, 0.12)} ${L(0.36, 0.075)} ${L(0.43, 0.045)}`,
    `C${L(0.46, 0.032)} ${L(0.49, 0.015)} ${L(0.5, 0)}`,
    `L${round(half)},${round(h)}`, 'Z',
  ].join(' ');
}

const round = (n) => Math.round(n * 100) / 100;
