// Opening animation — envelope art (paper, embossed florals, gold foil, wax seal).
// Pure string builders: every function returns SVG markup sized in CSS px for the current viewport,
// so the opening can rebuild them on resize. No images: paper grain is a tiny canvas-generated tile.

const r2 = (n) => Math.round(n * 100) / 100;
const P = (x, y) => `${r2(x)},${r2(y)}`;

/** Deterministic PRNG so the seal & florals look identical on every visit. */
export function rng(seed = 7) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let noiseCache = null;
/** 96×96 grain tile (data: URL). Generated once; ~6 KB. */
export function noiseURL() {
  if (noiseCache) return noiseCache;
  try {
    const n = 96, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n), rnd = rng(11);
    for (let i = 0; i < n * n; i++) {
      const v = rnd(), dark = v < 0.5;
      img.data[i * 4] = dark ? 96 : 255;
      img.data[i * 4 + 1] = dark ? 74 : 252;
      img.data[i * 4 + 2] = dark ? 40 : 240;
      img.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 30);
    }
    g.putImageData(img, 0, 0);
    // a few longer "fibres"
    const r = rng(5);
    g.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = i % 2 ? 'rgba(255,253,245,0.35)' : 'rgba(120,95,55,0.10)';
      g.lineWidth = 0.6;
      const x = r() * n, y = r() * n, a = r() * Math.PI, l = 3 + r() * 7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    noiseCache = c.toDataURL('image/png');
  } catch { noiseCache = ''; }
  return noiseCache;
}

/* ───────────────────────── geometry ───────────────────────── */

/** Envelope placement for a VW×VH viewport. Portrait screens get a full-bleed envelope (like the reference),
 *  landscape screens a classic landscape envelope resting on a linen surround. All values in px. */
export function envelopeGeometry(VW, VH) {
  const portrait = VW / VH < 0.8;
  let W, H, ex, ey, tip, hole;
  if (portrait) {
    W = VW; H = VH; ex = 0; ey = 0;
    tip = H * 0.45;           // flap tip (relative to envelope top)
    hole = H * 0.405;         // depth of the pocket's V mouth
  } else if (VH < 520) {
    // short landscape phones: as big as fits below the language switcher (≈ 62 px)
    const top = 62, bottom = 14;
    H = Math.min(VH - top - bottom, (VW * 0.8) / 1.42);
    W = H * 1.42;
    ex = (VW - W) / 2;
    ey = top + Math.max((VH - top - bottom - H) / 2, 0);
    tip = H * 0.44;
    hole = H * 0.4;
  } else {
    W = Math.min(VW * 0.8, VH * 0.7 * 1.42, 1040);
    H = W / 1.42;
    ex = (VW - W) / 2;
    ey = Math.max((VH - H) / 2 + VH * 0.035, 8);
    tip = H * 0.5;
    hole = H * 0.45;
  }
  const minSide = Math.min(W, H);
  const seal = Math.round(Math.min(Math.max(minSide * (portrait ? 0.27 : 0.2), portrait || H > 420 ? 84 : 60), 136));
  return { VW, VH, portrait, W, H, ex, ey, cx: ex + W / 2, tip, hole, seal };
}

/** Flap outline in flap-local coords (0,0 = top-left of envelope). */
export function flapPath(W, tip, inset = 0) {
  const r = W * 0.035;
  const i = inset;
  const yT = tip - i * 1.6;
  return [
    `M${P(i * 1.2, i)}`, `L${P(W - i * 1.2, i)}`,
    `C${P(W * 0.74 - i, tip * 0.42)} ${P(W * 0.6 - i * 0.6, yT * 0.86)} ${P(W / 2 + r, yT - r * 0.55)}`,
    `Q${P(W / 2, yT + r * 0.25)} ${P(W / 2 - r, yT - r * 0.55)}`,
    `C${P(W * 0.4 + i * 0.6, yT * 0.86)} ${P(W * 0.26 + i, tip * 0.42)} ${P(i * 1.2, i)}`,
    'Z',
  ].join(' ');
}

/** The pocket's V mouth (the "hole" we dive into), absolute coords. */
export function holePath(g) {
  const { ex, ey, W, hole, cx } = g;
  const y = ey + hole;
  return [
    `M${P(ex, ey)}`, `L${P(ex + W, ey)}`,
    `C${P(ex + W * 0.76, ey + hole * 0.4)} ${P(ex + W * 0.6, ey + hole * 0.86)} ${P(cx, y)}`,
    `C${P(ex + W * 0.4, ey + hole * 0.86)} ${P(ex + W * 0.24, ey + hole * 0.4)} ${P(ex, ey)}`,
    'Z',
  ].join(' ');
}

/** Conservative triangle inside the hole — used to compute how far the dive must zoom. */
export function holeTriangle(g) {
  return [[g.ex, g.ey], [g.ex + g.W, g.ey], [g.cx, g.ey + g.hole]];
}

/* ───────────────────────── florals (blind emboss) ───────────────────────── */

function rose(cx, cy, r, rot = 0) {
  const d = [];
  const pt = (a, rr) => P(cx + Math.cos(a + rot) * rr, cy + Math.sin(a + rot) * rr);
  // centre swirl
  d.push(`M${pt(0, r * 0.12)} Q${pt(1.6, r * 0.3)} ${pt(3.1, r * 0.16)} Q${pt(4.4, r * 0.05)} ${pt(5.6, r * 0.26)}`);
  // inner petals
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    d.push(`M${pt(a - 0.9, r * 0.38)} Q${pt(a, r * 0.66)} ${pt(a + 0.9, r * 0.38)}`);
  }
  // outer petals
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    d.push(`M${pt(a - 0.62, r * 0.78)} Q${pt(a, r * 1.12)} ${pt(a + 0.62, r * 0.78)}`);
  }
  return d.join(' ');
}

function leaf(x, y, len, ang, w = 0.32) {
  const tx = x + Math.cos(ang) * len, ty = y + Math.sin(ang) * len;
  const mx = x + Math.cos(ang) * len * 0.5, my = y + Math.sin(ang) * len * 0.5;
  const nx = -Math.sin(ang) * len * w, ny = Math.cos(ang) * len * w;
  return `M${P(x, y)} Q${P(mx + nx, my + ny)} ${P(tx, ty)} Q${P(mx - nx, my - ny)} ${P(x, y)} ` +
    `M${P(x, y)} L${P(x + Math.cos(ang) * len * 0.78, y + Math.sin(ang) * len * 0.78)}`;
}

function blossom(x, y, r) {
  const d = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    d.push(`M${P(px - r * 0.4, py)} a${r2(r * 0.4)},${r2(r * 0.4)} 0 1,0 ${r2(r * 0.8)},0 a${r2(r * 0.4)},${r2(r * 0.4)} 0 1,0 ${r2(-r * 0.8)},0`);
  }
  return d.join(' ');
}

/** A trailing rose sprig, ~ 260×200 units, growing from (0,0) toward +x/+y. */
export function sprigPath(seed = 3) {
  const rnd = rng(seed);
  const d = [];
  d.push('M0,0 C60,10 90,60 150,70 C190,76 220,110 250,150');
  d.push('M90,40 C100,12 128,2 150,-6');
  d.push('M170,80 C160,110 170,140 160,175');
  d.push(rose(150, 70, 26, 0.3));
  d.push(rose(250, 150, 18, 1.2));
  d.push(rose(150, -10, 13, 2.2));
  const leaves = [[40, 10, 34, 2.0], [60, 30, 30, -0.7], [110, 56, 32, 1.8], [118, 30, 26, -1.2], [200, 98, 30, -0.4],
    [214, 118, 28, 2.4], [165, 120, 26, 0.3], [160, 150, 24, 2.6]];
  leaves.forEach(([x, y, l, a]) => d.push(leaf(x, y, l * (0.9 + rnd() * 0.2), a)));
  [[30, -14, 4], [16, 22, 3.5], [196, 62, 4], [236, 112, 3], [128, 104, 3.5], [174, 186, 4]]
    .forEach(([x, y, r]) => d.push(blossom(x, y, r)));
  return d.join(' ');
}

/** Embossed group: shadow + highlight + faint body — reads as blind embossing on paper. */
function emboss(d, transform, scale = 1) {
  const sw = r2(1.25 / scale);
  return `<g transform="${transform}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${d}" stroke="rgba(255,255,250,.95)" stroke-width="${sw}" transform="translate(${r2(-0.9 / scale)},${r2(-0.9 / scale)})"/>
    <path d="${d}" stroke="rgba(120,92,48,.22)" stroke-width="${sw}" transform="translate(${r2(0.9 / scale)},${r2(1 / scale)})"/>
    <path d="${d}" stroke="rgba(176,146,96,.12)" stroke-width="${r2(sw * 1.3)}"/>
  </g>`;
}

/* ───────────────────────── shared defs ───────────────────────── */

function paperDefs(id, tint = '#f8f2e6') {
  const n = noiseURL();
  return `
    <linearGradient id="${id}-paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbf7ee"/><stop offset=".55" stop-color="${tint}"/><stop offset="1" stop-color="#efe5d2"/>
    </linearGradient>
    <linearGradient id="${id}-foil" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#b8924a"/><stop offset=".3" stop-color="#e3c987"/><stop offset=".5" stop-color="#a8843c"/>
      <stop offset=".72" stop-color="#e8d398"/><stop offset="1" stop-color="#9c7a36"/>
    </linearGradient>
    ${n ? `<pattern id="${id}-grain" patternUnits="userSpaceOnUse" width="96" height="96"><image href="${n}" width="96" height="96"/></pattern>` : ''}
    <pattern id="${id}-laid" patternUnits="userSpaceOnUse" width="34" height="4">
      <rect width="34" height="1" y="1.5" fill="rgba(150,120,70,.045)"/>
      <rect width="1" height="4" x="0" fill="rgba(150,120,70,.03)"/>
    </pattern>`;
}

function paperFill(id, d, extra = '') {
  return `<path d="${d}" fill="url(#${id}-paper)" ${extra}/>
    <path d="${d}" fill="url(#${id}-laid)"/>
    ${noiseURL() ? `<path d="${d}" fill="url(#${id}-grain)"/>` : ''}`;
}

/* ───────────────────────── envelope body ───────────────────────── */

/** Everything that stays put: linen surround (landscape), the envelope back with the V mouth cut out,
 *  pocket seams, foil edge and embossed florals. Viewport-sized SVG. */
export function bodySVG(g) {
  const { VW, VH, W, H, ex, ey, cx, hole, portrait } = g;
  const id = 'opb';
  const env = `M${P(ex, ey)} H${r2(ex + W)} V${r2(ey + H)} H${r2(ex)} Z`;
  const holeD = holePath(g);
  const bodyD = `${env} ${holeD}`;
  const surroundD = `M0,0 H${VW} V${VH} H0 Z ${env}`;
  const by = ey + (portrait ? H * 0.6 : g.tip + g.seal * 0.12);   // bottom flap apex (tucked under the seal on wide screens)
  const seam = `M${P(ex, ey + H)} C${P(ex + W * 0.22, ey + H * 0.82)} ${P(cx - W * 0.18, by + H * 0.02)} ${P(cx, by)} ` +
    `C${P(cx + W * 0.18, by + H * 0.02)} ${P(ex + W * 0.78, ey + H * 0.82)} ${P(ex + W, ey + H)}`;
  const lower = `${seam} Z`;
  const fi = Math.max(W * 0.016, 6);            // foil border inset
  const s = Math.min(W, H) / 520;               // floral scale
  const shadowBlur = portrait ? 0 : Math.max(W * 0.012, 6);
  return `<svg class="op-svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false">
  <defs>${paperDefs(id)}
    <linearGradient id="${id}-lower" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffdf7" stop-opacity=".55"/><stop offset="1" stop-color="#fffdf7" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="${id}-linen" cx="50%" cy="42%" r="75%">
      <stop offset="0" stop-color="#e7dcc7"/><stop offset=".6" stop-color="#d5c5a8"/><stop offset="1" stop-color="#bba886"/>
    </radialGradient>
    ${shadowBlur ? `<filter id="${id}-sh" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="${r2(shadowBlur)}"/></filter>` : ''}
    <clipPath id="${id}-clip"><path d="${bodyD}" clip-rule="evenodd"/></clipPath>
    <clipPath id="${id}-out"><path d="M0,0 H${VW} V${VH} H0 Z ${holeD}" clip-rule="evenodd"/></clipPath>
  </defs>
  ${portrait ? '' : `<path d="${surroundD}" fill="url(#${id}-linen)" fill-rule="evenodd"/>
    ${noiseURL() ? `<path d="${surroundD}" fill="url(#${id}-grain)" fill-rule="evenodd" opacity=".9"/>` : ''}
    <path d="M${P(ex + 6, ey + 14)} H${r2(ex + W - 6)} V${r2(ey + H + shadowBlur * 1.6)} H${r2(ex + 6)} Z" fill="rgba(70,50,20,.32)" filter="url(#${id}-sh)" clip-path="url(#${id}-out)"/>`}
  <g clip-path="url(#${id}-clip)">
    ${paperFill(id, env)}
    <path d="${lower}" fill="url(#${id}-lower)"/>
    ${emboss(sprigPath(4), `translate(${r2(ex + W - 40 * s)},${r2(ey + H - 30 * s)}) rotate(180) scale(${r2(s * 1.05)})`, s)}
    ${emboss(sprigPath(9), `translate(${r2(ex + 34 * s)},${r2(ey + H - 20 * s)}) rotate(-62) scale(${r2(s * 0.8)})`, s)}
    <path d="${seam}" fill="none" stroke="rgba(255,255,250,.9)" stroke-width="1.4" transform="translate(0,-1)"/>
    <path d="${seam}" fill="none" stroke="rgba(120,90,45,.2)" stroke-width="1.2" transform="translate(0,.8)"/>
    <rect x="${r2(ex + fi)}" y="${r2(ey + fi)}" width="${r2(W - 2 * fi)}" height="${r2(H - 2 * fi)}" fill="none"
      stroke="url(#${id}-foil)" stroke-width="1.1" opacity=".75" ${portrait ? `rx="${r2(fi)}"` : ''}/>
  </g>
  <!-- the pocket mouth: paper edge + foil line -->
  <path d="${holeD}" fill="none" stroke="rgba(110,82,40,.28)" stroke-width="2.4"/>
  <path d="${holeD}" fill="none" stroke="#fffaf0" stroke-width="1.1" transform="translate(0,1.2)"/>
</svg>`;
}

/** Soft interior darkness inside the V mouth — "inside the envelope". Fades out as we dive. */
export function shadeSVG(g) {
  const { VW, VH, cx, ey, hole } = g;
  return `<svg class="op-svg" width="${VW}" height="${VH}" viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false">
    <defs><radialGradient id="ops-g" cx="${r2(cx)}" cy="${r2(ey + hole * 0.35)}" r="${r2(Math.max(g.W * 0.55, hole))}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#3a2a12" stop-opacity="0"/><stop offset=".55" stop-color="#3a2a12" stop-opacity=".08"/>
      <stop offset="1" stop-color="#2a1d0a" stop-opacity=".34"/></radialGradient></defs>
    <path d="${holePath(g)}" fill="url(#ops-g)"/>
  </svg>`;
}

/** Shadow the closed flap casts on the pocket. */
export function flapShadowSVG(g) {
  const { W, tip } = g;
  const h = tip + 30;
  return `<svg class="op-svg" width="${r2(W)}" height="${r2(h)}" viewBox="0 0 ${r2(W)} ${r2(h)}" aria-hidden="true" focusable="false" style="overflow:visible">
    <defs><filter id="opfs-b" x="-5%" y="-5%" width="110%" height="120%"><feGaussianBlur stdDeviation="${r2(Math.max(W * 0.006, 2.5))}"/></filter></defs>
    <path d="${flapPath(W, tip)}" fill="rgba(80,55,20,.26)" transform="translate(0,${r2(Math.max(W * 0.004, 2))})" filter="url(#opfs-b)"/>
  </svg>`;
}

/* ───────────────────────── flap ───────────────────────── */

export function flapFrontSVG(g) {
  const { W, tip } = g;
  const id = 'opf';
  const d = flapPath(W, tip);
  const fi = Math.max(W * 0.022, 9);
  const s = Math.min(W, g.H) / 520;
  return `<svg class="op-svg" width="${r2(W)}" height="${r2(tip + 2)}" viewBox="0 0 ${r2(W)} ${r2(tip + 2)}" aria-hidden="true" focusable="false">
  <defs>${paperDefs(id, '#f7f0e2')}
    <linearGradient id="${id}-lit" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffdf6" stop-opacity="0"/><stop offset=".85" stop-color="#fffdf6" stop-opacity=".35"/>
      <stop offset="1" stop-color="#d9c8a6" stop-opacity=".35"/></linearGradient>
    <clipPath id="${id}-clip"><path d="${d}"/></clipPath>
  </defs>
  <g clip-path="url(#${id}-clip)">
    ${paperFill(id, d)}
    <path d="${d}" fill="url(#${id}-lit)"/>
    ${emboss(sprigPath(3), `translate(${r2(20 * s)},${r2(18 * s)}) scale(${r2(s * 1.1)})`, s)}
    ${emboss(sprigPath(6), `translate(${r2(W - 20 * s)},${r2(18 * s)}) scale(${r2(-s * 0.95)},${r2(s * 0.95)})`, s)}
  </g>
  <path d="${flapPath(W, tip, fi)}" fill="none" stroke="url(#${id}-foil)" stroke-width="1.2"/>
  <path d="${d}" fill="none" stroke="rgba(255,255,250,.85)" stroke-width="1"/>
</svg>`;
}

/** Inside of the flap: a gold damask liner (seen when the flap stands open on wide screens). */
export function flapBackSVG(g) {
  const { W, tip } = g;
  const id = 'opl';
  const d = flapPath(W, tip);
  return `<svg class="op-svg" width="${r2(W)}" height="${r2(tip + 2)}" viewBox="0 0 ${r2(W)} ${r2(tip + 2)}" aria-hidden="true" focusable="false">
  <defs>${paperDefs(id, '#efe4cc')}
    <pattern id="${id}-dm" patternUnits="userSpaceOnUse" width="36" height="36">
      <path d="M18,8 C21,13 23,15 28,18 C23,21 21,23 18,28 C15,23 13,21 8,18 C13,15 15,13 18,8 Z" fill="none" stroke="#b8975a" stroke-width=".8" opacity=".55"/>
      <circle cx="18" cy="18" r="1.6" fill="#b8975a" opacity=".5"/>
      <circle cx="0" cy="0" r="1.2" fill="#b8975a" opacity=".4"/><circle cx="36" cy="0" r="1.2" fill="#b8975a" opacity=".4"/>
      <circle cx="0" cy="36" r="1.2" fill="#b8975a" opacity=".4"/><circle cx="36" cy="36" r="1.2" fill="#b8975a" opacity=".4"/>
    </pattern>
    <clipPath id="${id}-clip"><path d="${d}"/></clipPath>
  </defs>
  <g clip-path="url(#${id}-clip)">
    ${paperFill(id, d)}
    <path d="${d}" fill="url(#${id}-dm)"/>
  </g>
  <path d="${flapPath(W, tip, Math.max(W * 0.02, 8))}" fill="none" stroke="url(#${id}-foil)" stroke-width="1.4"/>
</svg>`;
}

/* ───────────────────────── wax seal ───────────────────────── */

function smoothClosed(pts) {
  const n = pts.length, k = 1 / 6;
  let d = `M${P(...pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${P(p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k)} ${P(p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k)} ${P(...p2)}`;
  }
  return `${d} Z`;
}

/** Irregular poured-wax outline around (0,0), radius ≈ R. */
export function waxOutline(R = 50, seed = 21) {
  const rnd = rng(seed), N = 56, pts = [];
  const drips = [[0.55, 0.13, 0.22], [2.35, 0.1, 0.18], [3.9, 0.15, 0.2], [5.25, 0.09, 0.16], [1.5, 0.05, 0.3]];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    let r = 1 + 0.022 * Math.sin(3 * a + 1.1) + 0.016 * Math.sin(7 * a + 0.4) + (rnd() - 0.5) * 0.018;
    drips.forEach(([c, amp, w]) => {
      let da = Math.abs(a - c); da = Math.min(da, Math.PI * 2 - da);
      r += amp * Math.exp(-(da * da) / (2 * w * w * 0.25));
    });
    pts.push([Math.cos(a) * R * r * 0.9, Math.sin(a) * R * r * 0.9]);
  }
  return smoothClosed(pts);
}

export function sealSVG() {
  const id = 'opw';
  const outline = waxOutline(50);
  // laurel dots ring
  const dots = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return `<circle cx="${r2(Math.cos(a) * 29.5)}" cy="${r2(Math.sin(a) * 29.5)}" r="${i % 2 ? 0.7 : 1.05}"/>`;
  }).join('');
  const mono = (fill, dx, dy, op = 1) => `<text x="${dx}" y="${dy + 1}" text-anchor="middle" dominant-baseline="middle" fill="${fill}" opacity="${op}"
      font-family="'Pinyon Script', 'Great Vibes', cursive" font-size="25"><tspan>A</tspan><tspan font-size="15" dx="1" dy="-1">&amp;</tspan><tspan dx="1" dy="1">S</tspan></text>`;
  return `<svg class="op-seal__svg" viewBox="-60 -60 120 120" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${id}-wax" cx="40%" cy="34%" r="70%">
      <stop offset="0" stop-color="#f6ecd3"/><stop offset=".45" stop-color="#e4d0a0"/>
      <stop offset=".8" stop-color="#c9ab6d"/><stop offset="1" stop-color="#a4854b"/></radialGradient>
    <radialGradient id="${id}-rim" cx="50%" cy="50%" r="50%">
      <stop offset=".72" stop-color="#5a3e14" stop-opacity="0"/><stop offset="1" stop-color="#5a3e14" stop-opacity=".38"/></radialGradient>
    <radialGradient id="${id}-disc" cx="58%" cy="62%" r="62%">
      <stop offset="0" stop-color="#eadbb5"/><stop offset=".7" stop-color="#d9c290"/><stop offset="1" stop-color="#c6a96c"/></radialGradient>
    <radialGradient id="${id}-gloss" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <path d="${outline}" fill="url(#${id}-wax)"/>
  <path d="${outline}" fill="url(#${id}-rim)"/>
  <path d="${outline}" fill="none" stroke="rgba(255,248,230,.6)" stroke-width=".8" transform="translate(-.6,-.8)"/>
  <!-- pressed disc: shadowed top-left inner wall, lit bottom-right -->
  <circle r="35.5" fill="#b8975b" opacity=".55"/>
  <circle r="34" fill="url(#${id}-disc)"/>
  <circle r="34" fill="none" stroke="rgba(92,64,22,.45)" stroke-width="1.6" transform="translate(-.7,-.9)"/>
  <circle r="34.6" fill="none" stroke="rgba(255,250,236,.75)" stroke-width="1" transform="translate(.8,1)"/>
  <g fill="#9c7c42" opacity=".7">${dots}</g>
  ${mono('rgba(255,250,235,.85)', 0.8, 0.9)}
  ${mono('rgba(84,58,20,.55)', -0.6, -0.7)}
  ${mono('#b69454', 0, 0)}
  <ellipse cx="-18" cy="-24" rx="15" ry="7.5" transform="rotate(-32 -18 -24)" fill="url(#${id}-gloss)" opacity=".7"/>
  <ellipse cx="22" cy="27" rx="7" ry="3" transform="rotate(-38 22 27)" fill="url(#${id}-gloss)" opacity=".35"/>
</svg>`;
}
