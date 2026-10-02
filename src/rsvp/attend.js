// "We're coming" — the Main guest registers their whole Party (Q5, Q11, Q25, Q26).
import { t, getLang, formatNumber } from '../i18n/index.js';
import { h, uid, setText, setAttrI18n, retranslate, animateIn, animateOut, scrollToEl, focusEl, session, reducedMotion } from './dom.js';
import { createField, createHoneypot, createAlert, errorKey, setBusy } from './fields.js';
import { checkName, checkEmail, checkPhone, checkMessage, buildAttendPayload, cleanName, fullName } from './validate.js';
import { icons, ringsSeal, rosette } from './ornaments.js';

const DRAFT_KEY = 'asmat-saima-rsvp-draft';

/**
 * @param {object} ctx  { api, config, onSuccess(result) }
 * @returns {{ el: HTMLElement, refresh(): void, focusStart(): void }}
 */
export function createAttend({ api, config, onSuccess }) {
  const max = Math.max(1, Number(config.maxPartySize) || 20);
  const members = [];                       // [{ li, first, last, medal, label, remove }]
  let sending = false;
  let lastValues = null;                    // values of the last successful send ("Send another" prefill)
  let lastResult = null;

  // ── Main guest ───────────────────────────────────────────────────────────
  const save = debounce(saveDraft, 250);
  const main = {
    first: createField({ kind: 'first', label: 'form.firstName', check: checkName, onInput: save, name: 'first' }),
    last: createField({ kind: 'last', label: 'form.lastName', check: checkName, onInput: save, name: 'last' }),
    email: createField({ kind: 'email', label: 'form.email', hint: 'form.emailHint', check: checkEmail, onInput: save }),
    phone: createField({ kind: 'phone', label: 'form.phone', hint: 'form.phoneHint', check: checkPhone, onInput: save }),
  };
  const mainHeadId = uid('rsvp-main-h');
  const mainGroup = h('fieldset', { class: 'rsvp-group rsvp-group--main' },
    h('legend', { class: 'rsvp-group__legend', id: mainHeadId },
      h('span', { class: 'rsvp-group__title', i18n: 'form.mainHeading' })),
    h('p', { class: 'rsvp-group__note', i18n: 'form.mainNote' }),
    h('div', { class: 'rsvp-pair' }, main.first.wrap, main.last.wrap),
    h('div', { class: 'rsvp-pair rsvp-pair--contact' }, main.email.wrap, main.phone.wrap),
  );

  // ── Family members ───────────────────────────────────────────────────────
  const list = h('ol', { class: 'rsvp-members__list', role: 'list' });
  const addBtn = h('button', { type: 'button', class: 'btn btn--ghost rsvp-add', on: { click: () => addMember({}, { animate: true, focus: true }) } },
    h('span', { class: 'rsvp-add__icon', html: icons.plus }), h('span', { i18n: 'form.addMember' }));
  const counterNum = h('span', { class: 'rsvp-counter__num' });
  const counter = h('p', { class: 'rsvp-counter', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const maxNote = h('p', { class: 'rsvp-members__max', hidden: true });
  const maxLive = h('div', { 'aria-live': 'polite' }, maxNote);
  const membersGroup = h('fieldset', { class: 'rsvp-group rsvp-group--members' },
    h('legend', { class: 'rsvp-group__legend' }, h('span', { class: 'rsvp-group__title', i18n: 'form.membersHeading' })),
    h('p', { class: 'rsvp-group__note', i18n: 'form.membersNote' }),
    list,
    h('div', { class: 'rsvp-members__foot' }, addBtn, counter),
    maxLive,
  );

  // ── Message, honeypot, submit ────────────────────────────────────────────
  const message = createField({ kind: 'message', label: 'form.message', hint: 'form.messageHint', optional: true, check: checkMessage, onInput: save });
  const hp = createHoneypot();
  const alert = createAlert('rsvp-alert--form');
  const submitLabel = h('span', { class: 'rsvp-btn__label', i18n: 'form.submit' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary rsvp-submit' }, submitLabel);

  const form = h('form', { class: 'rsvp-form', novalidate: true, 'aria-labelledby': 'rsvp-tab-attend', on: { submit: onSubmit } },
    mainGroup,
    membersGroup,
    h('div', { class: 'rsvp-group rsvp-group--message' }, message.wrap),
    hp.wrap,
    alert.el,
    h('div', { class: 'rsvp-actions' }, submit),
  );

  // The "check the highlighted fields" summary goes away by itself once nothing is highlighted.
  form.addEventListener('input', () => {
    if (alert.shown && alert.el.dataset.kind === 'fix' && !form.querySelector('.rsvp-field.is-invalid')) alert.hide();
  });
  form.addEventListener('focusout', () => queueMicrotask(() => {
    if (alert.shown && alert.el.dataset.kind === 'fix' && !form.querySelector('.rsvp-field.is-invalid')) alert.hide();
  }));

  const done = h('div', { class: 'rsvp-done', hidden: true });
  const el = h('div', { class: 'rsvp-attend' }, form, done);

  // ── Members ──────────────────────────────────────────────────────────────
  function addMember(values = {}, { animate = false, focus = false } = {}) {
    if (1 + members.length >= max) return null;
    const labelId = uid('rsvp-member');
    const first = createField({ kind: 'first', label: 'form.firstName', check: checkName, onInput: save, attrs: { autocomplete: 'off' }, name: 'member-first' });
    const last = createField({ kind: 'last', label: 'form.lastName', check: checkName, onInput: save, attrs: { autocomplete: 'off' }, name: 'member-last' });
    const medal = h('span', { class: 'rsvp-member__medal', 'aria-hidden': 'true' });
    const label = h('span', { class: 'rsvp-member__label', id: labelId });
    const remove = h('button', { type: 'button', class: 'rsvp-member__remove', html: icons.close });
    const li = h('li', { class: 'rsvp-member', role: 'group', 'aria-labelledby': labelId, tabindex: '-1' },
      h('div', { class: 'rsvp-member__head' }, medal, label),
      h('div', { class: 'rsvp-member__fields' }, first.wrap, last.wrap),
      remove,
    );
    const m = { li, first, last, medal, label, remove };
    first.value = values.first || '';
    last.value = values.last || '';
    remove.addEventListener('click', () => removeMember(m));
    members.push(m);
    list.append(li);
    renumber();
    updateCount(animate);
    if (animate) animateIn(li);
    if (focus) {
      focusEl(first.input);
      // keep the new row comfortably on screen (mobile keyboards cover the lower half)
      requestAnimationFrame(() => scrollToEl(li, 'center'));
    }
    save();
    return m;
  }

  function removeMember(m, { focusNext = true } = {}) {
    const i = members.indexOf(m);
    if (i === -1) return;
    members.splice(i, 1);
    m.li.removeAttribute('aria-labelledby');
    m.li.inert = true;
    renumber();
    updateCount(true);
    save();
    // Focus the neighbouring row (not an input: no surprise keyboard on phones), else the add button.
    const next = members[i] || members[i - 1];
    if (focusNext) focusEl(next ? next.li : addBtn);
    return animateOut(m.li);
  }

  function renumber() {
    members.forEach((m, i) => {
      const n = i + 2;                                   // the Main guest is guest 1
      m.medal.textContent = formatNumber(n);
      setText(m.label, 'form.memberLabel', { n: formatNumber(n) });
      setAttrI18n(m.remove, 'aria-label:form.removeMember', { n: formatNumber(n) });
    });
    list.classList.toggle('is-empty', !members.length);
  }

  let shownCount = 0;
  function updateCount(animate = false) {
    const n = 1 + members.length;
    const str = t('form.counter', { count: n });
    const raw = String(n), pretty = formatNumber(n);
    const at = str.indexOf(raw);
    counter.textContent = '';
    if (at === -1) counter.textContent = str;
    else {
      counterNum.textContent = pretty;
      counter.append(str.slice(0, at), counterNum, str.slice(at + raw.length));
    }
    if (animate && n !== shownCount && !reducedMotion()) {
      counterNum.classList.remove('is-up', 'is-down');
      void counterNum.offsetWidth;
      counterNum.classList.add(n > shownCount ? 'is-up' : 'is-down');
    }
    shownCount = n;

    const full = n >= max;
    addBtn.disabled = full;
    maxNote.hidden = !full;
    maxNote.textContent = '';
    if (full) {
      const email = String(config.contactEmail || '').trim();
      if (email) {
        const s = t('form.maxReachedEmail', { email });
        const k = s.indexOf(email);
        const a = h('a', { href: `mailto:${email}`, dir: 'ltr', text: email });
        if (k === -1) maxNote.append(s, ' ', a);
        else maxNote.append(s.slice(0, k), a, s.slice(k + email.length));
      } else {
        maxNote.textContent = t('form.maxReached');
      }
    }
  }

  // ── Draft ────────────────────────────────────────────────────────────────
  function values() {
    return {
      main: { first: main.first.value, last: main.last.value, email: main.email.value, phone: main.phone.value },
      members: members.map((m) => ({ first: m.first.value, last: m.last.value })),
      message: message.value,
      website: hp.input.value,
    };
  }
  function saveDraft() {
    const v = values();
    delete v.website;
    const empty = !v.message && !v.members.length && !Object.values(v.main).some(Boolean);
    if (empty) session.del(DRAFT_KEY); else session.set(DRAFT_KEY, v);
  }
  function fill(v) {
    if (!v || typeof v !== 'object') return;
    const m = v.main || {};
    main.first.value = m.first; main.last.value = m.last; main.email.value = m.email; main.phone.value = m.phone;
    message.value = v.message || '';
    while (members.length) { const x = members.pop(); x.li.remove(); }
    (Array.isArray(v.members) ? v.members : []).slice(0, max - 1).forEach((x) => addMember(x || {}));
    renumber();
    updateCount(false);
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    alert.hide();

    // Forgiving: silently drop member rows left completely empty (e.g. "Add" tapped twice).
    const blanks = members.filter((m) => !cleanName(m.first.value) && !cleanName(m.last.value));
    blanks.forEach((m) => removeMember(m, { focusNext: false }));

    const fields = [main.first, main.last, main.email, main.phone, ...members.flatMap((m) => [m.first, m.last]), message];
    const invalid = fields.filter((f) => f.validate());
    if (invalid.length) {
      alert.show('validation.fixErrors');
      alert.el.dataset.kind = 'fix';
      const f = invalid[0];
      focusEl(f.input);
      scrollToEl(f.wrap, 'center');
      return;
    }
    if (1 + members.length > max) { alert.show('errors.partyTooLarge'); return; }

    const v = values();
    const payload = buildAttendPayload(v, getLang());
    // Show the cleaned names back in the form (trimmed/collapsed).
    main.first.value = payload.main.first; main.last.value = payload.main.last; main.email.value = payload.main.email;
    members.forEach((m, i) => { m.first.value = payload.members[i].first; m.last.value = payload.members[i].last; });

    sending = true;
    setBusy(submit, true, 'form.sending', 'form.submit');
    form.setAttribute('aria-busy', 'true');
    let res;
    try { res = await api.attend(payload); } catch { res = { ok: false, error: 'network' }; }
    sending = false;
    setBusy(submit, false, 'form.sending', 'form.submit');
    form.removeAttribute('aria-busy');

    if (!res || !res.ok) {
      alert.show(errorKey(res?.error));
      return;
    }
    const names = Array.isArray(res.names) && res.names.length
      ? res.names
      : [fullName(payload.main), ...payload.members.map(fullName)];
    lastValues = { ...v, website: '' };
    lastResult = { names, replaced: res.replaced === true, email: payload.main.email };
    session.del(DRAFT_KEY);
    showDone();
    onSuccess?.(res);
  }

  // ── Confirmation ─────────────────────────────────────────────────────────
  function showDone() {
    const { names, replaced, email } = lastResult;
    const titleId = uid('rsvp-done-title');
    const list = h('ol', { class: 'rsvp-party__list', role: 'list' },
      names.map((n, i) => h('li', { class: 'rsvp-party__name', style: `--i:${i}` }, h('span', { class: 'rsvp-party__bullet', html: rosette() }), h('bdi', { text: n }))));
    done.replaceChildren(...[
      h('div', { class: 'rsvp-done__seal', html: ringsSeal() }),
      h('h3', { class: 'rsvp-done__title', id: titleId, tabindex: '-1', i18n: 'success.attendTitle' }),
      h('p', { class: 'rsvp-done__body', i18n: 'success.attendBody' }),
      h('section', { class: 'rsvp-party', 'aria-labelledby': `${titleId}-party` },
        h('h4', { class: 'rsvp-party__heading', id: `${titleId}-party`, i18n: 'success.partyHeading', vars: { count: names.length } }),
        list),
      replaced ? h('p', { class: 'rsvp-done__note rsvp-done__note--replaced', i18n: 'success.replaced' }) : null,
      api.demo ? null : h('p', { class: 'rsvp-done__note' }, h('span', { i18n: 'success.emailNote', vars: { email } })),
      h('div', { class: 'rsvp-done__actions' },
        h('button', { type: 'button', class: 'btn btn--ghost rsvp-another', on: { click: showForm } }, h('span', { i18n: 'success.another' }))),
    ].filter(Boolean));
    form.hidden = true;
    done.hidden = false;
    done.classList.remove('is-in'); void done.offsetWidth; done.classList.add('is-in');
    const title = done.querySelector('.rsvp-done__title');
    scrollToEl(done, 'start');
    focusEl(title);
  }

  function showForm() {
    done.hidden = true;
    form.hidden = false;
    alert.hide();
    [main.first, main.last, main.email, main.phone, message].forEach((f) => f.setError(''));
    if (lastValues) fill(lastValues);          // pre-filled: add or remove someone and resend
    saveDraft();
    scrollToEl(form, 'start');
    focusEl(main.first.input);
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  fill(session.get(DRAFT_KEY));
  renumber();
  updateCount(false);

  return {
    el,
    refresh() {
      retranslate(el);
      renumber();
      updateCount(false);
    },
    focusStart() { focusEl(form.hidden ? done.querySelector('.rsvp-done__title') : main.first.input); },
  };
}

function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}
