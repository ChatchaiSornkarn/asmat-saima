// "Cancel / can't come" — look up the guest's own Party (email AND phone), tick who can't come (Q12, Q13).
import { getLang } from '../i18n/index.js';
import { h, uid, retranslate, scrollToEl, focusEl, session } from './dom.js';
import { createField, createHoneypot, createAlert, errorKey, setBusy } from './fields.js';
import { checkEmail, checkPhone, checkMessage, cleanEmail, cleanMessage, lookupPeople, cancelEntries, pickerTagKeys } from './validate.js';
import { icons, rosetteSeal, rosette } from './ornaments.js';

const DRAFT_KEY = 'asmat-saima-rsvp-cancel';

/**
 * @param {object} ctx { api, onSuccess(result) }
 * @returns {{ el, refresh(), focusStart() }}
 */
export function createCancel({ api, onSuccess }) {
  let people = [];         // Party from lookup: [{ name, category }] (category '' from an older server / untagged line)
  let boxes = [];          // checkbox inputs, index-aligned with people
  let busy = false;
  let step = 1;
  let found = null;        // { email, phone } used for the successful lookup

  // ── Step 1: find ─────────────────────────────────────────────────────────
  const saveDraft = () => session.set(DRAFT_KEY, { email: email.value, phone: phone.value });
  const email = createField({ kind: 'email', label: 'form.email', check: checkEmail, onInput: saveDraft, name: 'cancel-email' });
  const phone = createField({ kind: 'phone', label: 'form.phone', hint: 'form.phoneHint', check: checkPhone, onInput: saveDraft, name: 'cancel-phone' });
  const findAlert = createAlert('rsvp-alert--form');
  const findLabel = h('span', { class: 'rsvp-btn__label', i18n: 'cancel.find' });
  const findBtn = h('button', { type: 'submit', class: 'btn btn--primary rsvp-submit' },
    h('span', { class: 'rsvp-btn__icon', html: icons.search }), findLabel);
  const step1Title = h('h3', { class: 'rsvp-step__title', tabindex: '-1', id: uid('rsvp-c1'), i18n: 'cancel.step1Title' });
  const step1 = h('form', { class: 'rsvp-form rsvp-step rsvp-step--find', novalidate: true, 'aria-labelledby': step1Title.id, on: { submit: onFind } },
    h('div', { class: 'rsvp-step__head' }, h('span', { class: 'rsvp-step__num', 'aria-hidden': 'true', text: '1' }), step1Title),
    h('p', { class: 'rsvp-group__note rsvp-step__body', i18n: 'cancel.step1Body' }),
    h('div', { class: 'rsvp-pair rsvp-pair--contact' }, email.wrap, phone.wrap),
    findAlert.el,
    h('div', { class: 'rsvp-actions' }, findBtn),
  );

  // ── Step 2: pick ─────────────────────────────────────────────────────────
  const step2Title = h('h3', { class: 'rsvp-step__title', tabindex: '-1', id: uid('rsvp-c2'), i18n: 'cancel.step2Title' });
  const allBox = h('input', { type: 'checkbox', class: 'rsvp-check__input', id: uid('rsvp-all') });
  const allRow = h('label', { class: 'rsvp-check rsvp-check--all', for: allBox.id },
    allBox, h('span', { class: 'rsvp-check__box', html: icons.check + icons.dash }), h('span', { class: 'rsvp-check__text', i18n: 'cancel.cancelAll' }));
  const pickList = h('ul', { class: 'rsvp-pick__list', role: 'list' });
  const pickLegendId = uid('rsvp-pick');
  const pickGroup = h('fieldset', { class: 'rsvp-pick', 'aria-describedby': `${pickLegendId}-err` },
    h('legend', { class: 'rsvp-visually-hidden', id: pickLegendId, i18n: 'cancel.step2Title' }),
    allRow, pickList);
  const message = createField({ kind: 'message', label: 'cancel.message', optional: true, check: checkMessage, name: 'cancel-message' });
  const hp = createHoneypot();
  const pickAlert = createAlert('rsvp-alert--form');
  pickAlert.el.id = `${pickLegendId}-err`;
  const backBtn = h('button', { type: 'button', class: 'btn btn--link rsvp-back', on: { click: () => goStep(1) } },
    h('span', { class: 'rsvp-btn__icon', html: icons.back }), h('span', { i18n: 'cancel.back' }));
  const confirmLabel = h('span', { class: 'rsvp-btn__label', i18n: 'cancel.submit' });
  const confirmBtn = h('button', { type: 'submit', class: 'btn btn--primary rsvp-submit' }, confirmLabel);
  const step2 = h('form', { class: 'rsvp-form rsvp-step rsvp-step--pick', novalidate: true, hidden: true, 'aria-labelledby': step2Title.id, on: { submit: onCancel } },
    h('div', { class: 'rsvp-step__head' }, h('span', { class: 'rsvp-step__num', 'aria-hidden': 'true', text: '2' }), step2Title),
    h('p', { class: 'rsvp-group__note rsvp-step__body', i18n: 'cancel.step2Body' }),
    pickGroup,
    h('div', { class: 'rsvp-group rsvp-group--message' }, message.wrap),
    hp.wrap,
    pickAlert.el,
    h('div', { class: 'rsvp-actions rsvp-actions--split' }, backBtn, confirmBtn),
  );

  // ── Step 3: done ─────────────────────────────────────────────────────────
  const done = h('div', { class: 'rsvp-done rsvp-done--cancel', hidden: true });

  const el = h('div', { class: 'rsvp-cancel' }, step1, step2, done);

  // ── Behaviour ────────────────────────────────────────────────────────────
  function goStep(n, { focus = true } = {}) {
    step = n;
    step1.hidden = n !== 1;
    step2.hidden = n !== 2;
    done.hidden = n !== 3;
    const target = n === 1 ? step1 : n === 2 ? step2 : done;
    target.classList.remove('is-in'); void target.offsetWidth; target.classList.add('is-in');
    if (!focus) return;
    const title = target.querySelector('.rsvp-step__title, .rsvp-done__title');
    scrollToEl(target, 'start');
    focusEl(title);
  }

  async function onFind(e) {
    e.preventDefault();
    if (busy) return;
    findAlert.hide();
    const bad = [email, phone].filter((f) => f.validate());
    if (bad.length) { focusEl(bad[0].input); return; }
    busy = true;
    setBusy(findBtn, true, 'cancel.finding', 'cancel.find');
    let res;
    try { res = await api.lookup(cleanEmail(email.value), phone.value.trim()); } catch { res = { ok: false, error: 'network' }; }
    busy = false;
    setBusy(findBtn, false, 'cancel.finding', 'cancel.find');
    if (!res?.ok || !Array.isArray(res.names) || !res.names.length) {
      // not_found (and anything odd) reveals nothing beyond "not found"
      findAlert.show(res?.error === 'network' || res?.error === 'server' ? errorKey(res.error) : 'cancel.notFound');
      return;
    }
    found = { email: cleanEmail(email.value), phone: phone.value.trim() };
    buildPicker(lookupPeople(res));
    goStep(2);
  }

  /**
   * The list shows names; each box is index-aligned with a { name, category }, so two "Sara Khan" stay apart.
   * A name that appears more than once also shows its category label ("Sara Khan · Woman"), text only.
   */
  function buildPicker(list) {
    people = list.slice();
    pickAlert.hide();
    message.reset();
    allBox.checked = false; allBox.indeterminate = false;
    pickList.replaceChildren();
    const tags = pickerTagKeys(people);
    boxes = people.map(({ name }, i) => {
      const id = uid('rsvp-pick');
      const box = h('input', { type: 'checkbox', class: 'rsvp-check__input', id, value: String(i), on: { change: syncAll } });
      pickList.append(h('li', { class: 'rsvp-pick__item', style: `--i:${i}` },
        h('label', { class: 'rsvp-check', for: id }, box,
          h('span', { class: 'rsvp-check__box', html: icons.check }),
          h('bdi', { class: 'rsvp-check__text', text: name }),
          tags[i] ? h('span', { class: 'rsvp-check__tag', i18n: tags[i] }) : null)));
      return box;
    });
    allRow.hidden = people.length < 2;          // a Party of one: the single box says it all
    syncAll();
  }

  allBox.addEventListener('change', () => {
    boxes.forEach((b) => { b.checked = allBox.checked; });
    syncAll();
  });

  function syncAll() {
    const n = boxes.filter((b) => b.checked).length;
    allBox.checked = n === boxes.length && n > 0;
    allBox.indeterminate = n > 0 && n < boxes.length;
    allRow.classList.toggle('is-mixed', allBox.indeterminate);
    pickGroup.classList.toggle('has-selection', n > 0);
    if (n && pickAlert.shown) { pickAlert.hide(); pickGroup.classList.remove('is-invalid'); }
  }

  async function onCancel(e) {
    e.preventDefault();
    if (busy) return;
    pickAlert.hide();
    const chosenPeople = people.filter((_, i) => boxes[i].checked);
    const chosen = chosenPeople.map((p) => p.name);
    if (!chosen.length) {
      pickAlert.show('cancel.nothingSelected');
      pickGroup.classList.add('is-invalid');
      focusEl(allRow.hidden ? boxes[0] : allBox);
      return;
    }
    if (message.validate()) { focusEl(message.input); return; }
    const all = chosen.length === people.length;
    // Send { name, category } so the server drops exactly the ticked person (issue 18); plain name if untagged.
    const cancelList = cancelEntries(chosenPeople);
    const payload = {
      action: 'cancel', lang: getLang(), email: found.email, phone: found.phone,
      ...(all ? { all: true, cancel: cancelList } : { cancel: cancelList }),
      message: cleanMessage(message.value), website: hp.input.value,
    };
    busy = true;
    setBusy(confirmBtn, true, 'cancel.sending', 'cancel.submit');
    let res;
    try { res = await api.cancel(payload); } catch { res = { ok: false, error: 'network' }; }
    busy = false;
    setBusy(confirmBtn, false, 'cancel.sending', 'cancel.submit');
    if (!res?.ok) {
      pickAlert.show(res?.error === 'not_found' ? 'cancel.notFound' : errorKey(res?.error));
      return;
    }
    let cancelled = res.cancelled, remaining = res.remaining;
    if (!Array.isArray(cancelled) || !Array.isArray(remaining)) {   // opaque send: compute locally
      cancelled = chosen;
      remaining = people.map((p) => p.name);
      chosen.forEach((n) => { const k = remaining.indexOf(n); if (k > -1) remaining.splice(k, 1); });
    }
    showDone(cancelled, remaining);
    onSuccess?.(res);
  }

  function showDone(cancelled, remaining) {
    const everyone = !remaining.length;
    const listOf = (arr, cls) => h('ul', { class: `rsvp-party__list ${cls}`, role: 'list' },
      arr.map((n, i) => h('li', { class: 'rsvp-party__name', style: `--i:${i}` }, h('span', { class: 'rsvp-party__bullet', html: rosette() }), h('bdi', { text: n }))));
    const hid = uid('rsvp-cdone');
    done.replaceChildren(...[
      h('div', { class: 'rsvp-done__seal', html: rosetteSeal() }),
      h('h3', { class: 'rsvp-done__title rsvp-done__title--cancel', tabindex: '-1', id: hid, i18n: 'cancel.successTitle' }),
      everyone
        ? h('p', { class: 'rsvp-done__body', i18n: 'cancel.successAll' })
        : h('div', { class: 'rsvp-done__cols' },
          h('section', { class: 'rsvp-party rsvp-party--gone', 'aria-labelledby': `${hid}-c` },
            h('h4', { class: 'rsvp-party__heading', id: `${hid}-c`, i18n: 'cancel.cancelledHeading' }), listOf(cancelled, 'is-gone')),
          h('section', { class: 'rsvp-party', 'aria-labelledby': `${hid}-r` },
            h('h4', { class: 'rsvp-party__heading', id: `${hid}-r`, i18n: 'cancel.remainingHeading' }), listOf(remaining, ''))),
      api.demo ? null : h('p', { class: 'rsvp-done__note' }, h('span', { i18n: 'cancel.emailNote', vars: { email: found.email } })),
    ].filter(Boolean));
    session.del(DRAFT_KEY);
    goStep(3);
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  const draft = session.get(DRAFT_KEY);
  if (draft) { email.value = draft.email || ''; phone.value = draft.phone || ''; }

  return {
    el,
    refresh() { retranslate(el); },
    focusStart() {
      const target = step === 1 ? email.input : step === 2 ? step2Title : done.querySelector('.rsvp-done__title');
      focusEl(target);
    },
    get step() { return step; },
  };
}
