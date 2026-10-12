// Side choice on a bare link (2_main_idea issue 16, design Q6).
//
// Shown on the We're coming tab only when the link has no valid ?side= (rsvp/side.js → needsSideChoice),
// above the Main guest's name fields, once per Party. Two buttons, "Asmat's guest" / "Saima's guest",
// in a role="radiogroup": one Tab stop (roving tabindex), ←/→/↑/↓/Home/End move and select (mirrored in
// RTL), Space/Enter select. It starts empty and is required: submitting without a choice shows the
// message under it and focus moves to it (attend.js). The Cancel tab never asks.
import { h, uid, setText } from './dom.js';
import { icons } from './ornaments.js';
import { SIDES, cleanSide, checkSide, sideKeyStep } from './side.js';

const LABELS = { asmat: 'sideChoice.asmat', saima: 'sideChoice.saima' };

/**
 * @param {object} [o]
 * @param {(side: string) => void} [o.onChange]  called after the guest picks a side
 * @returns {{ wrap: HTMLElement, value: string, validate(): string, setError(key: string): void, focus(): void }}
 */
export function createSideChoice({ onChange } = {}) {
  const id = uid('rsvp-side');
  const labelId = `${id}-label`, errId = `${id}-err`;
  let value = '';
  let errKey = '';

  const label = h('p', { class: 'rsvp-field__label rsvp-side__label', id: labelId, i18n: 'sideChoice.label' });
  const buttons = SIDES.map((s) => h('button', {
    type: 'button', role: 'radio', class: 'rsvp-side__opt', 'aria-checked': 'false', tabindex: '-1',
    dataset: { side: s },
    on: { click: () => pick(s, { focus: true }) },
  }, h('span', { class: 'rsvp-side__text', i18n: LABELS[s] })));
  const group = h('div', {
    class: 'rsvp-side__opts', role: 'radiogroup', 'aria-labelledby': labelId, 'aria-required': 'true',
    on: { keydown: onKey },
  }, buttons);
  const errText = h('span');
  const error = h('p', { class: 'rsvp-field__error', id: errId, hidden: true },
    h('span', { class: 'rsvp-field__error-icon', html: icons.alert }), errText);
  const wrap = h('div', { class: 'rsvp-field rsvp-side' }, label, group, error);

  function sync() {
    buttons.forEach((b, i) => {
      const on = b.dataset.side === value;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('is-checked', on);
      // one Tab stop: the checked button, or the first one while nothing is chosen
      b.tabIndex = on || (!value && i === 0) ? 0 : -1;
    });
  }

  function setError(key) {
    errKey = key || '';
    if (errKey) {
      setText(errText, errKey);
      error.hidden = false;
      group.setAttribute('aria-invalid', 'true');
      group.setAttribute('aria-describedby', errId);
      // also on each button: screen readers announce the button, not the group, when focus lands on it
      buttons.forEach((b) => b.setAttribute('aria-describedby', errId));
      wrap.classList.add('is-invalid');
    } else {
      error.hidden = true;
      errText.removeAttribute('data-i18n');
      errText.textContent = '';
      group.removeAttribute('aria-invalid');
      group.removeAttribute('aria-describedby');
      buttons.forEach((b) => b.removeAttribute('aria-describedby'));
      wrap.classList.remove('is-invalid');
    }
  }

  function validate() {
    const key = checkSide(value);
    setError(key);
    return key;
  }

  function pick(s, { focus = false, silent = false } = {}) {
    value = cleanSide(s);
    sync();
    if (errKey) validate();
    if (focus) buttons.find((b) => b.dataset.side === value)?.focus();
    if (!silent) {
      onChange?.(value);
      // lets the form's "check the highlighted fields" summary notice the fix (attend.js listens for input)
      wrap.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function onKey(e) {
    const i = buttons.indexOf(document.activeElement);
    if (i === -1) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pick(buttons[i].dataset.side, { focus: true }); return; }
    const rtl = getComputedStyle(group).direction === 'rtl';
    const j = sideKeyStep(e.key, i, buttons.length, rtl);
    if (j === -1) return;
    e.preventDefault();
    pick(buttons[j].dataset.side, { focus: true });
  }

  sync();

  return {
    wrap,
    get value() { return value; },
    set value(v) { pick(v, { silent: true }); },
    validate, setError,
    focus() { (buttons.find((b) => b.tabIndex === 0) || buttons[0]).focus({ preventScroll: true }); },
  };
}
