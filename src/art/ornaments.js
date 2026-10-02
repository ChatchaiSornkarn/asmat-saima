// Gold line-art for the Postcard, drawn as inline SVG strings (crisp at any size, no requests).
// Every function returns markup for a decorative, aria-hidden <svg>. Colours come from CSS:
//   stroke/fill use currentColor (set `color` on the svg) plus the `--pc-*` variables in postcard.css.
// Elements that "draw themselves in" carry pathLength="1" and the class `pc-draw`.

const r2 = (n) => Math.round(n * 100) / 100;

/** 8-petal rosette (the star-flower used above the title and in the dividers). */
export function rosette(cls = '') {
  const outer = 'M0,-47 C6.5,-38 12.5,-30 10.6,-21.2 C9.6,-17 5.2,-13.6 0,-12.2 C-5.2,-13.6 -9.6,-17 -10.6,-21.2 C-12.5,-30 -6.5,-38 0,-47Z';
  const inner = 'M0,-31.5 C4.6,-25.5 6,-19.5 0,-12.5 C-6,-19.5 -4.6,-25.5 0,-31.5Z';
  const vein = 'M0,-40 L0,-17';
  let petals = '', inners = '', veins = '';
  for (let i = 0; i < 8; i++) {
    const a = i * 45;
    petals += `<path class="pc-draw" pathLength="1" d="${outer}" transform="rotate(${a})"/>`;
    inners += `<path class="pc-draw" pathLength="1" d="${inner}" transform="rotate(${a + 22.5})"/>`;
    veins += `<path class="pc-draw pc-thin" pathLength="1" d="${vein}" transform="rotate(${a})"/>`;
  }
  return `<svg class="pc-rosette ${cls}" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
  <g class="pc-rosette__fill">${petals}</g>
  <g class="pc-rosette__line">${petals}${inners}${veins}
    <circle class="pc-draw" pathLength="1" r="9"/><circle class="pc-dot" r="3.4"/>
  </g></svg>`;
}

/** Hairline that tapers to a point at the outer end (side: 'start' tapers left, 'end' tapers right). */
export function hairline(side = 'start', cls = '') {
  // 200×6 box, thickest (1.6) next to the rosette, needle-thin at the far end, a tiny bead before the tip
  const d = side === 'start'
    ? 'M0,3 C40,2.6 110,2.05 200,2.05 L200,3.95 C110,3.95 40,3.4 0,3Z'
    : 'M200,3 C160,2.6 90,2.05 0,2.05 L0,3.95 C90,3.95 160,3.4 200,3Z';
  return `<svg class="pc-hairline ${cls}" viewBox="0 0 200 6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

/** Divider: hairline · rosette · hairline (flex row, see .pc-divider in postcard.css). */
export function divider(cls = '') {
  return `<div class="pc-divider ${cls}" aria-hidden="true">${hairline('start', 'pc-divider__line pc-divider__line--start')}${rosette('pc-divider__rosette')}${hairline('end', 'pc-divider__line pc-divider__line--end')}</div>`;
}

/** Laurel sprig: a gently curved stem with alternating gold leaves. `flip` mirrors it (right-hand sprig). */
export function laurel(flip = false, cls = '') {
  // Stem: cubic from the bottom (inner side) curving outward and up to the tip
  const P = [[31, 99], [9, 84], [5, 44], [20, 4]];
  const at = (t) => {
    const u = 1 - t;
    const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
    const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
    const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]);
    const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1]);
    return { x, y, a: (Math.atan2(dy, dx) * 180) / Math.PI };
  };
  // Leaf: almond pointing along +x, base at the origin
  const leaf = (len, w) => `M0,0 C${r2(len * 0.28)},${r2(-w)} ${r2(len * 0.78)},${r2(-w * 0.9)} ${len},0 C${r2(len * 0.78)},${r2(w * 0.9)} ${r2(len * 0.28)},${r2(w)} 0,0Z`;
  const vein = (len) => `M${r2(len * 0.12)},0 L${r2(len * 0.86)},0`;
  let leaves = '';
  const steps = [0.1, 0.22, 0.34, 0.46, 0.58, 0.7, 0.81];
  steps.forEach((t, i) => {
    const p = at(t);
    const side = i % 2 ? 1 : -1;               // alternate outer / inner side of the stem
    const len = 16 - t * 6, w = 5.4 - t * 1.8;
    const rot = p.a + side * 44;
    leaves += `<g transform="translate(${r2(p.x)},${r2(p.y)}) rotate(${r2(rot)})"><path class="pc-leaf" d="${leaf(len, w)}"/><path class="pc-leaf-vein" d="${vein(len)}"/></g>`;
  });
  const tip = at(1);
  leaves += `<g transform="translate(${r2(tip.x)},${r2(tip.y)}) rotate(${r2(tip.a)})"><path class="pc-leaf" d="${leaf(10, 3.4)}"/></g>`;
  const stem = `M${P[0]} C${P[1]} ${P[2]} ${P[3]}`;
  return `<svg class="pc-laurel ${cls}" viewBox="0 0 40 112" aria-hidden="true" focusable="false">
  <defs><linearGradient id="pc-leaf-grad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="var(--pc-leaf-lo)"/><stop offset=".55" stop-color="var(--pc-leaf)"/><stop offset="1" stop-color="var(--pc-foil-hi)"/>
  </linearGradient></defs>
  <g${flip ? ' transform="translate(40,0) scale(-1,1)"' : ''}><path class="pc-stem pc-draw" pathLength="1" d="${stem}"/>${leaves}</g></svg>`;
}

/** Two interlocked rings with a faceted diamond resting on top. `uid` keeps gradient ids unique. */
export function rings(uid = 'r') {
  const cxL = 44, cxR = 77, cy = 66, R = 24;
  // the two crossings: x = midpoint, y = cy ± sqrt(R² − (d/2)²)
  const half = (cxR - cxL) / 2, dy = Math.sqrt(R * R - half * half);
  const xm = (cxL + cxR) / 2, yBot = cy + dy;
  // short arc of the RIGHT ring around the lower crossing — redrawn on top so the rings interlock
  const ang = Math.atan2(yBot - cy, xm - cxR); // angle of the crossing seen from the right ring's centre
  const a0 = ang - 0.42, a1 = ang + 0.42;
  const pt = (a) => `${r2(cxR + R * Math.cos(a))},${r2(cy + R * Math.sin(a))}`;
  const over = `M${pt(a1)} A${R},${R} 0 0,0 ${pt(a0)}`;
  const g = `pc-ring-grad-${uid}`, gd = `pc-gem-grad-${uid}`;
  return `<svg class="pc-rings" viewBox="0 0 121 96" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--pc-foil-hi)"/><stop offset=".45" stop-color="var(--pc-foil)"/>
      <stop offset=".6" stop-color="var(--pc-foil-hi)"/><stop offset="1" stop-color="var(--pc-foil-lo)"/>
    </linearGradient>
    <linearGradient id="${gd}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--pc-gem-hi)"/><stop offset="1" stop-color="var(--pc-gem-lo)"/>
    </linearGradient>
  </defs>
  <g fill="none" stroke="url(#${g})" stroke-width="3.5">
    <circle class="pc-draw" pathLength="1" cx="${cxR}" cy="${cy}" r="${R}"/>
    <circle class="pc-draw" pathLength="1" cx="${cxL}" cy="${cy}" r="${R}"/>
    <path class="pc-ring-gap" d="${over}" stroke="var(--pc-paper-flat)" stroke-width="6.6"/>
    <path class="pc-draw" pathLength="1" d="${over}"/>
  </g>
  <g class="pc-gem" stroke="url(#${g})" stroke-width="1.5" stroke-linejoin="round">
    <path fill="url(#${gd})" d="M47.5,25 L53.5,16.5 L68.5,16.5 L74.5,25 L61,42Z"/>
    <path fill="none" d="M47.5,25 L74.5,25 M53.5,16.5 L57.4,25 L61,16.5 L64.6,25 L68.5,16.5 M57.4,25 L61,42 L64.6,25"/>
  </g>
  <g class="pc-sparkle" fill="var(--pc-foil-hi)"><path d="M75,13 l1.1,3.1 3.1,1.1 -3.1,1.1 -1.1,3.1 -1.1,-3.1 -3.1,-1.1 3.1,-1.1Z"/></g>
</svg>`;
}

/** Map pin. */
export function pin() {
  return `<svg class="pc-pin" viewBox="0 0 24 32" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M12,31.2 C10.6,29.3 2,18.6 2,11.6 A10,10 0 0 1 22,11.6 C22,18.6 13.4,29.3 12,31.2Z M12,15.6 A4,4 0 1 0 12,7.6 A4,4 0 1 0 12,15.6Z"/></svg>`;
}
