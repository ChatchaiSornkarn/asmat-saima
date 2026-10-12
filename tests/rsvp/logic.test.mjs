// RSVP pure-logic tests. Run from the repo root:   node --test tests/rsvp/
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePhone, isValidPhone } from '../../src/rsvp/phone.js';
import {
  cleanName, cleanEmail, isValidEmail, checkName, checkEmail, checkPhone, checkMessage,
  validateAttend, validateLookup, buildAttendPayload,
} from '../../src/rsvp/validate.js';
import { createMock, DEMO_KEY } from '../../src/rsvp/mock.js';
import { createApi } from '../../src/rsvp/api.js';

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};
const mk = (o = {}) => createMock({ storage: memStore(), latency: [0, 0], ...o });
const party0 = (over = {}) => ({
  action: 'attend', lang: 'en', side: 'asmat',
  main: { first: 'Asmat', last: 'Khan', email: 'a@x.se', phone: '070 123 45 67', category: 'man' },
  members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Omar', last: 'Khan', category: 'infant' }],
  message: 'No nuts please', website: '', ...over,
});
// Every person carries a category (issue 17); rows written without one default to man / woman.
const party = (over = {}) => {
  const b = party0(over);
  return { ...b, main: { category: 'man', ...b.main }, members: b.members.map((m) => ({ category: 'woman', ...m })) };
};

// ── Phone ──────────────────────────────────────────────────────────────────
test('normalisePhone: Swedish, 00, +, separators', () => {
  assert.equal(normalisePhone('070 123 45 67'), '+46701234567');
  assert.equal(normalisePhone('070-123.45.67'), '+46701234567');
  assert.equal(normalisePhone('(070) 123 45 67'), '+46701234567');
  assert.equal(normalisePhone('0046 70 123 45 67'), '+46701234567');
  assert.equal(normalisePhone('+46 70 123 45 67'), '+46701234567');
  assert.equal(normalisePhone('+46 (0)70 123 45 67'), '+46701234567');
  assert.equal(normalisePhone('031-12 34 56'), '+4631123456');
  assert.equal(normalisePhone('+66 81 234 5678'), '+66812345678');
  assert.equal(normalisePhone('+92 300 1234567'), '+923001234567');
  assert.equal(normalisePhone(' 070 123 45 67 '), '+46701234567');
});

test('isValidPhone accepts 07…/0…/+…/00…, rejects the rest', () => {
  for (const ok of ['0701234567', '070 123 45 67', '070-123 45 67', '031-123456', '+46 70 123 45 67', '0046701234567', '+66 81 234 5678', '+92-300-1234567', '+1 (415) 555-0100'])
    assert.ok(isValidPhone(ok), ok);
  for (const bad of ['', '   ', '701234567', '46701234567', '07012', '+46', '070 12a 45 67', 'phone', '+0701234567', '++46701234567', '+46 70 123 45 67 89 01 23', '07 01 23'])
    assert.ok(!isValidPhone(bad), bad);
});

// ── Text cleaning & validation ────────────────────────────────────────────
test('cleanName trims and collapses whitespace', () => {
  assert.equal(cleanName('  Sara   Khan '), 'Sara Khan');
  assert.equal(cleanName('Anna  Maria\t'), 'Anna Maria');
  assert.equal(cleanName(null), '');
  assert.equal(cleanEmail(' a @x.se '), 'a@x.se');
});

test('email validation', () => {
  for (const ok of ['a@x.se', 'first.last+tag@mail.co.uk', 'ÅSA@exempel.se', ' a@x.se ']) assert.ok(isValidEmail(ok), ok);
  for (const bad of ['', 'a', 'a@', '@x.se', 'a@x', 'a@x.', 'a@.se', 'a@@x.se', 'a@x..se', 'a@x.s']) assert.ok(!isValidEmail(bad), bad);
  assert.equal(checkEmail(''), 'validation.required');
  assert.equal(checkEmail('nope'), 'validation.email');
  assert.equal(checkEmail('a'.repeat(250) + '@x.se'), 'validation.tooLong');
});

test('field checks return i18n keys', () => {
  assert.equal(checkName('   '), 'validation.required');
  assert.equal(checkName('x'.repeat(81)), 'validation.tooLong');
  assert.equal(checkName(' Ok '), '');
  assert.equal(checkPhone(''), 'validation.required');
  assert.equal(checkPhone('12345'), 'validation.phone');
  assert.equal(checkPhone('0701234567'), '');
  assert.equal(checkMessage('x'.repeat(1001)), 'validation.tooLong');
  assert.equal(checkMessage('x'.repeat(1000)), '');
});

test('validateAttend reports paths, cap', () => {
  const v = validateAttend({ main: { first: ' ', last: 'K', email: 'bad', phone: '123', category: 'man' }, members: [{ first: 'A', last: '', category: 'infant' }], message: '' });
  assert.equal(v.ok, false);
  assert.deepEqual(v.errors, { 'main.first': 'validation.required', 'main.email': 'validation.email', 'main.phone': 'validation.phone', 'members.0.last': 'validation.required' });
  assert.equal(validateAttend(party()).ok, true);
  const big = party({ members: Array.from({ length: 19 }, (_, i) => ({ first: `M${i}`, last: 'K' })) });
  assert.equal(validateAttend(big, 20).ok, true);   // 1 + 19 = 20
  big.members.push({ first: 'X', last: 'K' });
  assert.equal(validateAttend(big, 20).tooLarge, true);
  assert.equal(validateLookup({ email: 'a@x.se', phone: '0701234567' }).ok, true);
  assert.deepEqual(validateLookup({ email: '', phone: 'x' }).errors, { email: 'validation.required', phone: 'validation.phone' });
});

test('buildAttendPayload cleans values into the exact contract', () => {
  const p = buildAttendPayload({ main: { first: ' Asmat  ', last: 'Khan', email: ' a@x.se ', phone: ' 070 123 45 67 ', category: 'man' }, members: [{ first: ' Sara ', last: ' Khan', category: 'woman' }], message: ' hi\r\n ', website: '' }, 'sv');
  assert.deepEqual(p, { action: 'attend', lang: 'sv', main: { first: 'Asmat', last: 'Khan', email: 'a@x.se', phone: '070 123 45 67', category: 'man' }, members: [{ first: 'Sara', last: 'Khan', category: 'woman' }], message: 'hi', website: '' });
});

// ── Mock backend state machine ────────────────────────────────────────────
test('mock: attend → resubmit by email → by phone → lookup needs both → partial → full cancel → count', async () => {
  const api = mk();
  let r = await api.attend(party());
  assert.deepEqual(r, { ok: true, partySize: 3, names: ['Asmat Khan', 'Sara Khan', 'Omar Khan'],
    people: [{ name: 'Asmat Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }, { name: 'Omar Khan', category: 'infant' }], replaced: false });
  assert.deepEqual(await api.count(), { ok: true, guests: 3, households: 1 });

  // Another household
  await api.attend(party({ main: { first: 'Lina', last: 'Berg', email: 'lina@y.se', phone: '+46 73 000 00 00' }, members: [] }));
  assert.deepEqual(await api.count(), { ok: true, guests: 4, households: 2 });

  // Resubmit with same email (different phone) + an extra member → replaces
  r = await api.attend(party({ main: { first: 'Asmat', last: 'Khan', email: 'A@X.SE', phone: '0709999999' }, members: [{ first: 'Sara', last: 'Khan' }, { first: 'Omar', last: 'Khan' }, { first: 'Zara', last: 'Khan' }] }));
  assert.equal(r.replaced, true); assert.equal(r.partySize, 4);
  assert.deepEqual(await api.count(), { ok: true, guests: 5, households: 2 });

  // Resubmit with the same phone written differently (different email) → replaces
  r = await api.attend(party({ main: { first: 'Asmat', last: 'Khan', email: 'new@x.se', phone: '+46 70 999 99 99' }, members: [{ first: 'Sara', last: 'Khan' }] }));
  assert.equal(r.replaced, true); assert.equal(r.partySize, 2);
  assert.deepEqual(await api.count(), { ok: true, guests: 3, households: 2 });

  // Lookup needs BOTH
  assert.deepEqual(await api.lookup('new@x.se', '0701234567'), { ok: false, error: 'not_found' });
  assert.deepEqual(await api.lookup('a@x.se', '0709999999'), { ok: false, error: 'not_found' });   // superseded email
  assert.deepEqual((await api.lookup('NEW@x.se', '0046 70 999 99 99')).names, ['Asmat Khan', 'Sara Khan']);
  assert.deepEqual(await api.lookup('', ''), { ok: false, error: 'not_found' });

  // Partial cancel
  r = await api.cancel({ action: 'cancel', lang: 'en', email: 'new@x.se', phone: '0709999999', cancel: ['Sara Khan'], message: '', website: '' });
  assert.deepEqual(r, { ok: true, cancelled: ['Sara Khan'], remaining: ['Asmat Khan'], status: 'active' });
  assert.deepEqual((await api.lookup('new@x.se', '0709999999')).names, ['Asmat Khan']);
  assert.deepEqual(await api.count(), { ok: true, guests: 2, households: 2 });

  // Cancel with unknown name / nothing selected → invalid, no write
  assert.deepEqual(await api.cancel({ email: 'new@x.se', phone: '0709999999', cancel: ['Nobody'] }), { ok: false, error: 'invalid' });
  assert.deepEqual(await api.cancel({ email: 'new@x.se', phone: '0709999999', cancel: [] }), { ok: false, error: 'invalid' });
  // Wrong combination → not_found
  assert.deepEqual(await api.cancel({ email: 'lina@y.se', phone: '0709999999', all: true }), { ok: false, error: 'not_found' });

  // Full cancel
  r = await api.cancel({ email: 'new@x.se', phone: '0709999999', all: true, message: 'Sorry' });
  assert.deepEqual(r, { ok: true, cancelled: ['Asmat Khan'], remaining: [], status: 'cancelled' });
  assert.deepEqual(await api.lookup('new@x.se', '0709999999'), { ok: false, error: 'not_found' });
  assert.deepEqual(await api.count(), { ok: true, guests: 1, households: 1 });

  // Row history is append-only with the right statuses
  const rows = api.rows();
  assert.deepEqual(rows.map((x) => `${x.type}:${x.status}:${x.party_size}`), [
    'attend:superseded:3', 'attend:active:1', 'attend:superseded:4', 'attend:superseded:2', 'cancel:superseded:1', 'cancel:cancelled:0',
  ]);
  assert.equal(rows[5].note, 'Cancelled: Asmat Khan');
  assert.equal(rows[1].phone, '+46730000000');

  // A cancelled household can RSVP again
  r = await api.attend(party());
  assert.equal(r.ok, true); assert.equal(r.replaced, false);
});

test('mock: party cap, invalid data, honeypot', async () => {
  const api = mk({ maxPartySize: 3 });
  assert.deepEqual(await api.attend(party({ members: [{ first: 'a', last: 'b' }, { first: 'c', last: 'd' }, { first: 'e', last: 'f' }] })), { ok: false, error: 'party_too_large' });
  assert.deepEqual(await api.attend(party({ main: { first: 'A', last: 'B', email: 'nope', phone: '0701234567' } })), { ok: false, error: 'invalid' });
  assert.deepEqual(await api.attend(party({ website: 'http://spam' })), { ok: true });
  assert.equal(api.rows().length, 0);
});

test('mock: duplicate names cancel one at a time; state persists in storage', async () => {
  const storage = memStore();
  const a = createMock({ storage, latency: [0, 0] });
  await a.attend(party({ members: [{ first: 'Sara', last: 'Khan' }, { first: 'Sara', last: 'Khan' }] }));
  const r = await a.cancel({ email: 'a@x.se', phone: '0701234567', cancel: ['Sara Khan'] });
  assert.deepEqual(r.remaining, ['Asmat Khan', 'Sara Khan']);
  assert.ok(storage.getItem(DEMO_KEY));
  const b = createMock({ storage, latency: [0, 0] });             // a new page load
  assert.deepEqual((await b.lookup('a@x.se', '0701234567')).names, ['Asmat Khan', 'Sara Khan']);
  b.reset();
  assert.equal(storage.getItem(DEMO_KEY), null);
  storage.setItem(DEMO_KEY, '{corrupt');
  assert.deepEqual(await b.count(), { ok: true, guests: 0, households: 0 });
});

test('mock: simulated latency is within 500–900 ms by default', async () => {
  const api = createMock({ storage: memStore() });
  const t0 = Date.now(); await api.count(); const dt = Date.now() - t0;
  assert.ok(dt >= 490 && dt < 1100, `latency ${dt}`);
});

// ── Real API client (fetch injected) ──────────────────────────────────────
const cfg = { appsScriptUrl: 'https://script.google.com/macros/s/X/exec', maxPartySize: 20 };
const jsonRes = (obj, status = 200) => ({ status, type: 'cors', json: async () => obj });

test('api: POST is text/plain JSON, follows redirects, parses JSON', async () => {
  const calls = [];
  const api = createApi(cfg, { fetch: async (u, init) => { calls.push([u, init]); return jsonRes({ ok: true, partySize: 1, names: ['A B'], replaced: false }); } });
  const r = await api.attend(party());
  assert.equal(r.ok, true); assert.equal(r.partySize, 1);
  const [u, init] = calls[0];
  assert.equal(u, cfg.appsScriptUrl);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(init.redirect, 'follow');
  assert.equal(JSON.parse(init.body).action, 'attend');
  assert.ok(init.signal);
});

test('api: CORS failure falls back to no-cors → opaque success; total failure → network', async () => {
  const modes = [];
  let api = createApi(cfg, { fetch: async (u, init) => { modes.push(init.mode || 'cors'); if (!init.mode) throw new TypeError('Failed to fetch'); return { type: 'opaque', status: 0 }; } });
  assert.deepEqual(await api.cancel({ email: 'a@x.se', phone: '0701234567', all: true }), { ok: true, opaque: true });
  assert.deepEqual(modes, ['cors', 'no-cors']);
  api = createApi(cfg, { fetch: async () => { throw new TypeError('Failed to fetch'); } });
  assert.deepEqual(await api.attend(party()), { ok: false, error: 'network' });
});

test('api: server errors, error codes, timeouts, GET params', async () => {
  let api = createApi(cfg, { fetch: async () => jsonRes({ ok: false, error: 'party_too_large' }) });
  assert.deepEqual(await api.attend(party()), { ok: false, error: 'party_too_large' });
  api = createApi(cfg, { fetch: async () => jsonRes({ ok: false, error: 'weird' }) });
  assert.deepEqual(await api.attend(party()), { ok: false, error: 'server' });
  api = createApi(cfg, { fetch: async () => jsonRes({}, 500) });
  assert.deepEqual(await api.count(), { ok: false, error: 'server' });
  api = createApi(cfg, { fetch: async () => ({ status: 200, type: 'cors', json: async () => { throw new SyntaxError('html'); } }) });
  assert.deepEqual(await api.lookup('a@x.se', '070'), { ok: false, error: 'server' });
  // timeout → network (and the abort signal is honoured)
  api = createApi(cfg, { timeout: 30, fetch: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  assert.deepEqual(await api.count(), { ok: false, error: 'network' });
  assert.deepEqual(await api.attend(party()), { ok: false, error: 'network' });
  // GET query string
  let seen;
  api = createApi(cfg, { fetch: async (u) => { seen = new URL(u); return jsonRes({ ok: true, names: ['A'] }); } });
  await api.lookup(' a@x.se ', '+46 70 123');
  assert.equal(seen.searchParams.get('action'), 'lookup');
  assert.equal(seen.searchParams.get('email'), 'a@x.se');
  assert.equal(seen.searchParams.get('phone'), '+46 70 123');
});

test('api: empty appsScriptUrl → demo mock', async () => {
  const api = createApi({ appsScriptUrl: '', maxPartySize: 20 }, { storage: memStore(), latency: [0, 0] });
  assert.equal(api.demo, true);
  assert.deepEqual(await api.count(), { ok: true, guests: 0, households: 0 });
});
