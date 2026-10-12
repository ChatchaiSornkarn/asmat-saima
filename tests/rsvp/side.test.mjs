// Side from the link (2_main_idea issue 15, design Q1): ?side= parsing, attend payload, demo mock, wiring.
//   node --test 'tests/rsvp/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SIDES, cleanSide, sideFromSearch, sideFromUrl } from '../../src/rsvp/side.js';
import { buildAttendPayload } from '../../src/rsvp/validate.js';
import { createMock } from '../../src/rsvp/mock.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
// Every person carries a category (issue 17); the mock rejects a Party without one.
const party = (over = {}) => ({
  action: 'attend', lang: 'en',
  main: { first: 'Asmat', last: 'Khan', email: 'a@x.se', phone: '070 123 45 67', category: 'man' },
  side: 'asmat', members: [{ first: 'Sara', last: 'Khan', category: 'woman' }], message: '', website: '', ...over,
});
const values = { main: { first: 'Asmat', last: 'Khan', email: 'a@x.se', phone: '070 123 45 67' }, members: [], message: '', website: '' };

test('SIDES are exactly asmat and saima', () => {
  assert.deepEqual([...SIDES], ['asmat', 'saima']);
});

test('cleanSide: any case and stray spaces → asmat / saima; anything else → empty', () => {
  for (const [v, want] of [['asmat', 'asmat'], ['saima', 'saima'], ['SAIMA', 'saima'], ['Asmat', 'asmat'], [' saima ', 'saima']]) {
    assert.equal(cleanSide(v), want, v);
  }
  for (const v of [undefined, null, '', 'both', 'asmatt', 'sa ima', 'asmat,saima', 1, true, ['asmat'], {}]) {
    assert.equal(cleanSide(v), '', JSON.stringify(v));
  }
});

test('sideFromSearch: reads ?side= alone and alongside ?lang= in either order', () => {
  assert.equal(sideFromSearch('?side=asmat'), 'asmat');
  assert.equal(sideFromSearch('?side=SAIMA'), 'saima');
  assert.equal(sideFromSearch('?side=saima&lang=ur'), 'saima');
  assert.equal(sideFromSearch('?lang=ur&side=Saima'), 'saima');
  assert.equal(sideFromSearch('?lang=sv&open=1&side=asmat'), 'asmat');
  assert.equal(sideFromSearch(new URLSearchParams('side=asmat&lang=th')), 'asmat');
  assert.equal(sideFromSearch('side=saima'), 'saima', 'without the leading ?');
});

test('sideFromSearch: bare or invalid link → empty (the form then asks, issue 16)', () => {
  for (const s of ['', '?', '?lang=ur', '?side=', '?side=both', '?side=asmat%20saima', '?Side=asmat', undefined, null]) {
    assert.equal(sideFromSearch(s), '', String(s));
  }
  // Only the first ?side= counts (URLSearchParams.get).
  assert.equal(sideFromSearch('?side=saima&side=asmat'), 'saima');
});

test('sideFromUrl: uses location.search; empty outside a browser', () => {
  assert.equal(sideFromUrl({ search: '?side=saima&lang=ur' }), 'saima');
  assert.equal(sideFromUrl({ search: '' }), '');
  assert.equal(sideFromUrl(null), '');
  assert.equal(sideFromUrl(), '', 'node has no location');
});

test('?side=saima&lang=ur: the language is still read as Urdu by the same query string', () => {
  const q = new URLSearchParams('?side=saima&lang=ur');
  assert.equal(q.get('lang'), 'ur');
  assert.equal(sideFromSearch(q), 'saima');
});

test('buildAttendPayload: includes a valid side; omits a missing or invalid one', () => {
  assert.equal(buildAttendPayload(values, 'ur', 'saima').side, 'saima');
  assert.equal(buildAttendPayload(values, 'en', 'ASMAT').side, 'asmat');
  for (const s of [undefined, '', 'both']) {
    const p = buildAttendPayload(values, 'en', s);
    assert.ok(!('side' in p), String(s));
  }
  assert.ok(!('side' in buildAttendPayload(values, 'en')), 'no third argument');
});

test('demo mock: stores side; cancel keeps the Party\'s side', async () => {
  const mock = createMock({ storage: memStore(), latency: [0, 0] });
  assert.equal((await mock.attend(party({ side: 'SAIMA', members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Ali', last: 'Khan', category: 'man' }] }))).ok, true);
  assert.equal(mock.rows()[0].side, 'saima');
  assert.equal((await mock.cancel({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Ali Khan'], side: 'asmat' })).ok, true);
  assert.deepEqual(mock.rows().map((r) => [r.type, r.status, r.side]), [['attend', 'superseded', 'saima'], ['cancel', 'active', 'saima']]);
  // …and the cancel row recounts the categories of the people left (issue 17).
  assert.deepEqual(mock.rows().map((r) => [r.party_size, r.men, r.women, r.infants]), [[3, 2, 1, 0], [2, 1, 1, 0]]);

  // Missing/invalid side: rejected by the mock since issue 16 (tests/rsvp/side-choice.test.mjs).
});

test('wiring: read once in rsvp/index.js, passed to attend only, never rendered', async () => {
  const index = await readFile(path.join(root, 'src/rsvp/index.js'), 'utf8');
  assert.equal(index.match(/sideFromUrl\(/g)?.length, 1, 'read once on load');
  assert.match(index, /createAttend\(\{ api, config, side,/);
  assert.doesNotMatch(index, /createCancel\([^)]*side/, 'cancel never sends a side');
  const attend = await readFile(path.join(root, 'src/rsvp/attend.js'), 'utf8');
  // The link's side decides whether the choice is shown and wins over it (issue 16); it is never rendered.
  assert.match(attend, /buildAttendPayload\(v, getLang\(\), resolveSide\(side, v\.side\)\)/);
  assert.match(attend, /needsSideChoice\(side\) \? createSideChoice\(/);
  assert.doesNotMatch(index + attend, /(textContent|innerHTML|value)\s*=\s*side\b|h\([^)]*[{,]\s*side\b/);
  const cancel = await readFile(path.join(root, 'src/rsvp/cancel.js'), 'utf8');
  assert.doesNotMatch(cancel, /\bside\b/i);
});
