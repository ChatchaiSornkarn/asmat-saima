// Late replies (2_main_idea issue 14, design Q9): notice after the deadline, `late` flag in demo mode.
//   node --test 'tests/rsvp/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import config from '../../config.js';
import { isLate, isOpen } from '../../src/rsvp/deadline.js';
import { createMock } from '../../src/rsvp/mock.js';
import { createApi } from '../../src/rsvp/api.js';
import en from '../../src/i18n/en.js';
import sv from '../../src/i18n/sv.js';
import th from '../../src/i18n/th.js';
import ur from '../../src/i18n/ur.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const D = config.rsvpDeadline;
const BEFORE = new Date('2026-11-06T22:59:59Z');   // 23:59:59 on 6 Nov, Göteborg
const AFTER = new Date('2026-11-06T23:00:00Z');    // 00:00 on 7 Nov, Göteborg

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const party0 = (over = {}) => ({
  action: 'attend', lang: 'en',
  main: { first: 'Asmat', last: 'Khan', email: 'a@x.se', phone: '070 123 45 67', category: 'man' },
  side: 'asmat', members: [{ first: 'Sara', last: 'Khan', category: 'woman' }], message: '', website: '', ...over,
});
// Every person carries a category (issue 17); rows written without one default to man / woman.
const party = (over = {}) => {
  const b = party0(over);
  return { ...b, main: { category: 'man', ...b.main }, members: b.members.map((m) => ({ category: 'woman', ...m })) };
};

test('isLate: false until the end of 6 November (Göteborg), true after; the exact opposite of isOpen', () => {
  assert.equal(isLate(D, 'Europe/Stockholm', new Date('2026-10-12T10:00:00Z')), false);
  assert.equal(isLate(D, 'Europe/Stockholm', BEFORE), false);
  assert.equal(isLate(D, 'Europe/Stockholm', AFTER), true);
  assert.equal(isLate(D, 'Europe/Stockholm', new Date('2026-12-13T10:00:00Z')), true);
  assert.equal(isLate(D, undefined, AFTER), true, 'defaults to Stockholm');
  for (const t of [BEFORE, AFTER]) assert.equal(isLate(D, 'Europe/Stockholm', t), !isOpen(D, 'Europe/Stockholm', t));
});

test('isLate: no deadline or a bad one → never late (no notice, nothing flagged)', () => {
  for (const iso of [null, undefined, '', '6/11/2026']) assert.equal(isLate(iso, 'Europe/Stockholm', AFTER), false, String(iso));
});

test('late notice: in all four languages, says it is late and that you will confirm', () => {
  assert.equal(en.rsvp.late, 'Late reply: we will confirm with you whether we can still fit you in.');
  const expect = { sv: /Sent svar/, th: /หลังกำหนด/, ur: /تاخیر سے جواب/ };
  for (const [lang, s] of Object.entries({ sv, th, ur })) {
    assert.equal(typeof s.rsvp.late, 'string', lang);
    assert.match(s.rsvp.late, expect[lang], lang);
    assert.notEqual(s.rsvp.late, en.rsvp.late, `${lang} is translated`);
  }
});

test('late notice: wired into the "We\'re coming" panel and re-checked on tab change and language change', async () => {
  const src = await readFile(path.join(root, 'src/rsvp/index.js'), 'utf8');
  assert.match(src, /i18n: 'rsvp\.late'/);
  assert.match(src, /isLate\(config\.rsvpDeadline, config\.timeZone\)/);
  assert.match(src, /panels\.attend\.append\(late, attend\.el\)/, 'notice sits above the form, form stays');
  const css = await readFile(path.join(root, 'src/styles/rsvp.css'), 'utf8');
  assert.match(css, /\.rsvp__late\[hidden\] \{ display: none; \}/);
});

test('demo mock: attend after the deadline is accepted and stored with late: true', async () => {
  let now = BEFORE.toISOString();
  const mock = createMock({ storage: memStore(), latency: [0, 0], rsvpDeadline: D, timeZone: 'Europe/Stockholm', now: () => now });
  assert.equal((await mock.attend(party())).ok, true);
  assert.equal(mock.rows()[0].late, false, 'on time');
  now = AFTER.toISOString();
  const r = await mock.attend(party({ members: [] }));
  assert.deepEqual(r, { ok: true, partySize: 1, names: ['Asmat Khan'], people: [{ name: 'Asmat Khan', category: 'man' }], replaced: true });
  assert.deepEqual(mock.rows().map((x) => [x.status, x.late]), [['superseded', false], ['active', true]]);
  assert.deepEqual(await mock.count(), { ok: true, guests: 1, households: 1 });
});

test('demo mock: cancel after the deadline still works; the remaining row keeps the late flag', async () => {
  let now = AFTER.toISOString();
  const mock = createMock({ storage: memStore(), latency: [0, 0], rsvpDeadline: D, now: () => now });
  await mock.attend(party({ members: [{ first: 'Sara', last: 'Khan' }, { first: 'Ali', last: 'Khan' }] }));
  now = '2026-11-20T10:00:00Z';
  const p = await mock.cancel({ lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Ali Khan'] });
  assert.equal(p.ok, true);
  assert.equal(mock.rows()[1].late, true);
  const f = await mock.cancel({ lang: 'en', email: 'a@x.se', phone: '0701234567', all: true });
  assert.deepEqual(f.status, 'cancelled');
});

test('demo mock: no deadline → never late', async () => {
  const mock = createMock({ storage: memStore(), latency: [0, 0], now: () => AFTER.toISOString() });
  await mock.attend(party());
  assert.equal(mock.rows()[0].late, false);
});

test('demo api (appsScriptUrl \'\') passes config.rsvpDeadline and timeZone to the mock', async () => {
  const storage = memStore();
  const api = createApi({ ...config, appsScriptUrl: '' }, { storage, latency: [0, 0], now: () => AFTER.toISOString() });
  assert.equal(api.demo, true);
  assert.equal((await api.attend(party())).ok, true);
  const rows = JSON.parse(storage.getItem('asmat-saima-demo')).rows;
  assert.equal(rows[0].late, true);
});
