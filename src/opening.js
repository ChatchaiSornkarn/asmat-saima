// Opening animation (Q4, Q24): envelope with wax seal → tap → seal lifts, flap opens → dive into the envelope →
// the Postcard's arched doors tied with a satin bow → bow unties → doors swing open → the real Postcard behind.
//
// Contract: mountOpening(el, config): Promise<void> — resolves when the card is visible enough to interact with
// (doors mostly open); the overlay then fades and removes itself. ?open=1 skips it. prefers-reduced-motion gets a
// 400 ms cross-fade after the tap. Everything animates transform/opacity only (Web Animations API).
import { t, applyTranslations, onLangChange } from './i18n/index.js';
import {
  envelopeGeometry, bodySVG, shadeSVG, flapShadowSVG, flapFrontSVG, flapBackSVG, sealSVG, holeTriangle,
} from './art/opening-envelope.js';
import { archHalfPath } from './art/arch.js';
import { doorGeometry, wallSVG, leafSVG, bandSVG, bowPieces, petalSVG } from './art/opening-doors.js';

const SAFETY_MS = 7000;      // after the tap, the page is revealed no matter what
const FONT_WAIT_MS = 1500;   // never wait longer than this for the script font
const PETALS = 12;

// Timeline (ms after the tap)
const T = {
  press: 0,         // seal pressed in
  lift: 110,        // seal lifts off the paper
  flap: 360,        // flap peels, then swings up (950 ms)
  flapDur: 950,
  dive: 950,        // camera dives into the envelope (1250 ms)
  diveDur: 1250,
  tug: 2120,        // bow tightens (anticipation)
  untie: 2330,      // loops collapse, tails fall
  open: 2780,       // doors unlatch & swing (1250 ms)
  openDur: 1250,
  reveal: 2900,     // promise resolves as the doors part → the Postcard's own entrance plays behind them
  fade: 3420,       // doors/wall fade out (620 ms)
  fadeDur: 620,
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function mountOpening(el, config = {}) { // eslint-disable-line no-unused-vars
  return new Promise((resolve) => {
    if (!el) { resolve(); return; }
    let skip = false;
    try { skip = new URLSearchParams(location.search).get('open') === '1'; } catch { /* ignore */ }
    if (skip) { el.remove(); resolve(); return; }
    const op = new Opening(el, resolve);
    try { op.mount(); } catch (err) { console.error('[opening]', err); op.bail(); }
  });
}

class Opening {
  constructor(el, resolve) {
    this.el = el;
    this.resolveFn = resolve;
    this.state = 'closed';
    this.resolved = false;
    this.anims = [];
    this.timers = [];
    this.cleanups = [];
  }

  /* ───────────── lifecycle ───────────── */

  mount() {
    const { el } = this;
    el.classList.add('opening');
    el.innerHTML = this.template();
    this.q = (s) => el.querySelector(s);
    this.parts = {
      backdrop: this.q('.op-backdrop'), scene: this.q('.op-scene'), wall: this.q('.op-wall'), glow: this.q('.op-glow'),
      leafL: this.q('.op-leaf--l'), leafR: this.q('.op-leaf--r'), bow: this.q('.op-bow'), petals: this.q('.op-petals'),
      stage: this.q('.op-stage'), env: this.q('.op-env'), body: this.q('.op-body'), shade: this.q('.op-shade'),
      flapShadow: this.q('.op-flapshadow'), flap: this.q('.op-flap'), front: this.q('.op-flap__front'),
      back: this.q('.op-flap__back'), sealWrap: this.q('.op-sealwrap'), seal: this.q('.op-seal'),
      sealArt: this.q('.op-seal__art'), sealShadow: this.q('.op-seal__shadow'), halo: this.q('.op-seal__halo'),
      text: this.q('.op-text'), prompt: this.q('.op-prompt'), skip: this.q('.op-skip'),
    };
    const p = this.parts;
    p.sealArt.innerHTML = sealSVG();
    const bow = bowPieces();
    for (const k of ['tailL', 'tailR', 'loopL', 'loopR', 'knot']) this.q(`.op-bow__${k}`).innerHTML = bow[k];

    applyTranslations(el);
    this.layout();
    el.classList.add('op-built');

    // lock page scroll behind the overlay; start from the top of the page
    this.prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    try { window.scrollTo(0, 0); } catch { /* ignore */ }

    // input
    const onStage = (e) => { e.preventDefault(); this.start(); };
    const onDown = () => { if (this.state === 'closed') p.seal.classList.add('is-pressed'); };
    const onUp = () => p.seal.classList.remove('is-pressed');
    p.stage.addEventListener('click', onStage);
    p.stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    p.skip.addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    this.cleanups.push(() => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    });

    // language switches while the envelope is closed
    const off = onLangChange(() => applyTranslations(el));
    this.cleanups.push(off);

    // keep the geometry right on rotate / resize
    let lastW = el.clientWidth, lastH = el.clientHeight, rt = 0;
    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (this.state === 'closed') {
        clearTimeout(rt);
        rt = setTimeout(() => { if (this.state === 'closed') this.layout(); }, 90);
      } else if (this.state === 'playing' && (Math.abs(w - lastW) > 40 || Math.abs(h - lastH) > h * 0.25)) {
        this.skip();
      }
      lastW = w; lastH = h;
    };
    window.addEventListener('resize', onResize);
    this.cleanups.push(() => { window.removeEventListener('resize', onResize); clearTimeout(rt); });

    // entrance: paper settles in; text waits for the script font (max 1.5 s)
    if (!reducedMotion()) {
      p.stage.animate(
        [{ opacity: 0, transform: 'translateY(1.2%) scale(.985)' }, { opacity: 1, transform: 'none' }],
        { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)' },
      );
    }
    this.fontsReady().then(() => el.classList.add('op-fonts'));

    try { p.seal.focus({ preventScroll: true }); } catch { /* ignore */ }
  }

  fontsReady() {
    if (!document.fonts?.load) return Promise.resolve();
    const all = Promise.all([
      document.fonts.load('400 1em "Pinyon Script"'),
      document.fonts.load('italic 400 1em "Cormorant Garamond"'),
    ]).catch(() => {});
    return Promise.race([all, wait(FONT_WAIT_MS)]);
  }

  template() {
    const leaf = (side) => `
      <div class="op-leaf op-leaf--${side}">
        <div class="op-leaf__art"></div>
        <div class="op-band"></div>
        <div class="op-leaf__shade"></div>
      </div>`;
    return `
      <h2 id="opening-title" class="op-vh">Asmat &amp; Saima — <span data-i18n="opening.envelopeLine">${t('opening.envelopeLine')}</span></h2>
      <div class="op-backdrop" aria-hidden="true"></div>
      <div class="op-scene" aria-hidden="true">
        <div class="op-glow"></div>
        ${leaf('l')}${leaf('r')}
        <div class="op-wall"></div>
        <div class="op-bow">
          <div class="op-bow__p op-bow__tailL"></div><div class="op-bow__p op-bow__tailR"></div>
          <div class="op-bow__p op-bow__loopL"></div><div class="op-bow__p op-bow__loopR"></div>
          <div class="op-bow__p op-bow__knot"></div>
        </div>
      </div>
      <div class="op-petals" aria-hidden="true"></div>
      <div class="op-stage">
        <div class="op-env">
          <div class="op-body" aria-hidden="true"></div>
          <div class="op-shade" aria-hidden="true"></div>
          <div class="op-flapshadow" aria-hidden="true"></div>
          <div class="op-text" aria-hidden="true">
            <p class="op-names">Asmat <span class="op-amp">&amp;</span> Saima</p>
            <span class="op-rule"></span>
            <p class="op-line" data-i18n="opening.envelopeLine">${t('opening.envelopeLine')}</p>
          </div>
          <p class="op-prompt" aria-hidden="true"><span data-i18n="opening.tapToOpen">${t('opening.tapToOpen')}</span></p>
          <div class="op-flap">
            <div class="op-flap__face op-flap__back" aria-hidden="true"></div>
            <div class="op-flap__face op-flap__front">
              <div class="op-flap__art" aria-hidden="true"></div>
              <div class="op-flap__tint" aria-hidden="true"></div>
              <div class="op-sealwrap">
                <span class="op-seal__halo" aria-hidden="true"></span>
                <button class="op-seal" type="button" data-i18n-attr="aria-label:opening.ariaOpen" aria-label="${t('opening.ariaOpen')}">
                  <span class="op-seal__shadow" aria-hidden="true"></span>
                  <span class="op-seal__art" aria-hidden="true"></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <button class="op-skip" type="button" data-i18n="opening.skip" hidden>${t('opening.skip')}</button>`;
  }

  /** Compute geometry for the current viewport and (re)draw every SVG. */
  layout() {
    const { el, parts: p } = this;
    const VW = el.clientWidth || window.innerWidth, VH = el.clientHeight || window.innerHeight;
    const g = envelopeGeometry(VW, VH);
    const d = doorGeometry(VW, VH);
    this.g = g; this.d = d;

    // ── envelope
    p.body.innerHTML = bodySVG(g);
    p.shade.innerHTML = shadeSVG(g);
    p.flapShadow.innerHTML = flapShadowSVG(g);
    this.q('.op-flap__art').innerHTML = flapFrontSVG(g);
    p.back.innerHTML = flapBackSVG(g);
    const px = (n) => `${Math.round(n * 100) / 100}px`;
    Object.assign(p.flap.style, { left: px(g.ex), top: px(g.ey), width: px(g.W), height: px(g.tip + 2) });
    Object.assign(p.flapShadow.style, { left: px(g.ex), top: px(g.ey) });
    Object.assign(p.sealWrap.style, {
      left: px(g.W / 2 - g.seal / 2), top: px(g.tip - g.seal * 0.56), width: px(g.seal), height: px(g.seal),
    });
    const textTop = g.ey + g.tip + g.seal * 0.5 + Math.max(g.seal * (g.portrait ? 0.5 : 0.34), g.H > 420 ? 36 : 24);
    const textBot = g.ey + g.H - Math.max(g.H * (g.portrait ? 0.07 : 0.045), g.H > 420 ? 20 : 12);
    const textH = Math.max(textBot - textTop, 48);
    const compact = textH < 110;   // short landscape phones: tighter type, no rule
    el.classList.toggle('op-compact', compact);
    Object.assign(p.text.style, { left: px(g.ex), width: px(g.W), top: px(textTop), height: px(textH) });
    // names fill the pocket but never crowd the seal prompt or the foil edge
    const namesFs = Math.max(Math.min(g.W * (g.portrait ? 0.125 : 0.088), textH * 0.46, 96), compact ? 24 : 34);
    el.style.setProperty('--op-names-fs', px(namesFs));
    el.style.setProperty('--op-line-fs', px(Math.max(Math.min(namesFs * 0.34, 27), compact ? 14 : 16.5)));
    Object.assign(p.prompt.style, { left: px(g.ex), width: px(g.W), top: px(g.ey + g.tip + g.seal * 0.5 + 8) });
    el.style.setProperty('--op-env-w', px(g.W));
    el.style.setProperty('--op-env-h', px(g.H));
    el.style.setProperty('--op-seal', px(g.seal));
    p.env.style.perspective = px(Math.max(g.H * 1.6, 1100));
    p.env.style.perspectiveOrigin = `${px(g.cx)} ${px(g.ey)}`;

    // ── doors
    p.wall.innerHTML = wallSVG(d);
    const leaf = leafSVG(d);
    p.leafL.querySelector('.op-leaf__art').innerHTML = leaf;
    p.leafR.querySelector('.op-leaf__art').innerHTML = leaf.replaceAll('opd-', 'opdR-');
    const band = bandSVG(d);
    p.leafL.querySelector('.op-band').innerHTML = band;
    p.leafR.querySelector('.op-band').innerHTML = band.replaceAll('opbd-', 'opbdR-');
    for (const [leafEl, left] of [[p.leafL, d.x0], [p.leafR, d.x0 + d.lw]]) {
      Object.assign(leafEl.style, { left: px(left), top: px(d.y0), width: px(d.lw), height: px(d.Ah) });
      leafEl.querySelector('.op-leaf__shade').style.clipPath = `path('${archHalfPath(d.Aw, d.Ah)}')`;
      Object.assign(leafEl.querySelector('.op-band').style, { top: px(d.ribbonY - d.bandH / 2 - 1), height: px(d.bandH + 6) });
    }
    const bowH = d.bowW * 0.85;
    Object.assign(p.bow.style, {
      width: px(d.bowW), height: px(bowH),
      left: px(d.x0 + d.lw - d.bowW / 2), top: px(d.y0 + d.ribbonY - bowH * (72 / 170)),
    });
    Object.assign(p.glow.style, { left: px(d.x0), top: px(d.y0), width: px(d.Aw), height: px(d.Ah) });
    p.scene.style.perspective = px(Math.max(d.Aw * 2.1, 900));
    p.scene.style.perspectiveOrigin = `${px(VW / 2)} ${px(d.y0 + d.ribbonY)}`;

    // ── dive: zoom origin O inside the V mouth, start scale s0 of the door scene seen through it
    const s0 = Math.min(Math.max((g.W * 0.34) / d.Aw, 0.24), 0.55);
    const bowY = d.y0 + d.ribbonY;
    let Oy = (g.ey + g.hole * 0.64 - s0 * bowY) / (1 - s0);
    Oy = Math.min(Math.max(Oy, g.ey + g.hole * 0.18), g.ey + g.hole * 0.6);
    const O = [g.cx, Oy];
    this.dive = { s0, O, K: diveScale(holeTriangle(g), O, VW, VH) };
    const origin = `${px(O[0])} ${px(O[1])}`;
    p.env.style.transformOrigin = origin;
    p.scene.style.transformOrigin = origin;
    p.backdrop.style.transformOrigin = origin;
    p.scene.style.transform = `scale(${s0})`;
    // backdrop jali tiles line up with the scaled scene's wall
    p.backdrop.style.backgroundSize = `${44 * s0}px ${44 * s0}px`;
    p.backdrop.style.backgroundPosition = `${px(O[0] * (1 - s0))} ${px(O[1] * (1 - s0))}`;
  }

  /* ───────────── the sequence ───────────── */

  start() {
    if (this.state !== 'closed') return;
    this.state = 'playing';
    const { el, parts: p } = this;
    p.seal.classList.remove('is-pressed');
    el.classList.add('op-playing');
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
    this.timers.push(setTimeout(() => this.skip(), SAFETY_MS));

    if (reducedMotion()) {
      this.reveal();
      const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease-out', fill: 'forwards' });
      a.finished.then(() => this.teardown(), () => this.teardown());
      return;
    }

    try {
      p.stage.getAnimations?.().forEach((a) => a.finish());
      p.skip.hidden = false;
      this.play();
    } catch (err) {
      console.error('[opening]', err);
      this.skip();
    }
  }

  play() {
    const { parts: p, dive, el } = this;
    const A = (node, kf, opts) => {
      const a = node.animate(kf, { fill: 'both', ...opts });
      this.anims.push(a);
      return a;
    };
    const at = (ms, fn) => this.timers.push(setTimeout(fn, ms));
    const layers = [p.env, p.flap, p.scene, p.backdrop, p.leafL, p.leafR, p.bow];
    layers.forEach((n) => { n.style.willChange = 'transform, opacity'; });
    el.classList.add('op-diving');

    // skip button appears quietly after a beat
    A(p.skip, [{ opacity: 0 }, { opacity: 1 }], { delay: 600, duration: 500 });

    // 1 ─ seal: press in, then lift off the paper (anticipation)
    A(p.sealArt, [
      { transform: 'scale(1)', easing: 'cubic-bezier(.3,0,.6,1)' },
      { transform: 'scale(.92)', offset: 0.2, easing: 'cubic-bezier(.2,1.6,.4,1)' },
      { transform: 'translateY(-3%) scale(1.1) rotate(-5deg)' },
    ], { delay: T.press, duration: 520 });
    A(p.sealShadow, [
      { opacity: 1, transform: 'none' },
      { opacity: 0.85, transform: 'scale(.9)', offset: 0.2 },
      { opacity: 0.55, transform: 'translate(4%, 12%) scale(1.18)' },
    ], { delay: T.press, duration: 520 });
    A(p.halo, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    A(p.prompt, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(6px)' }], { duration: 300, easing: 'ease-in' });

    // 2 ─ flap swings up on its hinge, carrying the seal
    A(p.flap, [
      { transform: 'rotateX(0deg)', easing: 'cubic-bezier(.5,0,.8,.5)' },
      { transform: 'rotateX(9deg)', offset: 0.16, easing: 'cubic-bezier(.3,.12,.5,1)' },
      { transform: 'rotateX(92deg)', offset: 0.64, easing: 'cubic-bezier(.3,0,.2,1)' },
      { transform: 'rotateX(180deg)' },
    ], { delay: T.flap, duration: T.flapDur });
    A(this.q('.op-flap__tint'), [
      { opacity: 0 }, { opacity: 0.1, offset: 0.16 }, { opacity: 0.55, offset: 0.62 }, { opacity: 0.55 },
    ], { delay: T.flap, duration: T.flapDur });
    A(p.flapShadow, [{ opacity: 1 }, { opacity: 0 }], { delay: T.flap, duration: 260 })
      .finished.then(() => { p.flapShadow.hidden = true; }, () => {});

    // 3 ─ dive into the envelope: exponential zoom (feels like constant speed), scene grows with parallax
    const { K, s0 } = dive;
    const N = 28, kEnv = [], kScene = [], kBack = [];
    const ease = cubicBezier(0.62, 0, 0.28, 1);
    for (let i = 0; i <= N; i++) {
      const u = i / N, q = ease(u);
      kEnv.push({ offset: u, transform: `scale(${(K ** q).toFixed(4)})` });
      kScene.push({ offset: u, transform: `scale(${(s0 ** (1 - q)).toFixed(4)})` });
      kBack.push({ offset: u, transform: `scale(${(s0 ** (1 - q) / s0).toFixed(4)})` });
    }
    const envDive = A(p.env, kEnv, { delay: T.dive, duration: T.diveDur });
    A(p.scene, kScene, { delay: T.dive, duration: T.diveDur });
    A(p.backdrop, kBack, { delay: T.dive, duration: T.diveDur });
    A(p.shade, [{ opacity: 1 }, { opacity: 0 }], { delay: T.dive + T.diveDur * 0.15, duration: T.diveDur * 0.45, easing: 'ease-out' });
    // hide the envelope when ITS animation ends (not on a timer: a busy main thread can start animations late)
    envDive.finished.then(() => {
      if (this.state !== 'playing') return;
      p.stage.hidden = true;
      p.backdrop.hidden = true;
      p.env.style.willChange = p.flap.style.willChange = p.backdrop.style.willChange = '';
      el.classList.remove('op-diving');
    }).catch(() => {});

    // 4 ─ the bow: a little tug, then it slips undone
    A(p.bow, [
      { transform: 'scale(1)', easing: 'cubic-bezier(.4,0,.6,1)' },
      { transform: 'scale(1.06)', offset: 0.45, easing: 'cubic-bezier(.4,0,.6,1)' },
      { transform: 'scale(.99)', offset: 0.8 },
      { transform: 'scale(1)' },
    ], { delay: T.tug, duration: 360 });
    const q = (s) => this.q(s);
    const untie = { delay: T.untie, duration: 620, easing: 'cubic-bezier(.55,0,.75,.35)' };
    A(q('.op-bow__loopL'), [
      { transform: 'none', opacity: 1 },
      { transform: 'translate(6%, 2%) rotate(-24deg) scale(.55, .7)', opacity: 0.9, offset: 0.55 },
      { transform: 'translate(10%, 18%) rotate(-48deg) scale(.15, .3)', opacity: 0 },
    ], untie);
    A(q('.op-bow__loopR'), [
      { transform: 'none', opacity: 1 },
      { transform: 'translate(-6%, 2%) rotate(24deg) scale(.55, .7)', opacity: 0.9, offset: 0.55 },
      { transform: 'translate(-10%, 18%) rotate(48deg) scale(.15, .3)', opacity: 0 },
    ], untie);
    A(q('.op-bow__knot'), [
      { transform: 'none', opacity: 1 },
      { transform: 'scale(.6, .4) translateY(20%)', opacity: 0 },
    ], { delay: T.untie + 180, duration: 380, easing: 'ease-in' });
    const fall = { delay: T.untie + 120, duration: 760, easing: 'cubic-bezier(.5,0,.85,.45)' };
    A(q('.op-bow__tailL'), [
      { transform: 'none', opacity: 1 },
      { transform: 'translate(-4%, 70%) rotate(14deg)', opacity: 0 },
    ], fall);
    A(q('.op-bow__tailR'), [
      { transform: 'none', opacity: 1 },
      { transform: 'translate(4%, 74%) rotate(-12deg)', opacity: 0 },
    ], fall);
    A(p.bow, [{ opacity: 1 }, { opacity: 0 }], { delay: T.untie + 380, duration: 420, easing: 'ease-in' });
    const slip = { delay: T.untie + 160, duration: 560, easing: 'cubic-bezier(.5,0,.8,.5)' };
    A(p.leafL.querySelector('.op-band'), [{ transform: 'none', opacity: 1 }, { transform: 'translate(-14%, 30%)', opacity: 0 }], slip);
    A(p.leafR.querySelector('.op-band'), [{ transform: 'scaleX(-1)', opacity: 1 }, { transform: 'scaleX(-1) translate(-14%, 30%)', opacity: 0 }], slip);

    // 5 ─ doors: unlatch, swing inward with a soft overshoot, camera pushes through, then everything fades
    const swing = (sign) => [
      { transform: 'rotateY(0deg)', easing: 'cubic-bezier(.3,0,.4,1)' },
      { transform: `rotateY(${sign * 5}deg)`, offset: 0.1, easing: 'ease-in-out' },
      { transform: `rotateY(${sign * 4}deg)`, offset: 0.17, easing: 'cubic-bezier(.35,0,.15,1)' },
      { transform: `rotateY(${sign * 90}deg)`, offset: 0.8, easing: 'cubic-bezier(.4,0,.6,1)' },
      { transform: `rotateY(${sign * 84}deg)` },
    ];
    const doorOpts = { delay: T.open, duration: T.openDur };
    A(p.leafL, swing(1), doorOpts);
    A(p.leafR, swing(-1), doorOpts);
    for (const leafEl of [p.leafL, p.leafR]) {
      A(leafEl.querySelector('.op-leaf__shade'), [
        { opacity: 0 }, { opacity: 0, offset: 0.15 }, { opacity: 0.38, offset: 0.8 }, { opacity: 0.34 },
      ], doorOpts);
    }
    A(p.glow, [
      { opacity: 0, transform: 'scaleX(.15)' },
      { opacity: 1, transform: 'scaleX(.7)', offset: 0.45 },
      { opacity: 0, transform: 'scaleX(1.1)' },
    ], { delay: T.open + 120, duration: 1100, easing: 'ease-out' });
    A(p.scene, [{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }],
      { delay: T.open + 200, duration: T.openDur, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' });
    A(p.wall, [{ opacity: 1 }, { opacity: 0 }], { delay: T.fade - 80, duration: T.fadeDur, easing: 'ease-in' });
    for (const leafEl of [p.leafL, p.leafR]) {
      A(leafEl, [{ opacity: 1 }, { opacity: 0 }], { delay: T.fade + 60, duration: T.fadeDur, easing: 'ease-in' });
    }
    this.petals(T.open + 260);

    at(T.reveal, () => this.reveal());
    at(T.fade + T.fadeDur + 120, () => {
      p.skip.hidden = true;
      p.scene.hidden = true;
    });
    // petals drift down over the revealed card, then the overlay leaves the DOM
    at(T.open + 260 + 3600, () => this.teardown());
  }

  petals(delay) {
    const { parts: p } = this;
    const vw = this.el.clientWidth, vh = this.el.clientHeight;
    const rnd = mulberry(5);
    const size = Math.max(Math.min(vw, vh) * 0.05, 17);
    let html = '';
    for (let i = 0; i < PETALS; i++) html += `<span class="op-petal">${petalSVG(i)}</span>`;
    p.petals.innerHTML = html;
    p.petals.querySelectorAll('.op-petal').forEach((n, i) => {
      const s = size * (0.75 + rnd() * 0.6);
      const x0 = vw * (0.5 + (rnd() - 0.5) * 0.5);
      const y0 = vh * (0.25 + rnd() * 0.3);
      const dx = (x0 - vw / 2) * (1.2 + rnd()) + (rnd() - 0.5) * vw * 0.3;
      const dy = vh * (0.55 + rnd() * 0.45);
      const r0 = rnd() * 360, r1 = r0 + (rnd() < 0.5 ? -1 : 1) * (160 + rnd() * 260);
      const f = 40 + rnd() * 60;
      Object.assign(n.style, { width: `${s}px`, height: `${s * 1.2}px`, left: `${x0}px`, top: `${y0}px` });
      const a = n.animate([
        { opacity: 0, transform: `translate(0,0) rotate(${r0}deg) rotateX(0deg) scale(.6)` },
        { opacity: 1, transform: `translate(${dx * 0.25}px, ${dy * 0.12}px) rotate(${r0 + (r1 - r0) * 0.25}deg) rotateX(${f}deg) scale(1)`, offset: 0.15 },
        { opacity: 0.95, transform: `translate(${dx * 0.7}px, ${dy * 0.6}px) rotate(${r0 + (r1 - r0) * 0.7}deg) rotateX(${-f}deg) scale(1)`, offset: 0.7 },
        { opacity: 0, transform: `translate(${dx}px, ${dy}px) rotate(${r1}deg) rotateX(${f * 0.5}deg) scale(.9)` },
      ], { delay: delay + i * 55 + rnd() * 220, duration: 2300 + rnd() * 900, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'both' });
      this.anims.push(a);
    });
  }

  /* ───────────── endings ───────────── */

  /** Resolve the mount promise (page becomes interactive) and let clicks through. */
  reveal() {
    if (this.resolved) return;
    this.resolved = true;
    this.state = this.state === 'closed' ? 'done' : this.state;
    this.el.classList.add('op-revealed');
    document.documentElement.style.overflow = this.prevOverflow || '';
    this.resolveFn();
    // main.js removes `inert` from <main> right after the promise settles → focus on the next tick
    setTimeout(() => this.focusPage(), 0);
  }

  focusPage() {
    const a = document.activeElement;
    if (a && a !== document.body && !this.el.contains(a)) return; // guest already moved on (e.g. the language switcher)
    const target = document.getElementById('postcard') || document.getElementById('site');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
  }

  /** Skip / safety net: quick fade, resolve immediately. */
  skip() {
    if (this.state === 'gone' || this.skipping) return;
    this.skipping = true;
    this.reveal();
    const a = this.el.animate([{ opacity: getComputedStyle(this.el).opacity }, { opacity: 0 }],
      { duration: 280, easing: 'ease-out', fill: 'forwards' });
    a.finished.then(() => this.teardown(), () => this.teardown());
    this.timers.push(setTimeout(() => this.teardown(), 600));
  }

  bail() {
    this.reveal();
    this.teardown();
  }

  teardown() {
    if (this.state === 'gone') return;
    this.state = 'gone';
    this.reveal();
    this.timers.forEach(clearTimeout);
    this.cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    this.anims.forEach((a) => { try { a.cancel(); } catch { /* ignore */ } });
    this.el.hidden = true;
    this.el.remove();
  }
}

/* ───────────── helpers ───────────── */

/** Smallest zoom k (about O) that makes the V mouth contain the whole viewport. */
function diveScale(tri, O, VW, VH) {
  const inTri = ([x, y]) => {
    const [[ax, ay], [bx, by], [cx, cy]] = tri;
    const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const corners = [[0, 0], [VW, 0], [0, VH], [VW, VH]];
  const ok = (k) => corners.every(([x, y]) => inTri([O[0] + (x - O[0]) / k, O[1] + (y - O[1]) / k]));
  let lo = 1, hi = 400;
  if (!ok(hi)) return hi;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
  return hi * 1.06;
}

/** CSS-style cubic-bezier easing as a JS function (for sampled keyframes). */
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const Y = (t) => ((ay * t + by) * t + cy) * t;
  const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = X(t) - x, d = dX(t);
      if (Math.abs(e) < 1e-5) break;
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    t = Math.min(Math.max(t, 0), 1);
    return Y(t);
  };
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
