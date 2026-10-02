// Tiny DOM helpers shared by the RSVP UI modules.
import { t } from '../i18n/index.js';

let uidSeq = 0;
export const uid = (p = 'rsvp') => `${p}-${(++uidSeq).toString(36)}`;

/**
 * h('p', { class: 'x', i18n: 'form.email', vars: {n:1}, attrs: {...}, on: {click: fn} }, ...children)
 * `i18n` sets data-i18n (+ data-i18n-vars) so applyTranslations() keeps it translated.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'i18n') setText(el, v, props.vars);
    else if (k === 'vars') continue;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') Object.entries(v).forEach(([ev, fn]) => el.addEventListener(ev, fn));
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'i18nAttr') el.dataset.rsvpAttr = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  if (props?.i18nAttr) applyAttrs(el);
  return el;
}

/** Translate into textContent and remember the key so a language switch re-applies it. */
export function setText(el, key, vars) {
  el.dataset.i18n = key;
  if (vars && Object.keys(vars).length) el.dataset.i18nVars = JSON.stringify(vars);
  else delete el.dataset.i18nVars;
  el.textContent = t(key, vars || {});
  return el;
}

/**
 * Translated attributes: data-rsvp-attr="aria-label:form.removeMember" (+ vars).
 * Deliberately NOT data-i18n-attr, so the global applyTranslations() can't drop our {n} vars;
 * the RSVP module re-applies these itself on every language change.
 */
export function setAttrI18n(el, spec, vars) {
  el.dataset.rsvpAttr = spec;
  if (vars) el.dataset.rsvpAttrVars = JSON.stringify(vars);
  else delete el.dataset.rsvpAttrVars;
  applyAttrs(el);
}
export function applyAttrs(el) {
  const vars = el.dataset.rsvpAttrVars ? JSON.parse(el.dataset.rsvpAttrVars) : {};
  el.dataset.rsvpAttr.split(';').forEach((p) => {
    const [a, k] = p.split(':');
    if (a && k) el.setAttribute(a.trim(), t(k.trim(), vars));
  });
}

/** Re-apply every data-i18n / data-rsvp-attr inside root. */
export function retranslate(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const vars = el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : {};
    el.textContent = t(el.dataset.i18n, vars);
  });
  root.querySelectorAll('[data-rsvp-attr]').forEach(applyAttrs);
}

export const reducedMotion = () => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Smoothly reveal a freshly inserted block (height + fade). */
export function animateIn(el, dur = 340) {
  if (reducedMotion() || !el.animate) return;
  const hgt = el.getBoundingClientRect().height;
  el.style.overflow = 'clip';
  const a = el.animate(
    [{ height: '0px', opacity: 0, transform: 'translateY(-6px)' }, { height: `${hgt}px`, opacity: 1, transform: 'none' }],
    { duration: dur, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
  a.onfinish = a.oncancel = () => { el.style.overflow = ''; };
}

/** Collapse a block then remove it. Resolves when gone. */
export function animateOut(el, dur = 280) {
  if (reducedMotion() || !el.animate) { el.remove(); return Promise.resolve(); }
  const hgt = el.getBoundingClientRect().height;
  el.style.overflow = 'clip';
  el.style.pointerEvents = 'none';
  const a = el.animate(
    [{ height: `${hgt}px`, opacity: 1 }, { height: '0px', opacity: 0, marginBlock: '0px', paddingBlock: '0px' }],
    { duration: dur, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
  );
  return new Promise((res) => { a.onfinish = a.oncancel = () => { el.remove(); res(); }; });
}

export function scrollToEl(el, block = 'start') {
  try { el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block }); } catch { el.scrollIntoView(); }
}

export function focusEl(el, { scroll = false } = {}) {
  if (!el) return;
  el.focus({ preventScroll: !scroll });
}

/** sessionStorage wrapper that never throws. */
export const session = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};
