// Category choice for one person row (2_main_idea issue 17, design Q2/Q7): Man · Woman · Child 0–3
// (Man · Woman only for the main guest, who gives the family's email and phone).
// A segmented control built from native radio buttons inside a fieldset, so it gets radiogroup semantics,
// Tab-into-the-group / arrow-keys-between-options (mirrored for right-to-left Urdu) and form behaviour for
// free. It starts empty and is required; checkCategory() gives the error key.
import { h, uid, setText } from './dom.js';
import { icons } from './ornaments.js';
import { CATEGORIES, checkCategory, cleanCategory } from './validate.js';

/** i18n key of each option's label (also used for the confirmation list). */
export const CATEGORY_LABELS = { man: 'form.category.man', woman: 'form.category.woman', infant: 'form.category.infant' };

/**
 * @param {object} [o]
 * @param {() => void} [o.onChange]  called after the guest picks an option
 * @param {string[]} [o.categories]  the options offered (default: all of CATEGORIES)
 * @returns {{ wrap, inputs, value, validate(): string, setError(key): void, focus(): void, error: string }}
 */
export function createCategory(o = {}) {
  const id = uid('rsvp-cat');
  const legendId = `${id}-legend`, errId = `${id}-err`;
  const name = `${id}-choice`;
  const categories = o.categories || CATEGORIES;

  const inputs = categories.map((c) => h('input', { type: 'radio', class: 'rsvp-seg__input', name, value: c, id: `${id}-${c}` }));
  const options = categories.map((c, i) => h('label', { class: `rsvp-seg__opt rsvp-seg__opt--${c}`, for: inputs[i].id },
    inputs[i], h('span', { class: 'rsvp-seg__text', i18n: CATEGORY_LABELS[c] })));

  const errText = h('span');
  const error = h('p', { class: 'rsvp-field__error', id: errId, hidden: true }, h('span', { class: 'rsvp-field__error-icon', html: icons.alert }), errText);
  const group = h('fieldset', { class: 'rsvp-seg', role: 'radiogroup', 'aria-labelledby': legendId, 'aria-required': 'true' },
    h('legend', { class: 'rsvp-visually-hidden', id: legendId, i18n: 'form.category.legend' }),
    h('div', { class: 'rsvp-seg__track' }, options));
  const wrap = h('div', { class: 'rsvp-field rsvp-field--category' }, group, error);

  let errKey = '';
  const current = () => (inputs.find((x) => x.checked) || {}).value || '';

  function setError(key) {
    errKey = key || '';
    error.hidden = !errKey;
    if (errKey) {
      setText(errText, errKey);
      group.setAttribute('aria-invalid', 'true');
      group.setAttribute('aria-describedby', errId);
      wrap.classList.add('is-invalid');
    } else {
      errText.removeAttribute('data-i18n');
      errText.textContent = '';
      group.removeAttribute('aria-invalid');
      group.removeAttribute('aria-describedby');
      wrap.classList.remove('is-invalid');
    }
  }

  function validate() {
    const key = checkCategory(current(), categories);
    setError(key);
    return key;
  }

  inputs.forEach((x) => x.addEventListener('change', () => {
    if (errKey) validate();          // clear the message as soon as a choice is made
    o.onChange?.();
  }));

  return {
    wrap, inputs,
    get value() { return current(); },
    set value(v) {
      const c = cleanCategory(v);
      inputs.forEach((x) => { x.checked = x.value === c; });
    },
    get error() { return errKey; },
    validate, setError,
    // Focus goes to the first option (no choice yet), or the chosen one — like Tab would.
    focus() { (inputs.find((x) => x.checked) || inputs[0]).focus({ preventScroll: true }); },
  };
}
