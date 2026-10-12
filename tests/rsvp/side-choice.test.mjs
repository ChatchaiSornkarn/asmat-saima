// Side choice on a bare link (2_main_idea issue 16, design Q6): pure rules, the radiogroup widget on a
// tiny fake DOM, the demo mock, the strings and the attend-form wiring.
//   node --test 'tests/rsvp/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { needsSideChoice, resolveSide, checkSide, sideKeyStep, sideFromSearch } from '../../src/rsvp/side.js';
import { buildAttendPayload } from '../../src/rsvp/validate.js';
import { createMock } from '../../src/rsvp/mock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const party = (over = {}) => ({
  action: 'attend', lang: 'en',
  main: { first: 'Asmat', last: 'Khan', email: 'a@x.se', phone: '070 123 45 67', category: 'man' },
  members: [{ first: 'Sara', last: 'Khan', category: 'woman' }], message: '', website: '', ...over,
});

// ── Pure rules ──────────────────────────────────────────────────────────────
test('needsSideChoice: a bare or invalid link shows the choice; ?side=asmat|saima hides it', () => {
  for (const q of ['', '?lang=ur', '?side=', '?side=both', '?side=unknown']) assert.equal(needsSideChoice(sideFromSearch(q)), true, q);
  for (const q of ['?side=asmat', '?side=SAIMA&lang=ur']) assert.equal(needsSideChoice(sideFromSearch(q)), false, q);
});

test('resolveSide: the link wins; else the guest\'s choice; else empty', () => {
  assert.equal(resolveSide('asmat', 'saima'), 'asmat');
  assert.equal(resolveSide('', 'saima'), 'saima');
  assert.equal(resolveSide('both', 'Asmat'), 'asmat');
  assert.equal(resolveSide('', ''), '');
  assert.equal(resolveSide(undefined, undefined), '');
});

test('checkSide: required, with an i18n message key', () => {
  assert.equal(checkSide(''), 'sideChoice.required');
  assert.equal(checkSide('nope'), 'sideChoice.required');
  assert.equal(checkSide('saima'), '');
});

test('sideKeyStep: arrows wrap, Home/End jump, ←/→ mirrored in RTL, other keys ignored', () => {
  assert.equal(sideKeyStep('ArrowRight', 0, 2), 1);
  assert.equal(sideKeyStep('ArrowRight', 1, 2), 0);
  assert.equal(sideKeyStep('ArrowLeft', 0, 2), 1);
  assert.equal(sideKeyStep('ArrowDown', 0, 2), 1);
  assert.equal(sideKeyStep('ArrowUp', 1, 2), 0);
  assert.equal(sideKeyStep('Home', 1, 2), 0);
  assert.equal(sideKeyStep('End', 0, 2), 1);
  assert.equal(sideKeyStep('ArrowLeft', 0, 2, true), 1, 'RTL: ← moves forward');
  assert.equal(sideKeyStep('ArrowRight', 1, 2, true), 0, 'RTL: → moves back');
  assert.equal(sideKeyStep('Tab', 0, 2), -1);
  assert.equal(sideKeyStep('a', 0, 2), -1);
});

test('payload: the chosen side is sent when the link has none', () => {
  const v = { main: party().main, members: [], message: '', website: '', side: 'saima' };
  assert.equal(buildAttendPayload(v, 'ur', resolveSide('', v.side)).side, 'saima');
  assert.ok(!('side' in buildAttendPayload(v, 'en', resolveSide('', ''))), 'no choice → no side (the form blocks this first)');
});

// ── Demo mock: same rule as the script ──────────────────────────────────────
test('demo mock: attend without a valid side is rejected and writes nothing; cancel never needs one', async () => {
  const mock = createMock({ storage: memStore(), latency: [0, 0] });
  for (const side of [undefined, '', 'both', 1, null]) {
    const body = party(side === undefined ? {} : { side });
    assert.deepEqual(await mock.attend(body), { ok: false, error: 'invalid' }, JSON.stringify(side));
  }
  assert.equal(mock.rows().length, 0);
  assert.deepEqual(await mock.attend(party({ website: 'spam' })), { ok: true }, 'honeypot still pretends');
  assert.equal(mock.rows().length, 0);

  assert.equal((await mock.attend(party({ side: 'asmat', members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Ali', last: 'Khan', category: 'man' }] }))).ok, true);
  // Resubmit from the other Side: the new active row takes the new Side.
  const r = await mock.attend(party({ side: 'Saima', members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Ali', last: 'Khan', category: 'man' }] }));
  assert.equal(r.replaced, true);
  assert.deepEqual(mock.rows().map((x) => [x.status, x.side]), [['superseded', 'asmat'], ['active', 'saima']]);
  // Cancel: no side in the body, Party keeps its own.
  assert.equal((await mock.cancel({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Ali Khan'] })).ok, true);
  assert.deepEqual(mock.rows().at(-1).side, 'saima');
});

// ── Strings ─────────────────────────────────────────────────────────────────
test('strings: label, both buttons and the message exist in en, sv, th, ur; names stay Latin', async () => {
  for (const lang of ['en', 'sv', 'th', 'ur']) {
    const tbl = (await import(pathToFileURL(path.join(root, `src/i18n/${lang}.js`)).href)).default;
    const s = tbl.sideChoice;
    assert.ok(s, lang);
    for (const k of ['label', 'asmat', 'saima', 'required']) assert.ok(typeof s[k] === 'string' && s[k].trim(), `${lang}.${k}`);
    assert.match(s.asmat, /Asmat/, lang);
    assert.match(s.saima, /Saima/, lang);
  }
});

// ── Widget on a fake DOM ────────────────────────────────────────────────────
class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.parent = null;
    this.dataset = {}; this.listeners = {}; this.hidden = false; this.tabIndex = -1; this.textContent = '';
    const cls = new Set();
    this.classList = { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)),
      toggle: (c, on) => { (on ?? !cls.has(c)) ? cls.add(c) : cls.delete(c); }, contains: (c) => cls.has(c) };
    Object.defineProperty(this, 'className', { set: (v) => String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)), get: () => [...cls].join(' ') });
  }
  set innerHTML(v) { this._html = v; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'tabindex') this.tabIndex = Number(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...c) { for (const x of c) if (x && typeof x === 'object') { x.parent = this; this.children.push(x); } }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  dispatchEvent(e) { for (let n = this; n; n = e.bubbles ? n.parent : null) (n.listeners[e.type] || []).forEach((f) => f(e)); return true; }
  focus() { globalThis.document.activeElement = this; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
  replaceChildren(...c) { this.children.forEach((x) => { x.parent = null; }); this.children = []; this.append(...c); }
  querySelectorAll(sel) {
    const cls = sel.split('.').filter(Boolean);
    return all(this).slice(1).filter((e) => cls.every((c) => e.classList.contains(c)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  scrollIntoView() {}
  click() { this.dispatchEvent({ type: 'click', bubbles: true }); }
  key(key) { const e = { type: 'keydown', key, bubbles: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; this.dispatchEvent(e); return e; }
}
const all = (el) => [el, ...el.children.flatMap(all)];

function fakeDom(dir = 'ltr') {
  globalThis.document = { createElement: (t) => new FakeEl(t), activeElement: null, documentElement: new FakeEl('html') };
  globalThis.getComputedStyle = () => ({ direction: dir });
  globalThis.Event ??= class { constructor(type, o = {}) { this.type = type; this.bubbles = !!o.bubbles; } };
  globalThis.CSS ??= { supports: () => true };
  globalThis.requestAnimationFrame ??= (fn) => setTimeout(fn, 0);
}

async function widget(dir = 'ltr') {
  fakeDom(dir);
  const { createSideChoice } = await import('../../src/rsvp/side-choice.js');
  const changes = [];
  const c = createSideChoice({ onChange: (s) => changes.push(s) });
  const els = all(c.wrap);
  const group = els.find((e) => e.attrs.role === 'radiogroup');
  const [asmat, saima] = els.filter((e) => e.attrs.role === 'radio');
  return { c, group, asmat, saima, changes, els };
}

test('widget: radiogroup of two radios, labelled, required, starts empty with one Tab stop', async () => {
  const { c, group, asmat, saima, els } = await widget();
  assert.ok(group && asmat && saima);
  assert.equal(group.attrs['aria-required'], 'true');
  const label = els.find((e) => e.attrs.id === group.attrs['aria-labelledby']);
  assert.equal(label.dataset.i18n, 'sideChoice.label');
  assert.equal(asmat.dataset.side, 'asmat');
  assert.equal(saima.dataset.side, 'saima');
  assert.equal(asmat.children[0].dataset.i18n, 'sideChoice.asmat');
  assert.equal(saima.children[0].dataset.i18n, 'sideChoice.saima');
  assert.equal(asmat.attrs.type, 'button', 'never submits the form');
  assert.deepEqual([asmat.attrs['aria-checked'], saima.attrs['aria-checked']], ['false', 'false']);
  assert.deepEqual([asmat.tabIndex, saima.tabIndex], [0, -1]);
  assert.equal(c.value, '');
});

test('widget: submit without a choice → message, aria-invalid, focus; choosing clears it', async () => {
  const { c, group, asmat, saima, changes, els } = await widget();
  let inputs = 0;
  c.wrap.addEventListener('input', () => inputs++);
  assert.equal(c.validate(), 'sideChoice.required');
  const err = els.find((e) => e.attrs.id === group.attrs['aria-describedby']);
  assert.ok(err && !err.hidden, 'message shown and linked');
  assert.equal(err.children[1].dataset.i18n, 'sideChoice.required');
  assert.equal(group.attrs['aria-invalid'], 'true');
  assert.ok(c.wrap.classList.contains('is-invalid'));
  assert.deepEqual([asmat.attrs['aria-describedby'], saima.attrs['aria-describedby']], [err.attrs.id, err.attrs.id], 'each radio reads the message');
  c.focus();
  assert.equal(document.activeElement, asmat);

  saima.click();
  assert.equal(c.value, 'saima');
  assert.deepEqual(changes, ['saima']);
  assert.equal(inputs, 1, 'form hears the change');
  assert.equal(group.attrs['aria-invalid'], undefined);
  assert.ok(err.hidden);
  assert.deepEqual([asmat.attrs['aria-describedby'], saima.attrs['aria-describedby']], [undefined, undefined]);
  assert.deepEqual([asmat.attrs['aria-checked'], saima.attrs['aria-checked']], ['false', 'true']);
  assert.deepEqual([asmat.tabIndex, saima.tabIndex], [-1, 0], 'Tab stop follows the checked radio');
  assert.equal(document.activeElement, saima);
  assert.equal(c.validate(), '');
});

test('widget: keyboard — arrows move and select, Space/Enter select, RTL mirrors ←/→', async () => {
  let w = await widget();
  w.asmat.focus();
  assert.equal(w.asmat.key('ArrowRight').defaultPrevented, true);
  assert.equal(w.c.value, 'saima');
  assert.equal(document.activeElement, w.saima);
  w.saima.key('Home');
  assert.equal(w.c.value, 'asmat');
  w.asmat.key('End');
  assert.equal(w.c.value, 'saima');
  assert.equal(w.saima.key('Tab').defaultPrevented, false, 'Tab leaves the group');

  w = await widget();
  w.asmat.focus();
  w.asmat.key(' ');
  assert.equal(w.c.value, 'asmat');
  w = await widget();
  w.saima.focus();
  w.saima.key('Enter');
  assert.equal(w.c.value, 'saima');

  w = await widget('rtl');
  w.asmat.focus();
  w.asmat.key('ArrowLeft');
  assert.equal(w.c.value, 'saima', 'RTL: ← goes to the next option');
  w.saima.key('ArrowRight');
  assert.equal(w.c.value, 'asmat');
});

test('widget: setting value (draft restore) checks silently; invalid → empty', async () => {
  const { c, saima, changes } = await widget();
  c.value = 'SAIMA';
  assert.equal(c.value, 'saima');
  assert.equal(saima.attrs['aria-checked'], 'true');
  assert.deepEqual(changes, []);
  c.value = 'nobody';
  assert.equal(c.value, '');
});

// ── Attend form wiring (behavioural, same fake DOM) ─────────────────────────
async function attendForm(side) {
  fakeDom();
  const { createAttend } = await import('../../src/rsvp/attend.js');
  const calls = [];
  const api = { demo: true, attend: async (p) => { calls.push(p); return { ok: true }; } };
  const a = createAttend({ api, config: { maxPartySize: 20 }, side });
  const els = all(a.el);
  const form = els.find((e) => e.tagName === 'FORM');
  const input = (name) => els.find((e) => e.tagName === 'INPUT' && e.attrs.name === name);
  const p = party().main;
  for (const k of ['first', 'last', 'email', 'phone']) input(k).value = p[k];
  // The Main guest's category (issue 17) is required too: tick "man" so only the side decides.
  const man = els.find((e) => e.tagName === 'INPUT' && e.attrs.type === 'radio' && e.attrs.value === 'man');
  man.value = man.attrs.value; man.checked = true;
  const submit = async () => {
    const e = { type: 'submit', preventDefault() {} };
    for (const f of form.listeners.submit) await f(e);
  };
  return { a, els, calls, submit, radios: () => all(a.el).filter((e) => e.attrs.role === 'radio') };
}

test('attend form: a bare link shows the choice above the Main guest\'s names; blocked submit sends nothing', async () => {
  const { els, calls, submit, radios } = await attendForm('');
  const group = els.find((e) => e.attrs.role === 'radiogroup' && e.classList.contains('rsvp-side__opts'));
  assert.ok(group, 'choice shown');
  assert.equal(radios().length, 2, 'once per Party');
  const mainGroup = els.find((e) => e.classList.contains('rsvp-group--main'));
  const kids = mainGroup.children;
  const at = kids.findIndex((k) => k.classList.contains('rsvp-side'));
  assert.ok(at !== -1 && kids[at + 1].classList.contains('rsvp-pair'), 'inside the Main guest group, just above the name pair');

  await submit();
  assert.equal(calls.length, 0, 'no API call without a side');
  assert.equal(group.attrs['aria-invalid'], 'true');
  assert.equal(document.activeElement, radios()[0], 'focus moves to the choice');

  radios()[1].click();
  await submit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].side, 'saima', 'the chosen side is sent');
});

test('attend form: a ?side= link hides the choice and sends the link\'s side', async () => {
  const { els, calls, submit } = await attendForm('asmat');
  assert.equal(els.find((e) => e.attrs.role === 'radiogroup' && e.classList.contains('rsvp-side__opts')), undefined, 'no choice');
  assert.equal(els.filter((e) => e.classList.contains('rsvp-side')).length, 0, 'no side-choice wrapper');
  await submit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].side, 'asmat');
});

test('cancel tab never asks for a side', async () => {
  const cancel = await readFile(path.join(root, 'src/rsvp/cancel.js'), 'utf8');
  assert.doesNotMatch(cancel, /side/i);
});
