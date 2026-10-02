// Opening animation — the arched double doors, their wall, the satin bow and petals.
// The doorway is the Postcard's arch (src/art/arch.js) so the doors match the card exactly.
import { archPath, archHalfPath, ARCH_TOP_RATIO } from './arch.js';
import { noiseURL } from './opening-envelope.js';

const r2 = (n) => Math.round(n * 100) / 100;

/** Doorway placement. Phones: the arch spans the full width. Wide screens: a portrait doorway in a wall. */
export function doorGeometry(VW, VH) {
  const Aw = Math.round(Math.min(VW, Math.max(VH * 0.64, 300)));
  const full = Aw >= VW - 1;
  const y0 = Math.round(full ? Math.max(VH * 0.022, 10) : VH * 0.05);
  const Ah = VH - y0 + 2;
  const x0 = Math.round((VW - Aw) / 2);
  const lw = Aw / 2;
  const dome = ARCH_TOP_RATIO * Aw;
  // ribbon sits a little below the middle of the straight part — where you'd find the handles
  const ribbonY = Math.round(dome + (Ah - dome) * 0.36);
  const bandH = Math.round(Math.min(Math.max(Aw * 0.05, 15), 30));
  const bowW = Math.round(Math.min(Math.max(Aw * 0.46, 150), 270));
  return { VW, VH, Aw, Ah, x0, y0, lw, dome, ribbonY, bandH, bowW, full };
}

function goldDefs(id) {
  return `<linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c9a961"/><stop offset=".45" stop-color="#a8843c"/>
      <stop offset=".62" stop-color="#dcc283"/><stop offset="1" stop-color="#85662a"/></linearGradient>
    <radialGradient id="${id}-brass" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#f8e7b4"/><stop offset=".4" stop-color="#d4b06a"/>
      <stop offset=".8" stop-color="#9c7735"/><stop offset="1" stop-color="#6e5222"/></radialGradient>`;
}

/** 8-petal Mughal rosette (like the gold flower on the Postcard). */
function rosette(cx, cy, r) {
  const d = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r;
    const l1x = cx + Math.cos(a - 0.38) * r * 0.55, l1y = cy + Math.sin(a - 0.38) * r * 0.55;
    const l2x = cx + Math.cos(a + 0.38) * r * 0.55, l2y = cy + Math.sin(a + 0.38) * r * 0.55;
    d.push(`M${r2(cx)},${r2(cy)} Q${r2(l1x)},${r2(l1y)} ${r2(tx)},${r2(ty)} Q${r2(l2x)},${r2(l2y)} ${r2(cx)},${r2(cy)}`);
  }
  return `<path d="${d.join(' ')}"/><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r * 0.16)}"/>`;
}

/* ───────────────────────── wall ───────────────────────── */

export function wallSVG(g) {
  const { VW, VH, Aw, Ah, x0, y0, full } = g;
  const id = 'opwl';
  const n = noiseURL();
  const opening = archPath(Aw, Ah, { x: x0, y: y0 });
  const m1 = archPath(Aw + 10, Ah + 5, { x: x0 - 5, y: y0 - 5, open: true });
  const m2 = archPath(Aw + 22, Ah + 11, { x: x0 - 11, y: y0 - 11, open: true });
  const wallD = `M0,0 H${VW} V${VH} H0 Z ${opening}`;
  const rs = Math.max(Math.min(Aw * 0.045, 18), 9);
  // spandrel rosettes (phones: in the top corners; wide: flanking the dome)
  const sx = full ? Math.max(Aw * 0.1, 24) : x0 - Math.min(x0 * 0.35, 70);
  const sy = y0 + Aw * ARCH_TOP_RATIO * (full ? 0.18 : 0.45);
  return `<svg class="op-svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false">
  <defs>${goldDefs(id)}
    <linearGradient id="${id}-w" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e9dec8"/><stop offset="1" stop-color="#ddd0b5"/></linearGradient>
    <pattern id="${id}-jali" patternUnits="userSpaceOnUse" width="44" height="44">
      <path d="M22,4 L40,22 L22,40 L4,22 Z" fill="none" stroke="#a8843c" stroke-width=".7" opacity=".16"/>
      <circle cx="22" cy="22" r="2" fill="#a8843c" opacity=".14"/>
    </pattern>
    ${n ? `<pattern id="${id}-grain" patternUnits="userSpaceOnUse" width="96" height="96"><image href="${n}" width="96" height="96"/></pattern>` : ''}
    <radialGradient id="${id}-v" cx="50%" cy="45%" r="75%">
      <stop offset=".55" stop-color="#5a4320" stop-opacity="0"/><stop offset="1" stop-color="#5a4320" stop-opacity=".22"/></radialGradient>
  </defs>
  <path d="${wallD}" fill="url(#${id}-w)" fill-rule="evenodd"/>
  <path d="${wallD}" fill="url(#${id}-jali)" fill-rule="evenodd"/>
  ${n ? `<path d="${wallD}" fill="url(#${id}-grain)" fill-rule="evenodd"/>` : ''}
  ${full ? '' : `<path d="${wallD}" fill="url(#${id}-v)" fill-rule="evenodd"/>`}
  <!-- doorway reveal: a soft shadow just inside the opening edge -->
  <path d="${opening}" fill="none" stroke="rgba(70,50,20,.28)" stroke-width="5" />
  <path d="${m1}" fill="none" stroke="url(#${id}-gold)" stroke-width="1.6"/>
  <path d="${m2}" fill="none" stroke="url(#${id}-gold)" stroke-width=".9" opacity=".8"/>
  <g fill="none" stroke="url(#${id}-gold)" stroke-width="1">
    ${rosette(sx, sy, rs)}${rosette(VW - sx, sy, rs)}
  </g>
</svg>`;
}

/* ───────────────────────── door leaf (left; the right leaf is mirrored in CSS) ───────────────────────── */

export function leafSVG(g) {
  const { Aw, Ah, lw, dome, ribbonY } = g;
  const id = 'opd';
  const n = noiseURL();
  const shape = archHalfPath(Aw, Ah);
  const b = Math.max(Aw * 0.022, 7);
  const border = archHalfPath(Aw - 2 * b, Ah - b);
  const b2 = b * 1.9;
  const border2 = archHalfPath(Aw - 2 * b2, Ah - b2);
  // upper Mughal panel (a small arch of its own)
  const m = lw * 0.19;
  const pw = lw - 2 * m;
  const pTop = dome + Math.max(Aw * 0.05, 14);
  const pBot = ribbonY - g.bandH * 1.6;
  const ph = Math.max(pBot - pTop, pw * 0.6);
  const panel = archPath(pw, ph, { x: m, y: pTop });
  const panelIn = archPath(pw - 10, ph - 7, { x: m + 5, y: pTop + 6 });
  // lower panel
  const lTop = ribbonY + g.bandH * 1.6;
  const lBot = Ah - Math.max(Aw * 0.07, 22);
  const lh = Math.max(lBot - lTop, 40);
  // pull ring (near the meeting stile, the ribbon threads through it)
  const rx = lw - Math.max(lw * 0.13, 18);
  const rr = Math.max(Math.min(lw * 0.06, 15), 8);
  const ry = ribbonY - rr * 0.35;
  const rose = Math.max(Math.min(pw * 0.12, 16), 8);
  return `<svg class="op-svg" width="${r2(lw)}" height="${r2(Ah)}" viewBox="0 0 ${r2(lw)} ${r2(Ah)}" aria-hidden="true" focusable="false">
  <defs>${goldDefs(id)}
    <linearGradient id="${id}-wood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#efe4cf"/><stop offset=".55" stop-color="#f8f1e3"/><stop offset="1" stop-color="#f3e9d6"/></linearGradient>
    <linearGradient id="${id}-seam" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6b5226" stop-opacity="0"/><stop offset="1" stop-color="#6b5226" stop-opacity=".22"/></linearGradient>
    <linearGradient id="${id}-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf0" stop-opacity=".5"/><stop offset=".3" stop-color="#fffaf0" stop-opacity="0"/>
      <stop offset="1" stop-color="#8a6a35" stop-opacity=".08"/></linearGradient>
    <pattern id="${id}-lat" patternUnits="userSpaceOnUse" width="16" height="16">
      <path d="M8,0 L16,8 L8,16 L0,8 Z" fill="none" stroke="#a8843c" stroke-width=".6" opacity=".38"/></pattern>
    ${n ? `<pattern id="${id}-grain" patternUnits="userSpaceOnUse" width="96" height="96"><image href="${n}" width="96" height="96"/></pattern>` : ''}
    <clipPath id="${id}-clip"><path d="${shape}"/></clipPath>
    <clipPath id="${id}-pclip"><path d="${panelIn}"/></clipPath>
  </defs>
  <g clip-path="url(#${id}-clip)">
    <path d="${shape}" fill="url(#${id}-wood)"/>
    ${n ? `<path d="${shape}" fill="url(#${id}-grain)"/>` : ''}
    <path d="${shape}" fill="url(#${id}-top)"/>
    <rect x="${r2(lw - 14)}" y="0" width="14" height="${r2(Ah)}" fill="url(#${id}-seam)"/>
    <!-- carved panels -->
    <path d="${panelIn}" fill="url(#${id}-lat)"/>
    <g fill="none" stroke="url(#${id}-gold)">
      <path d="${border}" transform="translate(${r2(b)},${r2(b)})" stroke-width="1.5"/>
      <path d="${border2}" transform="translate(${r2(b2)},${r2(b2)})" stroke-width=".8" opacity=".75"/>
      <path d="${panel}" stroke-width="1.4"/>
      <path d="${panelIn}" stroke-width=".8" opacity=".8"/>
      <rect x="${r2(m)}" y="${r2(lTop)}" width="${r2(pw)}" height="${r2(lh)}" stroke-width="1.4"/>
      <rect x="${r2(m + 5)}" y="${r2(lTop + 5)}" width="${r2(pw - 10)}" height="${r2(lh - 10)}" stroke-width=".8" opacity=".8"/>
    </g>
    <g fill="none" stroke="url(#${id}-gold)" stroke-width="1">
      ${rosette(lw / 2, pTop + pw * 0.62, rose)}
      ${rosette(lw / 2, lTop + lh / 2, rose * 0.9)}
    </g>
    <!-- meeting stile -->
    <line x1="${r2(lw - 0.6)}" y1="0" x2="${r2(lw - 0.6)}" y2="${r2(Ah)}" stroke="url(#${id}-gold)" stroke-width="1.2"/>
  </g>
  <!-- brass ring pull -->
  <g>
    <ellipse cx="${r2(rx + 1)}" cy="${r2(ry + rr * 1.15 + 2)}" rx="${r2(rr * 0.95)}" ry="${r2(rr * 0.4)}" fill="rgba(60,40,10,.12)"/>
    <circle cx="${r2(rx)}" cy="${r2(ry)}" r="${r2(rr * 0.42)}" fill="url(#${id}-brass)"/>
    <circle cx="${r2(rx)}" cy="${r2(ry + rr)}" r="${r2(rr)}" fill="none" stroke="#7a5a26" stroke-width="${r2(rr * 0.3)}" opacity=".5" transform="translate(.8,1.2)"/>
    <circle cx="${r2(rx)}" cy="${r2(ry + rr)}" r="${r2(rr)}" fill="none" stroke="url(#${id}-brass)" stroke-width="${r2(rr * 0.26)}"/>
    <circle cx="${r2(rx - rr * 0.12)}" cy="${r2(ry - rr * 0.12)}" r="${r2(rr * 0.13)}" fill="#fff8e2" opacity=".8"/>
  </g>
</svg>`;
}

/* ───────────────────────── satin ribbon ───────────────────────── */

function satinDefs(id, horizontal = false) {
  const [x2, y2] = horizontal ? [0, 1] : [1, 0];
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">
    <stop offset="0" style="stop-color:var(--op-satin-deep)"/>
    <stop offset=".22" style="stop-color:var(--op-satin-mid)"/>
    <stop offset=".42" style="stop-color:var(--op-satin-hi)"/>
    <stop offset=".6" style="stop-color:var(--op-satin-light)"/>
    <stop offset="1" style="stop-color:var(--op-satin-shadow)"/></linearGradient>`;
}

/** One half of the band wrapped across the doors (left half; mirrored for the right). */
export function bandSVG(g) {
  const { lw, bandH } = g;
  return `<svg class="op-svg" width="${r2(lw)}" height="${bandH + 6}" viewBox="0 0 ${r2(lw)} ${bandH + 6}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>${satinDefs('opbd-s', true)}</defs>
    <rect x="0" y="${bandH + 1}" width="${r2(lw)}" height="3" fill="rgba(70,50,20,.16)"/>
    <rect x="0" y="1" width="${r2(lw)}" height="${bandH}" fill="url(#opbd-s)"/>
    <line x1="0" y1="2" x2="${r2(lw)}" y2="2" style="stroke:var(--op-satin-edge)" stroke-width=".8" opacity=".7"/>
    <line x1="0" y1="${bandH}" x2="${r2(lw)}" y2="${bandH}" style="stroke:var(--op-satin-edge)" stroke-width=".8" opacity=".7"/>
  </svg>`;
}

/** Bow pieces, each a separate tiny SVG so each can be animated on the compositor.
 *  Shared viewBox 0 0 200 170; the knot sits at (100,72). */
export function bowPieces() {
  const vb = 'viewBox="0 0 200 170"';
  const svg = (inner, defs = '') => `<svg class="op-svg" ${vb} aria-hidden="true" focusable="false"><defs>${defs}</defs>${inner}</svg>`;
  const loopL = svg(`
    <path d="M100,70 C82,44 46,16 20,26 C2,33 4,62 20,78 C38,96 72,88 100,76 Z" fill="url(#opbw-l)"/>
    <path d="M100,72 C80,62 50,52 30,58 C46,66 72,72 100,77 Z" style="fill:var(--op-satin-deep)" opacity=".55"/>
    <path d="M100,70 C82,44 46,16 20,26 C2,33 4,62 20,78 C38,96 72,88 100,76" fill="none" style="stroke:var(--op-satin-edge)" stroke-width="1"/>
    <path d="M28,34 C44,28 66,40 84,58" fill="none" stroke="#fffaf0" stroke-width="2.2" opacity=".55" stroke-linecap="round"/>`,
  satinDefs('opbw-l'));
  const loopR = svg(`
    <path d="M100,70 C118,44 154,16 180,26 C198,33 196,62 180,78 C162,96 128,88 100,76 Z" fill="url(#opbw-r)"/>
    <path d="M100,72 C120,62 150,52 170,58 C154,66 128,72 100,77 Z" style="fill:var(--op-satin-deep)" opacity=".55"/>
    <path d="M100,70 C118,44 154,16 180,26 C198,33 196,62 180,78 C162,96 128,88 100,76" fill="none" style="stroke:var(--op-satin-edge)" stroke-width="1"/>
    <path d="M172,34 C156,28 134,40 116,58" fill="none" stroke="#fffaf0" stroke-width="2.2" opacity=".45" stroke-linecap="round"/>`,
  satinDefs('opbw-r').replace('x1="0" y1="0" x2="1" y2="0"', 'x1="1" y1="0" x2="0" y2="0"'));
  const tailL = svg(`
    <path d="M96,80 C88,104 74,130 54,160 L66,152 L72,166 C86,136 98,108 106,82 Z" fill="url(#opbw-tl)"/>
    <path d="M96,80 C88,104 74,130 54,160 L66,152 L72,166 C86,136 98,108 106,82" fill="none" style="stroke:var(--op-satin-edge)" stroke-width="1"/>`,
  satinDefs('opbw-tl'));
  const tailR = svg(`
    <path d="M104,80 C112,104 126,130 146,160 L134,152 L128,166 C114,136 102,108 94,82 Z" fill="url(#opbw-tr)"/>
    <path d="M104,80 C112,104 126,130 146,160 L134,152 L128,166 C114,136 102,108 94,82" fill="none" style="stroke:var(--op-satin-edge)" stroke-width="1"/>`,
  satinDefs('opbw-tr'));
  const knot = svg(`
    <ellipse cx="100" cy="86" rx="16" ry="5" fill="rgba(60,40,10,.18)"/>
    <rect x="88" y="60" width="24" height="25" rx="8" fill="url(#opbw-k)"/>
    <rect x="88" y="60" width="24" height="25" rx="8" fill="none" style="stroke:var(--op-satin-edge)" stroke-width="1"/>
    <path d="M93,64 C97,70 97,76 93,82 M107,64 C103,70 103,76 107,82" fill="none" style="stroke:var(--op-satin-deep)" stroke-width="1" opacity=".55"/>
    <path d="M96,63 C99,62 102,62 104,63" fill="none" stroke="#fffaf0" stroke-width="1.6" opacity=".6" stroke-linecap="round"/>`,
  satinDefs('opbw-k'));
  return { loopL, loopR, tailL, tailR, knot };
}

/** A single rose petal (ivory with a warm blush), ~ 20×24. */
export function petalSVG(i) {
  const id = `oppt${i}`;
  return `<svg class="op-svg" viewBox="0 0 20 24" aria-hidden="true" focusable="false">
    <defs><radialGradient id="${id}" cx="45%" cy="35%" r="70%">
      <stop offset="0" stop-color="#fffdf8"/><stop offset=".65" stop-color="#f6ecdc"/><stop offset="1" stop-color="#e2cda6"/></radialGradient></defs>
    <path d="M10,23 C3,19 0,12 2,6 C4,1 9,0 10,4 C11,0 16,1 18,6 C20,12 17,19 10,23 Z" fill="url(#${id})"/>
    <path d="M10,22 C9,16 9.5,10 10,5" fill="none" stroke="#d8c39b" stroke-width=".5" opacity=".7"/>
  </svg>`;
}
