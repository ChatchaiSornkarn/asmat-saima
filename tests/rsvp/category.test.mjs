// Category per person (2_main_idea issue 17, design Q2/Q5/Q7): Man · Woman · Child 0–3 on every person row.
//   node --test 'tests/rsvp/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CATEGORIES, MAIN_CATEGORIES, cleanCategory, checkCategory, cleanPersonName, validateAttend, buildAttendPayload } from '../../src/rsvp/validate.js';
import { createMock, countCategories } from '../../src/rsvp/mock.js';
import en from '../../src/i18n/en.js';
import sv from '../../src/i18n/sv.js';
import th from '../../src/i18n/th.js';
import ur from '../../src/i18n/ur.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const mk = () => createMock({ storage: memStore(), latency: [0, 0] });
const family = (over = {}) => ({
  action: 'attend', lang: 'en', side: 'asmat',   // side is required too (issue 16)
  main: { first: 'Ali', last: 'Khan', email: 'a@x.se', phone: '070 123 45 67', category: 'man' },
  members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Zain', last: 'Khan', category: 'infant' }],
  message: '', website: '', ...over,
});

// ── Pure logic ─────────────────────────────────────────────────────────────
test('categories: exactly man / woman / infant; case and spaces forgiven; anything else is empty', () => {
  assert.deepEqual(CATEGORIES, ['man', 'woman', 'infant']);
  assert.equal(cleanCategory(' Woman '), 'woman');
  for (const bad of [undefined, null, '', 'child', 'men', 'girl', 0, ['man']]) {
    assert.equal(cleanCategory(bad), '', String(bad));
    assert.equal(checkCategory(bad), 'validation.category', String(bad));
  }
  assert.equal(checkCategory('infant'), '');
});

test('validateAttend: every empty category row is reported (Main guest and each member)', () => {
  const v = validateAttend(family({
    main: { ...family().main, category: '' },
    members: [{ first: 'Sara', last: 'Khan' }, { first: 'Zain', last: 'Khan', category: 'infant' }, { first: 'Omar', last: 'Khan', category: 'boy' }],
  }));
  assert.equal(v.ok, false);
  assert.deepEqual(v.errors, { 'main.category': 'validation.category', 'members.0.category': 'validation.category', 'members.2.category': 'validation.category' });
  assert.equal(validateAttend(family()).ok, true);
});

test('the main guest is Man or Woman only: Child 0–3 is offered to members, refused for the main guest', () => {
  assert.deepEqual(MAIN_CATEGORIES, ['man', 'woman']);
  assert.equal(checkCategory('infant', MAIN_CATEGORIES), 'validation.category');
  assert.equal(checkCategory('Woman', MAIN_CATEGORIES), '');
  const v = validateAttend(family({ main: { ...family().main, category: 'infant' } }));
  assert.deepEqual(v.errors, { 'main.category': 'validation.category' });
});

test('buildAttendPayload sends each category and replaces an em dash in names', () => {
  const p = buildAttendPayload({ main: { first: 'Sara — Ann', last: 'Khan', email: 'a@x.se', phone: '0701234567', category: 'woman' },
    members: [{ first: 'Zain', last: 'Khan―Ali', category: 'infant' }, { first: 'X', last: 'Y' }], message: '' }, 'en');
  assert.deepEqual(p.main, { first: 'Sara - Ann', last: 'Khan', email: 'a@x.se', phone: '0701234567', category: 'woman' });
  assert.deepEqual(p.members, [{ first: 'Zain', last: 'Khan-Ali', category: 'infant' }, { first: 'X', last: 'Y', category: '' }]);
  assert.equal(cleanPersonName('  A — B '), 'A - B');
});

// ── Demo mode ──────────────────────────────────────────────────────────────
test('demo mock stores and returns categories, counts infants like everyone else', async () => {
  const api = mk();
  const r = await api.attend(family());
  assert.deepEqual(r.people, [{ name: 'Ali Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }, { name: 'Zain Khan', category: 'infant' }]);
  assert.equal(r.partySize, 3);
  const row = api.rows()[0];
  assert.deepEqual([row.party_size, row.men, row.women, row.infants], [3, 1, 1, 1]);
  assert.deepEqual(await api.count(), { ok: true, guests: 3, households: 1 });
  // a missing category is rejected, nothing written
  assert.deepEqual(await api.attend(family({ members: [{ first: 'Sara', last: 'Khan' }] })), { ok: false, error: 'invalid' });
  assert.equal(api.rows().length, 1);
  // partial cancel keeps the remaining people's categories
  const c = await api.cancel({ lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Zain Khan'] });
  assert.deepEqual(c.remaining, ['Ali Khan', 'Sara Khan']);
  const neu = api.rows()[1];
  assert.deepEqual([neu.party_size, neu.men, neu.women, neu.infants], [2, 1, 1, 0]);
  assert.deepEqual(countCategories(neu.people), { men: 1, women: 1, infants: 0 });
});

test('demo mock: cap of 20 includes infants', async () => {
  const api = createMock({ storage: memStore(), latency: [0, 0], maxPartySize: 3 });
  const babies = (n) => Array.from({ length: n }, (_, i) => ({ first: 'Baby', last: `K${i}`, category: 'infant' }));
  assert.deepEqual(await api.attend(family({ members: babies(3) })), { ok: false, error: 'party_too_large' });
  assert.equal((await api.attend(family({ members: babies(2) }))).partySize, 3);
});

// ── Strings ────────────────────────────────────────────────────────────────
test('the three options, the legend, the hint and the validation message exist in all four languages', () => {
  for (const [code, T] of Object.entries({ en, sv, th, ur })) {
    for (const k of ['legend', 'man', 'woman', 'infant', 'hint']) assert.ok(T.form.category[k]?.trim(), `${code} form.category.${k}`);
    assert.ok(T.validation.category?.trim(), `${code} validation.category`);
    assert.match(T.form.category.infant, /0–3/, `${code}: infant label says 0–3`);
  }
  assert.deepEqual([en.form.category.man, en.form.category.woman, en.form.category.infant], ['Man', 'Woman', 'Child 0–3']);
  assert.match(en.validation.category, /^Choose man, woman or child 0–3/);
});

// ── The control itself (tiny fake DOM: enough for dom.js → h()) ────────────
function fakeDom() {
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.listeners = {}; this.textContent = '';
      const cls = new Set(); this.classList = { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) };
      this.checked = false; this.hidden = false; }
    set className(v) { v.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
    set innerHTML(v) { this._html = v; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; if (k === 'value') this.value = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    append(...c) { this.children.push(...c); }
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
    dispatch(ev) { (this.listeners[ev] || []).forEach((fn) => fn({ type: ev, target: this })); }
    focus() { globalThis.document.activeElement = this; }
  }
  globalThis.document = { createElement: (t) => new El(t), documentElement: new El('html'), activeElement: null };
}

test('createCategory: starts empty, required message on submit, cleared by a choice, focus goes to the first option', async () => {
  fakeDom();
  const { createCategory } = await import('../../src/rsvp/category.js');
  let changes = 0;
  const c = createCategory({ onChange: () => changes++ });
  assert.equal(c.value, '', 'starts empty');
  assert.equal(c.inputs.length, 3);
  assert.deepEqual(c.inputs.map((x) => [x.attrs.type, x.value]), [['radio', 'man'], ['radio', 'woman'], ['radio', 'infant']]);
  assert.equal(new Set(c.inputs.map((x) => x.attrs.name)).size, 1, 'one radio group per row');
  const fieldset = c.wrap.children[0];
  assert.equal(fieldset.tagName, 'FIELDSET');
  assert.equal(fieldset.attrs.role, 'radiogroup');
  assert.equal(fieldset.attrs['aria-required'], 'true');

  assert.equal(c.validate(), 'validation.category');
  assert.equal(fieldset.attrs['aria-invalid'], 'true');
  assert.ok(c.wrap.classList.contains('is-invalid'));
  const err = c.wrap.children[1];
  assert.equal(err.hidden, false);
  assert.equal(err.children[1].textContent, 'Choose man, woman or child 0–3.');
  c.focus();
  assert.equal(document.activeElement, c.inputs[0], 'focus on the first option');

  c.inputs[2].checked = true;
  c.inputs[2].dispatch('change');
  assert.equal(c.value, 'infant');
  assert.equal(c.error, '', 'message cleared by choosing');
  assert.equal(err.hidden, true);
  assert.equal(fieldset.attrs['aria-invalid'], undefined);
  assert.equal(changes, 1);
  c.focus();
  assert.equal(document.activeElement, c.inputs[2], 'focus on the chosen option');

  c.value = 'Woman';
  assert.equal(c.value, 'woman');
  c.value = 'nope';
  assert.equal(c.value, '');

  const main = createCategory({ categories: ['man', 'woman'] });
  assert.deepEqual(main.inputs.map((x) => x.value), ['man', 'woman'], 'main guest: no Child 0–3 option');
});

test('attend form wiring: every row has a category, validated in page order, sent and shown back', async () => {
  const src = await readFile(path.join(root, 'src/rsvp/attend.js'), 'utf8');
  assert.match(src, /category: createCategory\(\{ onChange: save, categories: MAIN_CATEGORIES \}\)/, 'Main guest row: Man · Woman only');
  assert.match(src, /const category = createCategory\(/, 'each member row');
  assert.match(src, /\[main\.first, main\.last, main\.category, main\.email, main\.phone,\s*\.\.\.members\.flatMap\(\(m\) => \[m\.first, m\.last, m\.category\]\), message\]/,
    'every row validated, in page order (focus goes to the first problem)');
  assert.match(src, /if \(f\.focus\) f\.focus\(\)/);
  assert.match(src, /category: main\.category\.value/);
  assert.match(src, /category: m\.category\.value/);
  assert.match(src, /CATEGORY_LABELS\[p\.category\]/, 'confirmation shows each category');
  const css = await readFile(path.join(root, 'src/styles/rsvp.css'), 'utf8');
  assert.match(css, /\.rsvp-seg__input:focus-visible/, 'visible keyboard focus');
  assert.match(css, /\.rsvp-seg__opt \{[^}]*min-block-size: 44px/, 'touch target');
});
