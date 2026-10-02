// Form field factory: label above, input, inline error, hint — wired for a11y and live validation.
import { t } from '../i18n/index.js';
import { h, uid, setText } from './dom.js';
import { icons } from './ornaments.js';
import { LIMITS } from './validate.js';

const PRESETS = {
  first: { type: 'text', autocomplete: 'given-name', autocapitalize: 'words', spellcheck: 'false', dir: 'auto', maxlength: LIMITS.name + 20, enterkeyhint: 'next' },
  last: { type: 'text', autocomplete: 'family-name', autocapitalize: 'words', spellcheck: 'false', dir: 'auto', maxlength: LIMITS.name + 20, enterkeyhint: 'next' },
  email: { type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', dir: 'ltr', maxlength: LIMITS.email + 10, enterkeyhint: 'next' },
  phone: { type: 'tel', inputmode: 'tel', autocomplete: 'tel', dir: 'ltr', maxlength: LIMITS.phone + 8, enterkeyhint: 'next' },
};

/**
 * @param {object} o
 * @param {string} o.label     i18n key of the label
 * @param {'first'|'last'|'email'|'phone'|'message'} o.kind
 * @param {(v:string)=>string} [o.check]  returns an i18n error key or ''
 * @param {string} [o.hint]    i18n key of a hint line
 * @param {boolean} [o.optional]
 * @param {object} [o.attrs]   extra input attributes (override presets)
 * @param {()=>void} [o.onInput]
 */
export function createField(o) {
  const id = uid(`rsvp-${o.kind}`);
  const errId = `${id}-err`, hintId = `${id}-hint`;
  const isArea = o.kind === 'message';

  const label = h('label', { class: 'rsvp-field__label', for: id }, h('span', { i18n: o.label }));
  if (o.optional) label.append(' ', h('span', { class: 'rsvp-field__opt', i18n: 'form.optional' }));

  const attrs = { ...(PRESETS[o.kind] || {}), ...(o.attrs || {}) };
  const input = isArea
    ? h('textarea', { class: 'rsvp-input rsvp-input--area', id, name: o.name || o.kind, rows: 3, maxlength: LIMITS.message, dir: 'auto', ...(o.attrs || {}) })
    : h('input', { class: 'rsvp-input', id, name: o.name || o.kind, ...attrs });
  if (!o.optional) input.required = true;

  const errText = h('span');
  const error = h('p', { class: 'rsvp-field__error', id: errId, hidden: true }, h('span', { class: 'rsvp-field__error-icon', html: icons.alert }), errText);
  const hint = o.hint ? h('p', { class: 'rsvp-field__hint', id: hintId, i18n: o.hint }) : null;

  const wrap = h('div', { class: `rsvp-field rsvp-field--${o.kind}` }, label, input, error, hint);

  let errKey = '';
  let dirty = false;

  const describe = () => {
    const ids = [errKey ? errId : null, hint ? hintId : null].filter(Boolean);
    if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
    else input.removeAttribute('aria-describedby');
  };

  function setError(key) {
    errKey = key || '';
    if (errKey) {
      setText(errText, errKey);
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      wrap.classList.add('is-invalid');
    } else {
      error.hidden = true;
      errText.removeAttribute('data-i18n');
      errText.textContent = '';
      input.removeAttribute('aria-invalid');
      wrap.classList.remove('is-invalid');
    }
    describe();
  }

  function validate() {
    const key = o.check ? o.check(input.value) : '';
    setError(key);
    return key;
  }

  const grow = () => {
    if (!isArea || CSS.supports?.('field-sizing', 'content')) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 420)}px`;
  };

  input.addEventListener('input', () => {
    dirty = true;
    if (errKey) validate();          // clear the error as soon as it's fixed
    grow();
    o.onInput?.();
  });
  input.addEventListener('blur', () => {
    if (dirty || errKey) validate(); // never scold a field the guest only tabbed past
  });
  describe();

  return {
    wrap, input, id,
    get value() { return input.value; },
    set value(v) { input.value = v ?? ''; grow(); },
    get error() { return errKey; },
    validate, setError,
    reset() { input.value = ''; dirty = false; setError(''); grow(); },
    grow,
    t,
  };
}

/** A visually hidden honeypot. Real people never see or reach it; bots fill it. */
export function createHoneypot() {
  const id = uid('rsvp-website');
  const input = h('input', { type: 'text', id, name: 'website', tabindex: '-1', autocomplete: 'off', inputmode: 'none' });
  const wrap = h('div', { class: 'rsvp-hp', 'aria-hidden': 'true' }, h('label', { for: id, i18n: 'form.honeypot' }), input);
  return { wrap, input };
}

/** Inline alert / status line (role=alert, starts empty so it announces when filled). */
export function createAlert(cls = '') {
  const text = h('span', { class: 'rsvp-alert__text' });
  const el = h('div', { class: `rsvp-alert ${cls}`, role: 'alert', hidden: true }, h('span', { class: 'rsvp-alert__icon', html: icons.alert }), text);
  return {
    el,
    show(key, vars) { delete el.dataset.kind; setText(text, key, vars); el.hidden = false; el.classList.remove('is-shown'); void el.offsetWidth; el.classList.add('is-shown'); },
    hide() { el.hidden = true; delete el.dataset.kind; text.textContent = ''; text.removeAttribute('data-i18n'); },
    get shown() { return !el.hidden; },
  };
}

/** Map an API error code to an i18n key. */
export function errorKey(code) {
  return {
    network: 'errors.network',
    server: 'errors.server',
    invalid: 'errors.invalid',
    party_too_large: 'errors.partyTooLarge',
  }[code] || 'errors.server';
}

/** Button label + busy state. Uses aria-disabled so focus stays on the button while sending. */
export function setBusy(btn, busy, busyKey, idleKey) {
  btn.classList.toggle('is-busy', busy);
  btn.setAttribute('aria-disabled', busy ? 'true' : 'false');
  if (busy) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
  const label = btn.querySelector('.rsvp-btn__label') || btn;
  setText(label, busy ? busyKey : idleKey);
}
