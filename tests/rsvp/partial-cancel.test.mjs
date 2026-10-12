// Partial cancel keeps category counts right (2_main_idea issue 18, design Q4) — demo mock + cancel-form helpers.
//   node --test 'tests/rsvp/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createMock, findPerson, UNTAGGED_NOTE, DEMO_KEY } from '../../src/rsvp/mock.js';
import { lookupPeople, cancelEntries, pickerTagKeys } from '../../src/rsvp/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const mk = (storage = memStore()) => createMock({ storage, latency: [0, 0] });
const family = (members = [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Zain', last: 'Khan', category: 'infant' }]) => ({
  action: 'attend', lang: 'en', side: 'saima', main: { first: 'Ali', last: 'Khan', email: 'a@x.se', phone: '070 123 45 67', category: 'man' }, members, message: '', website: '',
});
const COUNTS = (r) => [r.party_size, r.men, r.women, r.infants];
const cancel = (api, list, extra = {}) => api.cancel({ lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: list, ...extra });

test('demo: cancelling the infant from a 1/1/1 Party → 2 / 1 / 1 / 0, tags kept, invariant holds', async () => {
  const api = mk();
  await api.attend(family());
  const look = await api.lookup('a@x.se', '0701234567');
  assert.deepEqual(look, { ok: true, names: ['Ali Khan', 'Sara Khan', 'Zain Khan'],
    people: [{ name: 'Ali Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }, { name: 'Zain Khan', category: 'infant' }] });
  const r = await cancel(api, cancelEntries([lookupPeople(look)[2]]));
  assert.deepEqual(r, { ok: true, cancelled: ['Zain Khan'], remaining: ['Ali Khan', 'Sara Khan'], status: 'active' });
  const neu = api.rows()[1];
  assert.deepEqual(COUNTS(neu), [2, 1, 1, 0]);
  assert.equal(neu.party_size, neu.men + neu.women + neu.infants);
  assert.deepEqual(neu.people, [{ name: 'Ali Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }]);
  assert.equal(neu.note, 'Cancelled: Zain Khan');
});

test('demo: same name, different category — the ticked one drops; a plain name drops the first', async () => {
  const twins = [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Sara', last: 'Khan', category: 'infant' }];
  const api = mk();
  await api.attend(family(twins));
  await cancel(api, [{ name: 'Sara Khan', category: 'infant' }]);
  assert.deepEqual(api.rows()[1].people.map((p) => p.category), ['man', 'woman']);
  assert.deepEqual(COUNTS(api.rows()[1]), [2, 1, 1, 0]);
  const old = mk();
  await old.attend(family(twins));
  await cancel(old, ['Sara Khan']);
  assert.deepEqual(COUNTS(old.rows()[1]), [2, 1, 0, 1]);
  assert.deepEqual(await cancel(old, [{ name: 'Sara Khan', category: 'boy' }]), { ok: false, error: 'invalid' });
});

test('demo: a full cancel still marks the Party cancelled', async () => {
  const api = mk();
  await api.attend(family());
  const r = await cancel(api, cancelEntries(lookupPeople(await api.lookup('a@x.se', '0701234567'))), { all: true });
  assert.equal(r.status, 'cancelled');
  assert.deepEqual(COUNTS(api.rows()[1]), [0, 0, 0, 0]);
  assert.deepEqual(await api.lookup('a@x.se', '0701234567'), { ok: false, error: 'not_found' });
});

test('demo: rows saved without categories still cancel, and the new row is flagged', async () => {
  const storage = memStore();
  storage.setItem(DEMO_KEY, JSON.stringify({ rows: [{ type: 'attend', email: 'a@x.se', phone: '+46701234567', party_size: 2, names: ['Ali Khan', 'Aunt Rubina'], status: 'active' }] }));
  const api = mk(storage);
  assert.deepEqual((await api.lookup('a@x.se', '0701234567')).people, [{ name: 'Ali Khan', category: '' }, { name: 'Aunt Rubina', category: '' }]);
  await cancel(api, ['Ali Khan']);
  const neu = api.rows()[1];
  assert.deepEqual(COUNTS(neu), [1, 0, 0, 0]);
  assert.match(neu.note, new RegExp(UNTAGGED_NOTE));
});

test('demo: a duplicate { name, category } never falls back to a same-name person of another category', async () => {
  const api = mk();
  await api.attend(family([{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Sara', last: 'Khan', category: 'infant' }]));
  assert.deepEqual(await cancel(api, [{ name: 'Sara Khan', category: 'infant' }, { name: 'Sara Khan', category: 'infant' }]), { ok: false, error: 'invalid' });
  assert.equal(api.rows().length, 1, 'nothing written');
  assert.equal(api.rows()[0].status, 'active');
  assert.deepEqual((await cancel(api, [{ name: 'Sara Khan', category: 'infant' }, { name: 'Sara Khan', category: 'man' }])).remaining, ['Ali Khan']);
});

test('demo: bad cancel entries → invalid, nothing written (same cases as the script)', async () => {
  const api = mk();
  await api.attend(family());
  for (const bad of [[{ name: 'Zain Khan', category: 'boy' }], [{ name: '' }], [{ category: 'infant' }], [['Zain Khan']], [{ name: 'Nobody', category: 'man' }],
    [{ name: 'Zain Khan', category: 'infant' }, { name: 'Zain Khan', category: 'infant' }],
    [{ name: { first: 'Zain' }, category: 'infant' }], [42], [{ name: 'Z'.repeat(162), category: 'infant' }], ['Z'.repeat(162)]]) {
    assert.deepEqual(await cancel(api, bad), { ok: false, error: 'invalid' }, JSON.stringify(bad));
  }
  assert.equal(api.rows().length, 1);
  assert.equal(api.rows()[0].status, 'active');
});

test('findPerson: exact match first, then name; -1 when missing', () => {
  const ppl = [{ name: 'Sara Khan', category: 'woman' }, { name: 'Sara Khan', category: 'infant' }];
  assert.equal(findPerson(ppl, { name: 'Sara Khan', category: 'infant' }), 1);
  assert.equal(findPerson(ppl, { name: 'Sara Khan', category: '' }), 0);
  assert.equal(findPerson(ppl, { name: 'Sara Khan', category: 'man' }), 0);
  assert.equal(findPerson(ppl, { name: 'Nobody', category: 'man' }), -1);
  assert.equal(findPerson([ppl[0]], { name: 'Sara Khan', category: 'infant' }, ppl), -1, 'the infant was in the original Party: no fallback');
  assert.equal(findPerson([ppl[0]], { name: 'Sara Khan', category: 'man' }, ppl), 0, 'no one had that tag: fall back to the name');
});

test('lookupPeople / cancelEntries: people when sent, plain names otherwise; untagged sent as a plain name', () => {
  assert.deepEqual(lookupPeople({ ok: true, names: ['A B', 'C D'] }), [{ name: 'A B', category: '' }, { name: 'C D', category: '' }]);
  assert.deepEqual(lookupPeople({ ok: true, names: ['A B'], people: [{ name: 'A B', category: 'Woman' }] }), [{ name: 'A B', category: 'woman' }]);
  assert.deepEqual(lookupPeople({ ok: true, names: ['A B', 'C D'], people: [{ name: 'A B', category: 'man' }] }).map((p) => p.category), ['', ''], 'mismatched lengths → names');
  assert.deepEqual(lookupPeople({ ok: true, names: ['A B'], people: [{ name: { x: 1 }, category: 'man' }] }), [{ name: 'A B', category: 'man' }], 'non-string name → names[i]');
  assert.deepEqual(cancelEntries([{ name: 'A B', category: 'man' }, { name: 'C D', category: '' }]), [{ name: 'A B', category: 'man' }, 'C D']);
});

test('cancel form: list shows names only, boxes index-aligned with { name, category }, sent via cancelEntries', async () => {
  const src = await readFile(path.join(root, 'src/rsvp/cancel.js'), 'utf8');
  assert.match(src, /buildPicker\(lookupPeople\(res\)\)/);
  assert.match(src, /people\.map\(\(\{ name \}, i\) =>/);
  assert.match(src, /h\('bdi', \{ class: 'rsvp-check__text', text: name \}\)/, 'only the name is shown');
  assert.match(src, /cancelEntries\(chosenPeople\)/);
});

test('demo: a cancel by { name, category } keeps the Party\'s side (issues 15/16 + 18)', async () => {
  const api = mk();
  await api.attend(family());
  await cancel(api, [{ name: 'Zain Khan', category: 'infant' }]);
  await cancel(api, [{ name: 'Sara Khan', category: 'woman' }]);
  assert.deepEqual(api.rows().map((r) => [r.type, r.status, r.side, ...COUNTS(r)]), [
    ['attend', 'superseded', 'saima', 3, 1, 1, 1],
    ['cancel', 'superseded', 'saima', 2, 1, 1, 0],
    ['cancel', 'active', 'saima', 1, 1, 0, 0],
  ]);
});

test('cancel list: a name that appears twice shows its category label; unique names and untagged lines do not', () => {
  const keys = pickerTagKeys([
    { name: 'Ali Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }, { name: 'Sara Khan', category: 'infant' },
    { name: 'Omar', category: '' }, { name: 'Omar', category: 'man' },
  ]);
  assert.deepEqual(keys, ['', 'form.category.woman', 'form.category.infant', '', 'form.category.man']);
  assert.deepEqual(pickerTagKeys([]), []);
});

test('cancel picker renders the tag as text via i18n (no innerHTML), and the keys exist in every language', async () => {
  const src = await readFile(path.join(root, 'src/rsvp/cancel.js'), 'utf8');
  assert.match(src, /pickerTagKeys\(people\)/);
  assert.match(src, /h\('span', \{ class: 'rsvp-check__tag', i18n: tags\[i\] \}\)/);
  for (const lang of ['en', 'sv', 'th', 'ur']) {
    const { default: S } = await import(`../../src/i18n/${lang}.js`);
    for (const c of ['man', 'woman', 'infant']) assert.ok(S.form.category[c], `${lang} form.category.${c}`);
  }
});
