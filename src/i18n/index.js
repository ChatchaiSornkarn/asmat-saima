// ─────────────────────────────────────────────────────────────────────────────
//  i18n engine — detection, string lookup, plurals, formatting, lazy fonts and
//  the language switch itself. Contract: docs/ARCHITECTURE.md → "i18n API".
//
//  Hooks for other modules
//  • onLangChange(cb) / document 'langchange' {detail:{lang}} — re-render dynamic text.
//  • html.is-switching — present from the moment a switch starts (tables/fonts
//    loading) until the cross-fade has finished. Style hook only; the engine
//    already cross-fades the page (View Transitions, or a [data-i18n] text fade
//    as fallback — see src/styles/switcher.css). Give dynamic text nodes the
//    class `i18n-fade` to have them join the fallback fade.
//  • formatTime('14:00') — extra helper: '2 pm' · 'kl. 14.00' · '14.00' (th) · 'دوپہر 2 بجے'.
//
//  Thai dates use the Buddhist Era (พ.ศ. 2569), which is Intl's default for th-TH
//  and what formal Thai wedding cards print. Pass { calendar: 'gregory' } to override.
//  Urdu keeps Latin digits (CLDR default for ur-PK; usual on Pakistani cards).
// ─────────────────────────────────────────────────────────────────────────────
import en from './en.js';

const GF = 'https://fonts.googleapis.com/css2?';

// Script fonts load only when their language is first used (design: "Font weight").
// `keep` = Google Fonts subsets we keep. Of the Latin subset only digits/punctuation
// survive (see NEUTRAL_RANGE), so Latin *words* (the address, e-mails) keep falling
// through to Cormorant/Cinzel instead of the Noto fonts' plain Latin.
const LANGS = {
  en: { locale: 'en-GB', dir: 'ltr' },
  sv: { locale: 'sv-SE', dir: 'ltr' },
  th: {
    locale: 'th-TH', dir: 'ltr',
    fonts: {
      query: 'family=Noto+Serif+Thai:wght@400;500;600;700&display=swap',
      keep: ['thai'],
      probes: [['Noto Serif Thai', 'นิกะห์ท่าน']],
      weights: [400, 500, 600, 700],
    },
  },
  ur: {
    locale: 'ur-PK', dir: 'rtl',
    fonts: {
      query: 'family=Noto+Nastaliq+Urdu:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap',
      keep: ['arabic'],
      probes: [['Noto Nastaliq Urdu', 'نکاح۔'], ['Noto Naskh Arabic', 'نکاح۔']],
      weights: [400, 600],
    },
  },
};

const LOADERS = {
  en: () => Promise.resolve({ default: en }),
  sv: () => import('./sv.js'),
  th: () => import('./th.js'),
  ur: () => import('./ur.js'),
};

const NEUTRAL_RANGE = 'U+0020-0040, U+00A0, U+00B7, U+2010-2014, U+2018-201D, U+2026';
const FONT_TIMEOUT = 1200;  // never hold a switch longer than this for fonts
const FADE_OUT = 170;        // fallback text fade (no View Transitions)

let config = { languages: Object.keys(LANGS), defaultLanguage: 'en' };
let supported = Object.keys(LANGS);
let lang = 'en';
let table = en;
let switchSeq = 0;

const tables = { en };
const tablePromises = {};
const fontPromises = {};
const subs = new Set();
const warned = new Set();
const pluralCache = new Map();

// ── helpers ──────────────────────────────────────────────────────────────────
const html = () => document.documentElement;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lookup = (obj, key) => key.split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const PLURAL_CATS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (v) => v && typeof v === 'object' && Object.keys(v).length > 0 &&
  Object.keys(v).every((k) => PLURAL_CATS.has(k)) && Object.values(v).every((s) => typeof s === 'string');

function warnOnce(id, msg) {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(`[i18n] ${msg}`);
}

function normalise(code) {
  return String(code || '').trim().toLowerCase().split(/[-_]/)[0];
}

// ── detection (mirrors the pre-paint script in index.html) ──────────────────
function detect() {
  try {
    const q = normalise(new URLSearchParams(location.search).get('lang'));
    if (q && supported.includes(q)) return q;
  } catch { /* ignore */ }
  const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
  for (const tag of list) {
    const base = normalise(tag);
    if (base === 'nb' || base === 'no' || base === 'da') continue; // other Nordics read English, not Swedish
    if (supported.includes(base)) return base;
  }
  return supported.includes(config.defaultLanguage) ? config.defaultLanguage : 'en';
}

// ── loading ──────────────────────────────────────────────────────────────────
function loadTable(code) {
  if (tables[code]) return Promise.resolve(tables[code]);
  if (!tablePromises[code]) {
    tablePromises[code] = LOADERS[code]()
      .then((m) => (tables[code] = m.default))
      .catch((err) => {
        delete tablePromises[code];
        console.error(`[i18n] could not load strings for "${code}"`, err);
        return en;
      });
  }
  return tablePromises[code];
}

// Fetch Google's CSS, keep only the script subsets, inject it as a <style>.
// Falls back to a plain <link> if the fetch is blocked.
function injectFontCss(code) {
  const spec = LANGS[code].fonts;
  const href = GF + spec.query;
  const mark = `i18n-fonts-${code}`;
  return fetch(href, { mode: 'cors', credentials: 'omit' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((css) => {
      const blocks = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/);
      const kept = [];
      for (const b of blocks) {
        const m = b.match(/^\/\*\s*([\w-]+)\s*\*\//);
        if (!m) continue;
        if (spec.keep.includes(m[1])) kept.push(b);
        // From the Latin subset keep only the script-neutral characters — space, digits,
        // punctuation, dashes, quotes — so numbers and full stops match the Thai/Urdu
        // letters around them, while Latin *letters* fall through to Cormorant/Cinzel.
        else if (m[1] === 'latin') kept.push(b.replace(/unicode-range:[^;]+;/, `unicode-range: ${NEUTRAL_RANGE};`));
      }
      const style = document.createElement('style');
      style.id = mark;
      style.textContent = kept.length ? kept.join('\n') : css;
      document.head.appendChild(style);
    })
    .catch(() => new Promise((resolve) => {
      const link = document.createElement('link');
      link.id = mark;
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = link.onerror = () => resolve();
      document.head.appendChild(link);
    }));
}

function loadFonts(code) {
  const spec = LANGS[code] && LANGS[code].fonts;
  if (!spec || !document.fonts) return Promise.resolve();
  if (!fontPromises[code]) {
    fontPromises[code] = injectFontCss(code)
      .then(() => Promise.all(spec.probes.flatMap(([family, sample]) =>
        spec.weights.map((w) => document.fonts.load(`${w} 1em "${family}"`, sample).catch(() => [])))))
      .then(() => undefined);
  }
  return fontPromises[code];
}

/** Tables + fonts for `code`, capped so a slow network never blocks the switch. */
function prepare(code) {
  const fonts = Promise.race([loadFonts(code), wait(FONT_TIMEOUT)]);
  return Promise.all([loadTable(code), fonts]);
}

/** Warm a language before it is chosen (switcher: hover / focus / pointerdown). */
export function preloadLang(code) {
  code = normalise(code);
  if (!LANGS[code] || !supported.includes(code)) return;
  loadTable(code);
  loadFonts(code);
}

// ── public API ───────────────────────────────────────────────────────────────
export async function initI18n(cfg = {}) {
  config = { ...config, ...cfg };
  supported = (config.languages || Object.keys(LANGS)).map(normalise).filter((c) => LANGS[c]);
  if (!supported.includes('en')) supported.push('en');

  const code = detect();
  await prepare(code);
  commit(code, { silent: true, url: false });

  // Strings for the other languages are tiny — fetch them when the browser is idle
  // so a later switch only waits for fonts.
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  idle(() => supported.forEach((c) => { if (c !== code) loadTable(c); }));
}

export function getLang() { return lang; }
export function getLocale() { return LANGS[lang].locale; }
export function getDir() { return LANGS[lang].dir; }

function pluralRules(locale) {
  if (!pluralCache.has(locale)) pluralCache.set(locale, new Intl.PluralRules(locale));
  return pluralCache.get(locale);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) => {
    if (!(name in vars) || vars[name] == null) return m;
    const v = vars[name];
    return typeof v === 'number' ? formatNumber(v) : String(v);
  });
}

export function t(key, vars) {
  let v = lookup(table, key);
  let locale = getLocale();
  if (v == null || v === '') {
    v = lookup(en, key);
    locale = 'en-GB';
    if (v == null) { warnOnce(key, `missing key "${key}"`); return key; }
    warnOnce(`${lang}:${key}`, `"${key}" missing in "${lang}" — using English`);
  }
  if (typeof v === 'object') {
    if (!isPlural(v)) { warnOnce(`obj:${key}`, `"${key}" is not a string`); return key; }
    const n = Number(vars && vars.count);
    const cat = pluralRules(locale).select(Number.isFinite(n) ? n : 0);
    v = v[cat] ?? v.other ?? Object.values(v)[0];
  }
  if (typeof v !== 'string') return key;
  return interpolate(v, vars);
}

export async function setLang(code) {
  code = normalise(code);
  if (!supported.includes(code)) { warnOnce(`lang:${code}`, `unsupported language "${code}"`); return; }
  const seq = ++switchSeq;
  if (code === lang) { syncUrl(code); return; }

  const root = html();
  root.classList.add('is-switching');
  try { await prepare(code); } catch { /* fall through with whatever loaded */ }
  if (seq !== switchSeq) return; // a newer choice superseded this one

  const finish = () => { if (seq === switchSeq) root.classList.remove('is-switching', 'is-switching-out', 'is-lang-vt'); };

  if (reducedMotion()) { commit(code); finish(); return; }

  if (typeof document.startViewTransition === 'function' && document.visibilityState === 'visible') {
    root.classList.add('is-lang-vt');
    try {
      const vt = document.startViewTransition(() => commit(code));
      vt.finished.then(finish, finish);
      await vt.updateCallbackDone;
      return;
    } catch {
      if (lang !== code) commit(code);
      finish();
      return;
    }
  }

  // Fallback: fade translatable text out, swap, fade back in.
  root.classList.add('is-switching-out');
  await wait(FADE_OUT);
  if (seq !== switchSeq) return;
  commit(code);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (seq === switchSeq) root.classList.remove('is-switching-out');
    setTimeout(finish, 260);
  }));
}

export function onLangChange(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function applyTranslations(root = document) {
  if (!root) return;
  const nodes = [];
  if (root.nodeType === 1 && (root.hasAttribute('data-i18n') || root.hasAttribute('data-i18n-attr'))) nodes.push(root);
  if (root.querySelectorAll) nodes.push(...root.querySelectorAll('[data-i18n], [data-i18n-attr]'));

  for (const el of nodes) {
    let vars;
    if (el.dataset.i18nVars) {
      try { vars = JSON.parse(el.dataset.i18nVars); } catch { warnOnce(`vars:${el.dataset.i18nVars}`, `bad data-i18n-vars: ${el.dataset.i18nVars}`); }
    }
    const key = el.dataset.i18n;
    if (key) {
      const text = t(key, vars);
      if (el.textContent !== text) el.textContent = text;
    }
    const spec = el.dataset.i18nAttr;
    if (spec) {
      for (const pair of spec.split(';')) {
        const i = pair.indexOf(':');
        if (i < 1) continue;
        const attr = pair.slice(0, i).trim();
        const k = pair.slice(i + 1).trim();
        if (attr && k) el.setAttribute(attr, t(k, vars));
      }
    }
  }
}

/**
 * 'YYYY-MM-DD' is a calendar date (no time-zone drift). Anything else is parsed by
 * Date and shown in config.timeZone (Göteborg).
 */
export function formatDate(iso, opts = { dateStyle: 'long' }) {
  let date;
  let timeZone = config.timeZone || 'Europe/Stockholm';
  const m = typeof iso === 'string' && iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    timeZone = 'UTC';
    opts = { ...opts, timeZone };
  } else {
    date = iso instanceof Date ? iso : new Date(iso);
    opts = { timeZone, ...opts };
  }
  if (Number.isNaN(date.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat(getLocale(), opts).format(date);
  } catch {
    return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeZone: opts.timeZone }).format(date);
  }
}

export function formatNumber(n, opts) {
  try { return new Intl.NumberFormat(getLocale(), opts).format(n); } catch { return String(n); }
}

/** 'HH:MM' (local Göteborg time) → how each language writes a time on an invitation. */
export function formatTime(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(hhmm || '');
  const h = +m[1];
  const min = m[2];
  switch (lang) {
    case 'sv':
    case 'th':
      return `${String(h).padStart(2, '0')}.${min}`;      // kl. 14.00 · เวลา 14.00 น.
    case 'ur': {
      const period = h < 4 ? 'رات' : h < 12 ? 'صبح' : h < 15 ? 'دوپہر' : h < 17 ? 'سہ پہر' : h < 20 ? 'شام' : 'رات';
      const h12 = h % 12 || 12;
      return `${period} ${min === '00' ? h12 : `${h12}:${min}`} بجے`;  // دوپہر 2 بجے
    }
    default: {
      const h12 = h % 12 || 12;
      return `${min === '00' ? h12 : `${h12}:${min}`} ${h < 12 ? 'am' : 'pm'}`; // 2 pm
    }
  }
}

// ── the switch itself ────────────────────────────────────────────────────────
function syncUrl(code) {
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('lang') === code) return;
    u.searchParams.set('lang', code);
    history.replaceState(history.state, '', u);
  } catch { /* file:// or sandboxed — ignore */ }
}

function commit(code, { silent = false, url = true } = {}) {
  lang = code;
  table = tables[code] || en;
  const root = html();
  root.lang = code;
  root.dir = LANGS[code].dir;
  if (url) syncUrl(code);

  document.title = t('meta.title');
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', t('meta.description'));

  applyTranslations(document);
  if (silent) return;

  for (const cb of [...subs]) {
    try { cb(code); } catch (err) { console.error('[i18n] onLangChange listener failed', err); }
  }
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: code } }));
}
