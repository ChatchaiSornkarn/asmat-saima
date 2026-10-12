// Tests for the Apps Script backend (apps-script/*.gs), run in Node with mocked Apps Script services.
//   node --test 'tests/apps-script/*.test.mjs'        (from the asmat-saima folder; Node 22+)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createBackend, attendBody } from './harness.mjs';

const fresh = (opts) => { const b = createBackend(opts); b.setup(); b.mails.length = 0; return b; };
const active = (b) => b.rows().filter((r) => r.status === 'active');
const guestMails = (b, to) => b.mails.filter((m) => m.to === to);
const ownerMails = (b) => b.mails.filter((m) => m.to === 'owner@example.com');
const HEADERS = ['timestamp', 'type', 'email', 'phone', 'side', 'party_size', 'men', 'women', 'infants', 'names', 'message', 'language',
  'status', 'replaces', 'late', 'note'];
// Attend body with a given side (undefined = no `side` key at all, as a bare link would send pre-issue 16).
const sideParty = (side, over = {}) => {
  const body = attendBody({ members: ['Sara Khan'], ...over });
  if (side === undefined) delete body.side; else body.side = side;
  return body;
};
// 1-based column number and A1 column range of an RSVPs header, e.g. R('status') → 'RSVPs!M2:M'.
// Tests find columns by header name only, so a new column never shifts a hard-coded letter.
const C = (h) => { const i = HEADERS.indexOf(h); if (i < 0) throw new Error('unknown header ' + h); return i + 1; };
const R = (h) => { const L = String.fromCharCode(64 + C(h)); return `RSVPs!${L}2:${L}`; };

// ─────────────────────────────────────────────────────────────────────────────
describe('setup()', () => {
  test('creates the three tabs with the exact RSVPs header, frozen', () => {
    const b = createBackend();
    b.setup();
    assert.deepEqual(b.header(), HEADERS);
    assert.equal(b.sheet('RSVPs').frozen, 1);
    assert.deepEqual(b.ss.sheets.map((s) => s.name), ['Summary', 'Guests', 'RSVPs'], 'empty Sheet1 removed, tabs ordered');
  });

  test('writes default Script Properties, owner = deploying user, never overwrites edits', () => {
    const b = createBackend({ props: { MAX_PARTY: '8' } });
    b.setup();
    assert.equal(b.properties.get('OWNER_EMAIL'), 'owner@example.com');
    assert.equal(b.properties.get('MAX_PARTY'), '8');
    assert.equal(b.properties.get('SITE_URL'), 'https://chatchaisornkarn.github.io/asmat-saima/');
    assert.equal(b.properties.get('EVENT_DATE'), '2026-12-13');
    b.properties.set('SITE_URL', 'https://example.org/x/');
    b.setup();
    assert.equal(b.properties.get('SITE_URL'), 'https://example.org/x/');
  });

  test('is idempotent and never touches RSVP rows', () => {
    const b = fresh();
    b.post(attendBody({ members: ['Sara Khan'] }));
    const before = JSON.stringify(b.rows());
    b.setup(); b.setup();
    assert.equal(JSON.stringify(b.rows()), before);
    assert.deepEqual(b.header(), HEADERS);
    assert.equal(b.ss.sheets.filter((s) => s.name === 'Guests').length, 1);
  });

  test('Guests tab is one formula over active rows (no hand-written values)', () => {
    const b = fresh();
    const g = b.sheet('Guests');
    const f = g.cell(1, 1).formula;
    assert.match(f, /^=LET\(/);
    assert.ok(f.includes(R('status')), 'status');
    assert.ok(f.includes(R('names')), 'names');
    assert.match(f, /"active"/);
    assert.match(f, /SPLIT\(.*CHAR\(10\)\)/);
    for (const col of ['email', 'phone', 'timestamp']) assert.ok(f.includes(R(col)), col);
    let depth = 0;
    for (const ch of f.replace(/"[^"]*"/g, '')) { if (ch === '(') depth++; if (ch === ')') depth--; assert.ok(depth >= 0); }
    assert.equal(depth, 0, 'balanced parentheses');
    // Only A1 (formula) and the side hint in H1 are written.
    const written = g.writes.map((w) => `${w.r},${w.c}`);
    assert.deepEqual([...new Set(written)].sort(), ['1,1', '1,8']);
  });

  test('Summary uses SUMIFS/COUNTIFS over active rows and a last-updated cell', () => {
    const b = fresh();
    const s = b.sheet('Summary');
    const formulas = s.grid.flat().filter((c) => c && c.formula).map((c) => c.formula);
    assert.ok(formulas.includes(`=SUMIFS(${R('party_size')}, ${R('status')}, "active")`), 'guests');
    assert.ok(formulas.includes(`=COUNTIFS(${R('status')}, "active")`), 'households');
    assert.ok(formulas.includes(`=COUNTIFS(${R('type')}, "attend")`));
    assert.ok(formulas.includes(`=COUNTIFS(${R('type')}, "cancel")`));
    assert.ok(formulas.some((f) => f.includes(`MAX(${R('timestamp')})`)), 'last RSVP received');
  });

  test('works even if setup() was never run (RSVPs tab created on demand)', () => {
    const b = createBackend();
    const r = b.post(attendBody());
    assert.equal(r.ok, true);
    assert.deepEqual(b.header(), HEADERS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('attend', () => {
  test('creates an active row and answers per contract', () => {
    const b = fresh();
    const r = b.post(attendBody({ first: ' Asmat ', last: 'Khan', email: ' A@X.se ', members: [{ first: 'Sara', last: 'Khan' }], message: 'No nuts please', lang: 'sv' }));
    assert.deepEqual(r, { ok: true, partySize: 2, names: ['Asmat Khan', 'Sara Khan'],
      people: [{ name: 'Asmat Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }], replaced: false });
    const rows = b.rows();
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.type, 'attend');
    assert.equal(row.email, 'a@x.se');
    assert.equal(row.phone, '+46701234567', 'phone stays text, normalised');
    assert.equal(row.party_size, 2);
    assert.deepEqual([row.men, row.women, row.infants], [1, 1, 0]);
    assert.equal(row.names, 'Asmat Khan — man\nSara Khan — woman');
    assert.equal(row.message, 'No nuts please');
    assert.equal(row.language, 'sv');
    assert.equal(row.status, 'active');
    assert.equal(row.replaces, '');
    assert.equal(Object.prototype.toString.call(row.timestamp), '[object Date]');
    assert.equal(b.state.lockAcquired >= 1, true);
  });

  test('supersedes by email (case-insensitive)', () => {
    const b = fresh();
    b.post(attendBody({ email: 'a@x.se', phone: '0701111111' }));
    const r = b.post(attendBody({ email: 'A@X.SE', phone: '0702222222', members: ['Sara Khan'] }));
    assert.equal(r.replaced, true);
    const rows = b.rows();
    assert.deepEqual(rows.map((x) => x.status), ['superseded', 'active']);
    assert.equal(rows[1].replaces, '2');
    assert.match(rows[1].note, /email only/);
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 2, households: 1 });
  });

  test('supersedes by a differently formatted phone', () => {
    for (const other of ['+46 70 123 45 67', '0046701234567', '+46 (0)70-123.45.67', '070.123.45.67', '0046 (70) 123 4567']) {
      const b = fresh();
      b.post(attendBody({ email: 'one@x.se', phone: '070-123 45 67' }));
      const r = b.post(attendBody({ email: 'two@x.se', phone: other }));
      assert.equal(r.replaced, true, other);
      assert.deepEqual(b.rows().map((x) => x.status), ['superseded', 'active'], other);
      assert.match(b.rows()[1].note, /phone only/);
    }
  });

  test('one new RSVP can supersede two older parties (email of one, phone of another)', () => {
    const b = fresh();
    b.post(attendBody({ email: 'a@x.se', phone: '0701111111' }));
    b.post(attendBody({ email: 'b@x.se', phone: '0702222222' }));
    const r = b.post(attendBody({ email: 'a@x.se', phone: '0702222222' }));
    assert.equal(r.replaced, true);
    assert.equal(b.rows()[2].replaces, '2,3');
    assert.equal(active(b).length, 1);
  });

  test('unrelated parties are independent', () => {
    const b = fresh();
    b.post(attendBody({ email: 'a@x.se', phone: '0701111111' }));
    const r = b.post(attendBody({ email: 'b@x.se', phone: '0702222222', members: ['X Y'] }));
    assert.equal(r.replaced, false);
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 3, households: 2 });
  });

  test('re-attending after a full cancel notes it and becomes active again', () => {
    const b = fresh();
    b.post(attendBody());
    b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', all: true });
    const r = b.post(attendBody());
    assert.equal(r.ok, true);
    assert.equal(r.replaced, false);
    assert.match(b.rows()[2].note, /previously cancelled/);
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 1, households: 1 });
  });

  test('honeypot → {ok:true}, nothing written, no email', () => {
    const b = fresh();
    const r = b.post(attendBody({ website: 'http://spam' }));
    assert.deepEqual(r, { ok: true });
    assert.equal(b.rows().length, 0);
    assert.equal(b.mails.length, 0);
    const c = b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', all: true, website: 'x' });
    assert.deepEqual(c, { ok: true });
  });

  test('invalid input → {ok:false,error:"invalid"}, nothing written', () => {
    const b = fresh();
    const bad = [
      'not json', '[]', '"x"', '', '{}',
      { action: 'nope' },
      attendBody({ email: 'not-an-email' }),
      attendBody({ email: 'a@x' }),
      attendBody({ email: 'a@x.se,b@y.se' }),
      attendBody({ phone: '12345' }),
      attendBody({ phone: '070 123' }),
      attendBody({ phone: '070abc4567' }),
      attendBody({ phone: '(070) 123 45 67' }),   // must start with + or 0, same as the site
      attendBody({ phone: '+46 70 123 45 67 89 01 23' }),
      attendBody({ first: '' }),
      attendBody({ last: '   ' }),
      attendBody({ first: 'A'.repeat(81) }),
      attendBody({ lang: 'fr' }),
      attendBody({ message: 'x'.repeat(1001) }),
      attendBody({ members: [{ first: 'Sara', last: '' }] }),
      { ...attendBody(), members: 'Sara' },
      { ...attendBody(), members: [null] },
      { ...attendBody(), main: null },
      { ...attendBody(), main: { ...attendBody().main, email: ['a@x.se'] } },
      { ...attendBody(), message: { x: 1 } },
      'x'.repeat(40000),
    ];
    for (const body of bad) {
      const r = b.post(body);
      assert.deepEqual(r, { ok: false, error: 'invalid' }, JSON.stringify(body).slice(0, 80));
    }
    assert.deepEqual(b.postRaw({}), { ok: false, error: 'invalid' });
    assert.deepEqual(b.postRaw(undefined), { ok: false, error: 'invalid' });
    assert.equal(b.rows().length, 0);
    assert.equal(b.mails.length, 0);
  });

  test('party cap: 20 accepted, 21 → party_too_large; MAX_PARTY property respected', () => {
    const b = fresh();
    const members = (n) => Array.from({ length: n }, (_, i) => ({ first: 'Guest', last: String.fromCharCode(65 + i) + 'son' }));
    assert.equal(b.post(attendBody({ members: members(19) })).partySize, 20);
    assert.deepEqual(b.post(attendBody({ email: 'z@x.se', phone: '0709999999', members: members(20) })), { ok: false, error: 'party_too_large' });
    assert.equal(b.rows().length, 1);
    const small = fresh({ props: { MAX_PARTY: '3' } });
    assert.deepEqual(small.post(attendBody({ members: members(3) })), { ok: false, error: 'party_too_large' });
    assert.equal(small.post(attendBody({ members: members(2) })).ok, true);
  });

  test('formula injection is neutralised in every written text cell', () => {
    const b = fresh();
    b.post(attendBody({ first: '=HYPERLINK("http://evil","x")', last: '+SUM(1)', members: [{ first: '@me', last: '-1' }], message: '=1+2' }));
    const raw = b.rawWrites('RSVPs').filter((w) => w.r === 2);
    const rawAt = (c) => raw.find((w) => w.c === c).raw;
    assert.equal(rawAt(C('names')), "'=HYPERLINK(\"http://evil\",\"x\") +SUM(1) — man\n@me -1 — woman");
    assert.equal(rawAt(C('message')), "'=1+2");
    assert.equal(rawAt(C('phone')), "'+46701234567");
    const row = b.rows()[0];
    assert.equal(row.message, '=1+2', 'stored as text, not a formula');
    assert.ok(!b.sheet('RSVPs').grid[1].some((c) => c && c.formula), 'no formulas in data rows');
    // and the guest email escapes HTML
    const g = guestMails(b, 'a@x.se')[0];
    assert.ok(g.htmlBody.includes('=HYPERLINK(&quot;http://evil&quot;'));
  });

  test('HTML in names/messages is escaped in emails', () => {
    const b = fresh();
    b.post(attendBody({ first: '<script>alert(1)</script>', last: 'X', message: '<img src=x onerror=alert(1)>' }));
    for (const m of b.mails) {
      assert.ok(!m.htmlBody.includes('<script>alert'), m.subject);
      assert.ok(!m.htmlBody.includes('<img src=x'), m.subject);
    }
  });

  test('busy lock → server error, nothing written', () => {
    const b = fresh();
    b.state.lockAvailable = false;
    assert.deepEqual(b.post(attendBody()), { ok: false, error: 'server' });
    assert.equal(b.rows().length, 0);
  });

  test('unexpected failure → {ok:false,error:"server"} with no stack trace', () => {
    const b = fresh();
    b.context.SpreadsheetApp.getActiveSpreadsheet = () => { throw new Error('boom at Foo.gs:12'); };
    const out = b.context.doPost({ postData: { contents: JSON.stringify(attendBody()) } });
    assert.equal(out.getContent(), '{"ok":false,"error":"server"}');
    const out2 = b.context.doGet({ parameter: { action: 'count' } });
    assert.equal(out2.getContent(), '{"ok":false,"error":"server"}');
    assert.ok(b.logs.some((l) => l[0] === 'error' && /boom/.test(l[1])), 'logged server-side');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('lookup & count (GET)', () => {
  test('lookup needs BOTH email and phone', () => {
    const b = fresh();
    b.post(attendBody({ email: 'a@x.se', phone: '070 123 45 67', members: ['Sara Khan'] }));
    b.post(attendBody({ email: 'other@x.se', phone: '0709999999' }));
    assert.deepEqual(b.get({ action: 'lookup', email: 'A@x.se ', phone: '+46701234567' }), { ok: true, names: ['Asmat Khan', 'Sara Khan'],
      people: [{ name: 'Asmat Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }] });
    const nf = { ok: false, error: 'not_found' };
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0709999999' }), nf, 'wrong combination');
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se' }), nf, 'email only');
    assert.deepEqual(b.get({ action: 'lookup', phone: '0701234567' }), nf, 'phone only');
    assert.deepEqual(b.get({ action: 'lookup', email: 'nobody@x.se', phone: '0705555555' }), nf);
  });

  test('lookup never returns superseded or cancelled parties', () => {
    const b = fresh();
    b.post(attendBody({ email: 'a@x.se', phone: '0701111111', members: ['Old Name'] }));
    b.post(attendBody({ email: 'a@x.se', phone: '0702222222' }));
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0701111111' }), { ok: false, error: 'not_found' });
    b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0702222222', all: true });
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0702222222' }), { ok: false, error: 'not_found' });
  });

  test('lookup is rate limited per email', () => {
    const b = fresh();
    b.post(attendBody());
    let last;
    for (let i = 0; i < 13; i++) last = b.get({ action: 'lookup', email: 'a@x.se', phone: '070' + String(1000000 + i) });
    assert.deepEqual(last, { ok: false, error: 'server' });
    assert.ok([...b.cache.keys()].every((k) => !k.includes('a@x.se')), 'cache keys are hashed');
  });

  test('count returns aggregates only and is refreshed after each RSVP', () => {
    const b = fresh();
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 0, households: 0 });
    b.post(attendBody({ members: ['Sara Khan', 'Ali Khan'] }));
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 3, households: 1 });
    b.post(attendBody({ email: 'b@x.se', phone: '0702222222' }));
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 4, households: 2 });
  });

  test('no action → ready; unknown action → invalid; JSON mime type', () => {
    const b = fresh();
    assert.deepEqual(b.get({}), { ok: true, status: 'ready' });
    assert.deepEqual(b.get({ action: 'dump' }), { ok: false, error: 'invalid' });
    const out = b.context.doGet({ parameter: { action: 'count' } });
    assert.equal(out.getMimeType(), 'application/json');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('cancel', () => {
  const setupParty = () => {
    const b = fresh();
    b.post(attendBody({ email: 'a@x.se', phone: '070 123 45 67', members: ['Sara Khan', 'Ali Khan'], message: 'Vegetarian' }));
    b.mails.length = 0;
    return b;
  };

  test('partial cancel: new active cancel row with remaining members, old row superseded', () => {
    const b = setupParty();
    const r = b.post({ action: 'cancel', lang: 'sv', email: 'A@x.se', phone: '+46 70 123 45 67', cancel: ['Ali Khan'], message: '' });
    assert.deepEqual(r, { ok: true, cancelled: ['Ali Khan'], remaining: ['Asmat Khan', 'Sara Khan'], status: 'active' });
    const [old, neu] = b.rows();
    assert.equal(old.status, 'superseded');
    assert.equal(neu.type, 'cancel');
    assert.equal(neu.status, 'active');
    assert.equal(neu.party_size, 2);
    assert.equal(neu.names, 'Asmat Khan — man\nSara Khan — woman', 'remaining lines keep their tags');
    assert.equal(neu.replaces, '2');
    assert.equal(neu.language, 'sv');
    assert.match(neu.note, /Cancelled: Ali Khan/);
    assert.equal(neu.message, 'Vegetarian', 'message carried over');
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 2, households: 1 });
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0701234567' }).names, ['Asmat Khan', 'Sara Khan']);
  });

  test('cancelling every name individually → status cancelled', () => {
    const b = setupParty();
    const r = b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Asmat Khan', 'Sara Khan', 'Ali Khan'] });
    assert.equal(r.status, 'cancelled');
    assert.deepEqual(r.remaining, []);
  });

  test('full cancel (all:true): party_size 0, status cancelled, count drops', () => {
    const b = setupParty();
    const r = b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', all: true, message: 'So sorry' });
    assert.deepEqual(r, { ok: true, cancelled: ['Asmat Khan', 'Sara Khan', 'Ali Khan'], remaining: [], status: 'cancelled' });
    const neu = b.rows()[1];
    assert.equal(neu.party_size, 0);
    assert.equal(neu.status, 'cancelled');
    assert.equal(neu.names, '');
    assert.equal(neu.message, 'So sorry');
    assert.match(neu.note, /Cancelled everyone: Asmat Khan, Sara Khan, Ali Khan/);
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 0, households: 0 });
  });

  test('cancel needs email AND phone', () => {
    const b = setupParty();
    assert.deepEqual(b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0709999999', all: true }), { ok: false, error: 'not_found' });
    assert.deepEqual(b.post({ action: 'cancel', lang: 'en', email: 'b@x.se', phone: '0701234567', all: true }), { ok: false, error: 'not_found' });
    assert.deepEqual(b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', all: true }), { ok: false, error: 'invalid' });
    assert.equal(b.rows().length, 1);
    assert.equal(b.mails.length, 0);
  });

  test('cancel with a name not in the party, or nothing chosen → invalid, nothing written', () => {
    const b = setupParty();
    assert.deepEqual(b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Nobody'] }), { ok: false, error: 'invalid' });
    assert.deepEqual(b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: [] }), { ok: false, error: 'invalid' });
    assert.deepEqual(b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567' }), { ok: false, error: 'invalid' });
    assert.deepEqual(b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Ali Khan', 'Ali Khan'] }), { ok: false, error: 'invalid' });
    assert.equal(b.rows().length, 1);
    assert.equal(b.rows()[0].status, 'active');
  });

  test('second partial cancel works on the new row; cancel after full cancel → not_found', () => {
    const b = setupParty();
    b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Ali Khan'] });
    const r = b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Sara Khan'] });
    assert.deepEqual(r.remaining, ['Asmat Khan']);
    assert.equal(b.rows()[2].replaces, '3');
    b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', all: true });
    assert.deepEqual(b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', all: true }), { ok: false, error: 'not_found' });
    assert.equal(active(b).length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('emails', () => {
  test('attend sends a guest confirmation and an owner summary', () => {
    const b = fresh();
    b.post(attendBody({ members: ['Sara Khan'], message: 'Hi!' }));
    assert.equal(b.mails.length, 2);
    const [g] = guestMails(b, 'a@x.se');
    assert.equal(g.name, 'Asmat & Saima');
    assert.equal(g.replyTo, 'owner@example.com');
    assert.ok(g.body && g.htmlBody, 'plain-text alternative + HTML');
    assert.match(g.body, /Asmat Khan/);
    assert.match(g.body, /Sunday, 13 December 2026/);
    assert.match(g.body, /Grand Plaza Bröllop & Konferens/);
    assert.ok(!g.body.includes('Säve Flygplatsväg'), 'guests see the venue name, not the street address');
    assert.match(g.body, /https:\/\/chatchaisornkarn\.github\.io\/asmat-saima\/\?lang=en/);
    assert.match(g.body, /send a new RSVP/i);
    assert.ok(g.htmlBody.includes('https://www.google.com/maps/search/?api=1&amp;query='));
    const [o] = ownerMails(b);
    assert.equal(o.replyTo, 'a@x.se');
    for (const s of ['New RSVP', 'Asmat Khan', 'Sara Khan', 'a@x.se', '+46701234567', 'English', 'Hi!', 'Now 2 guests from 1 household', 'TEST_SHEET_ID']) {
      assert.ok(o.htmlBody.includes(s) || o.body.includes(s), 'owner mail has ' + s);
    }
  });

  test('guest email is in the guest language; Urdu is right-to-left', () => {
    const expect = {
      en: { subj: /Your RSVP is confirmed/, date: 'Sunday, 13 December 2026', dir: 'ltr' },
      sv: { subj: /Ditt OSA är bekräftat/, date: 'Söndag 13 december 2026', dir: 'ltr' },
      th: { subj: /ยืนยันการตอบรับ/, date: 'วันอาทิตย์ที่ 13 ธันวาคม พ.ศ. 2569', dir: 'ltr' },
      ur: { subj: /نکاح/, date: 'بروز اتوار، 13 دسمبر 2026ء', dir: 'rtl' },
    };
    for (const [lang, e] of Object.entries(expect)) {
      const b = fresh();
      b.post(attendBody({ lang }));
      const [g] = guestMails(b, 'a@x.se');
      assert.match(g.subject, e.subj, lang);
      assert.ok(g.htmlBody.includes(`<html lang="${lang}" dir="${e.dir}">`), lang + ' html dir');
      assert.ok(g.htmlBody.includes(`<body dir="${e.dir}"`), lang + ' body dir');
      assert.ok(g.htmlBody.includes(e.date), lang + ' date');
      assert.ok(g.body.includes('?lang=' + lang), lang + ' site link');
      assert.ok(g.htmlBody.includes('Asmat &amp; Saima'), 'names in Latin script');
      assert.ok(g.htmlBody.includes('dir="ltr" class="names"'), 'names stay LTR in Urdu');
    }
  });

  test('cancel emails: partial lists remaining + cancelled; full cancel has no date block', () => {
    const b = fresh();
    b.post(attendBody({ lang: 'th', members: ['Sara Khan', 'Ali Khan'] }));
    b.mails.length = 0;
    b.post({ action: 'cancel', lang: 'th', email: 'a@x.se', phone: '0701234567', cancel: ['Ali Khan'] });
    const [p] = guestMails(b, 'a@x.se');
    assert.match(p.subject, /ปรับปรุง/);
    assert.ok(p.body.includes('ยังคงมาร่วมงาน') && p.body.includes('Ali Khan') && p.body.includes('Sara Khan'));
    assert.match(ownerMails(b)[0].subject, /Partial cancel/);
    b.mails.length = 0;
    b.post({ action: 'cancel', lang: 'ur', email: 'a@x.se', phone: '0701234567', all: true });
    const [f] = guestMails(b, 'a@x.se');
    assert.match(f.subject, /منسوخ/);
    assert.ok(f.htmlBody.includes('dir="rtl"'));
    assert.ok(!f.body.includes('Grand Plaza'), 'no venue block for a full cancel');
    assert.match(ownerMails(b)[0].subject, /Cancelled/);
    assert.match(ownerMails(b)[0].body, /Now 0 guests from 0 households/);
  });

  test('updated RSVP: subject and owner mail mention the replacement', () => {
    const b = fresh();
    b.post(attendBody());
    b.mails.length = 0;
    b.post(attendBody({ members: ['Sara Khan'] }));
    assert.match(guestMails(b, 'a@x.se')[0].subject, /updated RSVP/);
    const o = ownerMails(b)[0];
    assert.match(o.subject, /Updated/);
    assert.match(o.body, /replaces row 2 \(Asmat Khan\)/);
  });

  test('quota exhausted: RSVP still written and ok, note records it', () => {
    const b = fresh({ quota: 0 });
    const r = b.post(attendBody());
    assert.equal(r.ok, true);
    assert.equal(b.rows().length, 1);
    assert.equal(b.mails.length, 0);
    assert.match(b.rows()[0].note, /quota used up/);
  });

  test('MailApp throwing never fails the RSVP', () => {
    const b = fresh();
    b.state.mailThrowsNext = true;
    const r = b.post(attendBody());
    assert.equal(r.ok, true);
    assert.equal(b.rows()[0].status, 'active');
    assert.match(b.rows()[0].note, /guest email not sent/);
    assert.equal(ownerMails(b).length, 1, 'owner mail still sent');
  });

  test('SEND_GUEST_EMAILS=false and a custom OWNER_EMAIL are honoured', () => {
    const b = fresh({ props: { SEND_GUEST_EMAILS: 'false', OWNER_EMAIL: 'couple@example.org' } });
    b.post(attendBody());
    assert.deepEqual(b.mails.map((m) => m.to), ['couple@example.org']);
  });

  test('guest confirmations to one address are throttled', () => {
    const b = fresh();
    for (let i = 0; i < 8; i++) b.post(attendBody());
    assert.equal(guestMails(b, 'a@x.se').length, 6);
    assert.equal(active(b).length, 1);
  });

  test('every sample email renders (12 guest variants + owner)', () => {
    const b = fresh();
    const cfg = b.context.getConfig_();
    const samples = b.context.sampleEvents_();
    assert.equal(samples.length, 12);
    for (const ev of samples) {
      const m = b.context.renderGuestEmail_(ev, cfg);
      assert.ok(m.subject && m.html.startsWith('<!DOCTYPE html>') && m.text.length > 100, ev.lang + ' ' + ev.kind);
      assert.ok(!/undefined|NaN|\{name\}|\{time\}/.test(m.html + m.text), ev.lang + ' ' + ev.kind + ' has no template leftovers');
      const o = b.context.renderOwnerEmail_(ev, cfg);
      assert.ok(!/undefined|NaN/.test(o.html + o.text));
    }
  });

  test('event time appears when EVENT_TIME is set', () => {
    const b = fresh({ props: { EVENT_TIME: '14:00' } });
    b.post(attendBody({ lang: 'sv' }));
    assert.match(guestMails(b, 'a@x.se')[0].body, /kl\. 14:00/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('late replies (2_main_idea issue 14)', () => {
  // 6 Nov 2026 ends at midnight Göteborg time (CET, UTC+1) = 2026-11-06T23:00:00Z.
  const BEFORE = '2026-11-06T22:59:59Z', AFTER = '2026-11-06T23:00:00Z';
  const at = (when, opts) => { const b = fresh(opts); b.setNow(when); return b; };

  test('attend before the end of 6 Nov (Göteborg) → late = FALSE, normal subject', () => {
    for (const when of ['2026-10-12T10:00:00Z', '2026-11-06T00:00:00Z', BEFORE]) {
      const b = at(when);
      assert.equal(b.post(attendBody()).ok, true);
      const row = b.rows()[0];
      assert.equal(row.late, false, when);
      assert.equal(row.timestamp.toISOString(), new Date(when).toISOString(), 'timestamp comes from the script clock');
      const o = ownerMails(b)[0];
      assert.ok(!/LATE/.test(o.subject), o.subject);
      assert.ok(!/LATE/.test(o.body));
      assert.ok(!/after the reply-by date/.test(guestMails(b, 'a@x.se')[0].body));
    }
  });

  test('attend after the deadline is still accepted, late = TRUE, owner subject starts with LATE', () => {
    for (const when of [AFTER, '2026-11-20T12:00:00Z', '2026-12-12T09:00:00Z']) {
      const b = at(when);
      const r = b.post(attendBody({ members: ['Sara Khan'] }));
      assert.deepEqual(r, { ok: true, partySize: 2, names: ['Asmat Khan', 'Sara Khan'],
        people: [{ name: 'Asmat Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }], replaced: false }, 'same contract');
      const row = b.rows()[0];
      assert.equal(row.late, true, when);
      assert.equal(row.status, 'active');
      assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 2, households: 1 }, 'late guests count');
      const o = ownerMails(b)[0];
      assert.match(o.subject, /^LATE · RSVP · Attending · Asmat Khan \(2\)$/);
      assert.match(o.body, /Late: LATE — after the reply-by date \(2026-11-06\)/);
      assert.ok(o.htmlBody.includes('after the reply-by date'));
    }
  });

  test('raw write is a real boolean (TRUE / FALSE), not text', () => {
    const b = at(AFTER);
    b.post(attendBody());
    const lateCol = C('late');
    const w = b.rawWrites('RSVPs').filter((x) => x.r === 2 && x.c === lateCol);
    assert.deepEqual(w.map((x) => x.raw), [true]);
  });

  test('a late updated RSVP: "LATE · RSVP · Updated"', () => {
    const b = at('2026-11-01T10:00:00Z');
    b.post(attendBody());
    b.setNow(AFTER);
    b.mails.length = 0;
    b.post(attendBody({ members: ['Sara Khan'] }));
    assert.deepEqual(b.rows().map((r) => [r.status, r.late]), [['superseded', false], ['active', true]]);
    assert.match(ownerMails(b)[0].subject, /^LATE · RSVP · Updated · /);
  });

  test('guest confirmation for a late reply says so, in each language', () => {
    const expect = { en: /after the reply-by date/, sv: /efter sista svarsdagen/, th: /หลังวันกำหนดตอบรับ/, ur: /مقررہ تاریخ کے بعد/ };
    for (const [lang, re] of Object.entries(expect)) {
      const b = at(AFTER);
      b.post(attendBody({ lang }));
      const g = guestMails(b, 'a@x.se')[0];
      assert.match(g.body, re, lang);
      assert.match(g.htmlBody, re, lang);
      assert.ok(!/LATE/.test(g.subject), 'guest subject unchanged');
    }
  });

  test('cancel after the deadline still works (partial and full), never gets a LATE subject', () => {
    const b = at('2026-11-01T10:00:00Z');
    b.post(attendBody({ members: ['Sara Khan', 'Ali Khan'] }));
    b.setNow('2026-11-20T10:00:00Z');
    b.mails.length = 0;
    const p = b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Ali Khan'] });
    assert.deepEqual(p, { ok: true, cancelled: ['Ali Khan'], remaining: ['Asmat Khan', 'Sara Khan'], status: 'active' });
    assert.match(ownerMails(b)[0].subject, /^RSVP · Partial cancel/);
    b.mails.length = 0;
    const f = b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', all: true });
    assert.equal(f.ok, true);
    assert.equal(f.status, 'cancelled');
    assert.match(ownerMails(b)[0].subject, /^RSVP · Cancelled/);
    assert.deepEqual(b.rows().map((r) => [r.type, r.status, r.late]),
      [['attend', 'superseded', false], ['cancel', 'superseded', false], ['cancel', 'cancelled', false]]);
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 0, households: 0 });
  });

  test('a partial cancel of a late Party keeps late = TRUE on the remaining row', () => {
    const b = at(AFTER);
    b.post(attendBody({ members: ['Sara Khan'] }));
    b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Sara Khan'] });
    assert.deepEqual(b.rows().map((r) => [r.type, r.status, r.late]), [['attend', 'superseded', true], ['cancel', 'active', true]]);
  });

  test('RSVP_DEADLINE Script Property is the script\'s deadline; setup() writes the default', () => {
    const b = createBackend();
    b.setup();
    assert.equal(b.properties.get('RSVP_DEADLINE'), '2026-11-06');
    const moved = at('2026-11-10T10:00:00Z', { props: { RSVP_DEADLINE: '2026-11-15' } });
    moved.post(attendBody());
    assert.equal(moved.rows()[0].late, false, 'deadline moved by property');
    const bad = at(AFTER, { props: { RSVP_DEADLINE: '6 Nov' } });
    bad.post(attendBody());
    assert.equal(bad.rows()[0].late, true, 'an invalid property falls back to the default');
  });

  test('an existing sheet without the late column gets it appended; other columns keep their place', () => {
    const b = createBackend();
    const old = ['timestamp', 'type', 'email', 'phone', 'party_size', 'names', 'message', 'language', 'status', 'replaces', 'note'];
    const s = b.ss.addSheet('RSVPs', 0);
    old.forEach((h, j) => s.write(1, j + 1, h));
    s.write(2, 1, new Date('2026-10-01T10:00:00Z'));
    ['attend', 'old@x.se', "'+46709999999", 1, 'Old Guest', '', 'en', 'active', '', ''].forEach((v, j) => s.write(2, j + 2, v));
    b.setNow(AFTER);
    assert.equal(b.post(attendBody()).ok, true);
    // A pre-issue-14 sheet also lacks `side` (issue 15) and men / women / infants (issue 17):
    // missing columns are appended in RSVP_HEADERS order.
    assert.deepEqual(b.header(), [...old, 'side', 'men', 'women', 'infants', 'late']);
    const [first, neu] = b.rows();
    assert.equal(first.email, 'old@x.se');
    assert.equal(first.late, '', 'old rows are left empty');
    assert.equal(neu.late, true);
    assert.equal(neu.note, '');
    b.setup();
    assert.deepEqual(b.header(), [...old, 'side', 'men', 'women', 'infants', 'late'], 'setup() keeps the order');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('side from the link (2_main_idea issue 15)', () => {
  const party = (side, over = {}) => sideParty(side, over);
  const cancelBody = (over = {}) => ({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', ...over });

  test('side column sits after phone in a new sheet', () => {
    const b = fresh();
    assert.equal(b.header().indexOf('side'), b.header().indexOf('phone') + 1);
  });

  test('?side=asmat / ?side=saima save asmat / saima; the response contract is unchanged', () => {
    for (const side of ['asmat', 'saima']) {
      const b = fresh();
      const r = b.post(party(side));
      assert.deepEqual(r, { ok: true, partySize: 2, names: ['Asmat Khan', 'Sara Khan'], replaced: false,
        people: [{ name: 'Asmat Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }] });
      assert.equal(b.rows()[0].side, side);
    }
  });

  test('any letter case (and stray spaces) is normalised to lower case', () => {
    for (const [sent, want] of [['SAIMA', 'saima'], ['Asmat', 'asmat'], ['aSmAt', 'asmat'], [' saima ', 'saima']]) {
      const b = fresh();
      assert.equal(b.post(party(sent)).ok, true, sent);
      assert.equal(b.rows()[0].side, want, sent);
    }
  });

  test('the side cell is written as plain text', () => {
    const b = fresh();
    b.post(party('Saima'));
    const w = b.rawWrites('RSVPs').filter((x) => x.r === 2 && x.c === C('side'));
    assert.deepEqual(w.map((x) => x.raw), ['saima']);
  });

  test('owner email shows the Side (HTML and text); the guest email does not', () => {
    const cases = [['asmat', 'Asmat’s side'], ['SAIMA', 'Saima’s side']];
    for (const [side, label] of cases) {
      const b = fresh();
      b.post(party(side));
      const o = ownerMails(b)[0];
      assert.ok(o.body.includes('Side: ' + label), o.body);
      assert.ok(o.htmlBody.includes('>Side<'), 'Side row label');
      assert.ok(o.htmlBody.includes(label), label);
      const g = guestMails(b, 'a@x.se')[0];
      assert.ok(!/asmat’s side|saima’s side|\?side=/i.test(g.body + g.htmlBody), 'guest email does not mention the side');
    }
  });

  test('partial and full cancel keep the Party\'s side (cancel bodies carry none); owner emails show it', () => {
    const b = fresh();
    b.post(party('saima', { members: ['Sara Khan', 'Ali Khan'] }));
    b.mails.length = 0;
    // A cancel body that tries to set a side is ignored.
    assert.equal(b.post(cancelBody({ cancel: ['Ali Khan'], side: 'asmat' })).ok, true);
    assert.match(ownerMails(b)[0].body, /Side: Saima’s side/);
    b.mails.length = 0;
    assert.equal(b.post(cancelBody({ all: true })).ok, true);
    assert.match(ownerMails(b)[0].body, /Side: Saima’s side/);
    assert.deepEqual(b.rows().map((r) => [r.type, r.status, r.side]),
      [['attend', 'superseded', 'saima'], ['cancel', 'superseded', 'saima'], ['cancel', 'cancelled', 'saima']]);
  });

  test('a cancel of a row whose side cell is empty (pre-issue-16 row / cleared by hand) still works; owner email says "Not given"', () => {
    const b = fresh();
    b.post(party('asmat', { members: ['Sara Khan', 'Ali Khan'] }));
    b.sheet('RSVPs').write(2, C('side'), '');
    b.mails.length = 0;
    assert.equal(b.post(cancelBody({ cancel: ['Ali Khan'] })).ok, true);
    assert.equal(b.rows()[1].side, '');
    const o = ownerMails(b)[0];
    assert.ok(o.body.includes('Side: Not given'), o.body);
    assert.ok(o.htmlBody.includes('Not given'));
  });

  test('a cancel keeps a side the owner fixed by hand in the sheet (any case)', () => {
    const b = fresh();
    b.post(party('asmat'));
    b.sheet('RSVPs').write(2, C('side'), 'Saima');   // "someone got the other family's link" — owner edits the cell
    b.post(cancelBody({ cancel: ['Sara Khan'] }));
    assert.deepEqual(b.rows().map((r) => r.side), ['Saima', 'saima']);
  });

  test('a new attend reply takes its side from the new reply', () => {
    const b = fresh();
    b.post(party('asmat'));
    b.post(party('saima'));
    assert.deepEqual(b.rows().map((r) => [r.status, r.side]), [['superseded', 'asmat'], ['active', 'saima']]);
  });

  test('an existing sheet without a side column gets it appended; old rows stay empty', () => {
    const b = createBackend();
    const old = HEADERS.filter((h) => h !== 'side');
    const s = b.ss.addSheet('RSVPs', 0);
    old.forEach((h, j) => s.write(1, j + 1, h));
    assert.equal(b.post(party('saima')).ok, true);
    assert.deepEqual(b.header(), [...old, 'side']);
    assert.equal(b.rows()[0].side, 'saima');
    b.setup();
    assert.deepEqual(b.header(), [...old, 'side'], 'setup() keeps the order');
    assert.equal(b.post(cancelBody({ cancel: ['Sara Khan'] })).ok, true);
    assert.equal(b.rows()[1].side, 'saima');
  });

  test('every sample owner email shows a side', () => {
    const b = fresh();
    const cfg = b.call('getConfig_');
    for (const ev of b.call('sampleEvents_')) {
      const o = b.call('renderOwnerEmail_', ev, cfg);
      assert.match(o.text, /Side: (Asmat|Saima)’s side/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('category per person (2_main_idea issue 17)', () => {
  const family = (over = {}) => attendBody({ first: 'Ali', last: 'Khan', category: 'man',
    members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Zain', last: 'Khan', category: 'infant' }], ...over });

  test('a 1 man / 1 woman / 1 infant Party writes the counts and three tagged lines', () => {
    const b = fresh();
    const r = b.post(family());
    assert.deepEqual(r, { ok: true, partySize: 3, names: ['Ali Khan', 'Sara Khan', 'Zain Khan'], replaced: false,
      people: [{ name: 'Ali Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }, { name: 'Zain Khan', category: 'infant' }] });
    const row = b.rows()[0];
    assert.deepEqual([row.party_size, row.men, row.women, row.infants], [3, 1, 1, 1]);
    assert.equal(row.party_size, row.men + row.women + row.infants, 'invariant');
    assert.equal(row.names, 'Ali Khan — man\nSara Khan — woman\nZain Khan — infant');
    // the counts are real numbers, not text
    const raw = b.rawWrites('RSVPs').filter((w) => w.r === 2);
    for (const h of ['men', 'women', 'infants']) assert.equal(typeof raw.find((w) => w.c === C(h)).raw, 'number', h);
  });

  test('infants count like everyone else: public count and the cap of 20', () => {
    const b = fresh();
    b.post(family());
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 3, households: 1 });
    const infants = (n) => Array.from({ length: n }, (_, i) => ({ first: 'Baby', last: String.fromCharCode(65 + i) + 'son', category: 'infant' }));
    assert.equal(b.post(attendBody({ email: 'big@x.se', phone: '0708888888', members: infants(19) })).partySize, 20);
    assert.deepEqual(b.post(attendBody({ email: 'z@x.se', phone: '0709999999', members: infants(20) })), { ok: false, error: 'party_too_large' });
    const big = b.rows()[1];
    assert.deepEqual([big.party_size, big.men, big.women, big.infants], [20, 1, 0, 19]);
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 23, households: 2 });
  });

  test('a POST with a missing or invalid category writes nothing and sends nothing', () => {
    const b = fresh();
    const bads = [undefined, null, '', ' ', 'child', 'boy', 'men', 'infants', 'girl', 1, true, ['man'], { v: 'man' }];
    for (const c of bads) {
      const onMain = family();
      onMain.main.category = c;
      assert.deepEqual(b.post(onMain), { ok: false, error: 'invalid' }, 'main ' + JSON.stringify(c));
      const body = family();
      body.members[1].category = c;
      assert.deepEqual(b.post(body), { ok: false, error: 'invalid' }, 'member ' + JSON.stringify(c));
    }
    const noKey = family();
    delete noKey.main.category;
    delete noKey.members[0].category;
    assert.deepEqual(b.post(noKey), { ok: false, error: 'invalid' }, 'no category key at all');
    assert.equal(b.rows().length, 0);
    assert.equal(b.mails.length, 0);
    // case and surrounding spaces are forgiven
    assert.equal(b.post(family({ category: ' Man ' })).ok, true);
    assert.equal(b.rows()[0].men, 1);
  });

  test('" — " inside a name is replaced before saving, so the tag stays parseable', () => {
    const b = fresh();
    const r = b.post(attendBody({ first: 'Sara — Ann', last: 'Khan—Ali', category: 'woman', members: [{ first: 'Omar', last: 'X ― Y — man', category: 'infant' }] }));
    assert.deepEqual(r.names, ['Sara - Ann Khan-Ali', 'Omar X - Y - man']);
    const row = b.rows()[0];
    assert.equal(row.names, 'Sara - Ann Khan-Ali — woman\nOmar X - Y - man — infant');
    assert.equal((row.names.match(/ — /g) || []).length, 2, 'exactly one separator per line');
    assert.deepEqual([row.men, row.women, row.infants], [0, 1, 1], 'the "— man" typed in a name is not read as a tag');
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0701234567' }), { ok: true, names: ['Sara - Ann Khan-Ali', 'Omar X - Y - man'],
      people: [{ name: 'Sara - Ann Khan-Ali', category: 'woman' }, { name: 'Omar X - Y - man', category: 'infant' }] });
    assert.match(guestMails(b, 'a@x.se')[0].body, /Dear Sara - Ann,/);
  });

  test('lookup returns names plus { name, category }; partial cancel keeps the remaining tags and counts', () => {
    const b = fresh();
    b.post(family());
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0701234567' }), { ok: true, names: ['Ali Khan', 'Sara Khan', 'Zain Khan'],
      people: [{ name: 'Ali Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }, { name: 'Zain Khan', category: 'infant' }] });
    const r = b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Zain Khan'] });
    assert.deepEqual(r, { ok: true, cancelled: ['Zain Khan'], remaining: ['Ali Khan', 'Sara Khan'], status: 'active' });
    const neu = b.rows()[1];
    assert.equal(neu.names, 'Ali Khan — man\nSara Khan — woman');
    assert.deepEqual([neu.party_size, neu.men, neu.women, neu.infants], [2, 1, 1, 0]);
    b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', all: true });
    const gone = b.rows()[2];
    assert.deepEqual([gone.status, gone.party_size, gone.men, gone.women, gone.infants, gone.names], ['cancelled', 0, 0, 0, 0, '']);
  });

  test('a hand-typed name without a tag still works for lookup and cancel', () => {
    const b = fresh();
    b.post(family());
    const s = b.sheet('RSVPs');
    s.write(2, C('names'), 'Ali Khan — man\nAunt Rubina\nZain Khan — infant');
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0701234567' }).people,
      [{ name: 'Ali Khan', category: 'man' }, { name: 'Aunt Rubina', category: '' }, { name: 'Zain Khan', category: 'infant' }]);
    const r = b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Zain Khan'] });
    assert.equal(r.ok, true);
    const neu = b.rows()[1];
    assert.equal(neu.names, 'Ali Khan — man\nAunt Rubina');
    assert.deepEqual([neu.party_size, neu.men, neu.women, neu.infants], [2, 1, 0, 0]);
    assert.match(neu.note, /untagged names — fix counts/, 'men + women + infants ≠ party_size is flagged on the row');
    assert.match(ownerMails(b).at(-1).body, /untagged names — fix counts/, 'and in the owner email');
  });

  test('the guest confirmation lists each person with their category in the guest language', () => {
    const expect = {
      en: ['Ali Khan (man)', 'Sara Khan (woman)', 'Zain Khan (child 0–3)'],
      sv: ['Ali Khan (man)', 'Sara Khan (kvinna)', 'Zain Khan (barn 0–3 år)'],
      th: ['Ali Khan (ชาย)', 'Sara Khan (หญิง)', 'Zain Khan (เด็กอายุ 0–3 ปี)'],
      ur: ['⁨Ali Khan⁩ (مرد)', '⁨Sara Khan⁩ (خاتون)', '⁨Zain Khan⁩ (0–3 سال کا بچہ)'],
    };
    for (const [lang, lines] of Object.entries(expect)) {
      const b = fresh();
      b.post(family({ lang }));
      const g = guestMails(b, 'a@x.se')[0];
      for (const l of lines) assert.ok(g.body.includes('  • ' + l), `${lang} text has "${l}"`);
      const cat = lines.map((l) => l.match(/\(([^)]+)\)$/)[1]);
      for (const c of cat) assert.ok(g.htmlBody.includes('(' + c + ')'), `${lang} html has (${c})`);
      assert.ok(g.htmlBody.includes('<span dir="auto" style="unicode-bidi:isolate;">Sara Khan</span>'), lang + ' name isolated');
      assert.ok(!/ — (man|woman|infant)/.test(g.body + g.htmlBody), lang + ': no English tags in the guest email');
    }
  });

  test('the owner email shows the men / women / infants counts', () => {
    const b = fresh();
    b.post(family({ lang: 'ur' }));
    const o = ownerMails(b)[0];
    assert.match(o.body, /Men \/ women \/ infants: 1 man · 1 woman · 1 infant \(0–3\)/);
    assert.ok(o.htmlBody.includes('1 man · 1 woman · 1 infant (0–3)'));
    assert.match(o.body, /• Zain Khan \(child 0–3\)/, 'owner list in English');
    b.mails.length = 0;
    b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: ['Sara Khan'] });
    assert.match(ownerMails(b)[0].body, /Men \/ women \/ infants: 1 man · 0 women · 1 infant \(0–3\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('side and category together (issues 15 + 17)', () => {
  const body = (side, over = {}) => ({ ...attendBody({ first: 'Ali', last: 'Khan', category: 'man',
    members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Zain', last: 'Khan', category: 'infant' }], ...over }), side });
  const cancelBody = (over = {}) => ({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', ...over });

  test('the RSVPs header follows the design order: side after phone, men/women/infants after party_size', () => {
    const h = fresh().header();
    assert.deepEqual(h.slice(h.indexOf('phone'), h.indexOf('names') + 1), ['phone', 'side', 'party_size', 'men', 'women', 'infants', 'names']);
  });

  test('one attend row carries the side and the category counts', () => {
    const b = fresh();
    assert.equal(b.post(body('SAIMA')).ok, true);
    const r = b.rows()[0];
    assert.deepEqual([r.side, r.party_size, r.men, r.women, r.infants], ['saima', 3, 1, 1, 1]);
  });

  test('partial and full cancel keep the side and recount the categories', () => {
    const b = fresh();
    b.post(body('asmat'));
    b.post(cancelBody({ cancel: ['Sara Khan'] }));
    b.post(cancelBody({ cancel: ['Zain Khan'] }));
    b.post(cancelBody({ all: true }));
    assert.deepEqual(b.rows().map((r) => [r.type, r.status, r.side, r.party_size, r.men, r.women, r.infants]), [
      ['attend', 'superseded', 'asmat', 3, 1, 1, 1],
      ['cancel', 'superseded', 'asmat', 2, 1, 0, 1],
      ['cancel', 'superseded', 'asmat', 1, 1, 0, 0],
      ['cancel', 'cancelled', 'asmat', 0, 0, 0, 0],
    ]);
  });

  test('cancel by { name, category } (issue 18) keeps the side and recounts; lookup never returns the side', () => {
    const b = fresh();
    b.post(body('saima', { members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Sara', last: 'Khan', category: 'infant' }] }));
    const look = b.get({ action: 'lookup', email: 'a@x.se', phone: '0701234567' });
    assert.ok(!('side' in look), 'lookup answers names/people only');
    assert.equal(b.post(cancelBody({ cancel: [{ name: 'Sara Khan', category: 'infant' }] })).ok, true);
    assert.equal(b.post(cancelBody({ cancel: [{ name: 'Sara Khan', category: 'woman' }], all: true })).ok, true);
    assert.deepEqual(b.rows().map((r) => [r.type, r.status, r.side, r.party_size, r.men, r.women, r.infants, r.names]), [
      ['attend', 'superseded', 'saima', 3, 1, 1, 1, 'Ali Khan — man\nSara Khan — woman\nSara Khan — infant'],
      ['cancel', 'superseded', 'saima', 2, 1, 1, 0, 'Ali Khan — man\nSara Khan — woman'],
      ['cancel', 'cancelled', 'saima', 0, 0, 0, 0, ''],
    ]);
  });

  test('the owner email shows both the Side and the men / women / infants counts', () => {
    const b = fresh();
    b.post(body('saima'));
    let o = ownerMails(b)[0];
    assert.match(o.body, /Side: Saima’s side/);
    assert.match(o.body, /Men \/ women \/ infants: 1 man · 1 woman · 1 infant \(0–3\)/);
    assert.ok(o.htmlBody.includes('>Side<') && o.htmlBody.includes('1 man · 1 woman · 1 infant (0–3)'));
    b.mails.length = 0;
    b.post(cancelBody({ cancel: ['Ali Khan'] }));
    o = ownerMails(b)[0];
    assert.match(o.body, /Side: Saima’s side/);
    assert.match(o.body, /Men \/ women \/ infants: 0 men · 1 woman · 1 infant \(0–3\)/);
  });

  test('an old sheet without side and category columns gets all four appended by name', () => {
    const b = createBackend();
    const old = HEADERS.filter((h) => !['side', 'men', 'women', 'infants'].includes(h));
    const s = b.ss.addSheet('RSVPs', 0);
    old.forEach((h, j) => s.write(1, j + 1, h));
    assert.equal(b.post(body('asmat')).ok, true);
    assert.deepEqual(b.header(), [...old, 'side', 'men', 'women', 'infants']);
    b.setup();
    assert.deepEqual(b.header(), [...old, 'side', 'men', 'women', 'infants'], 'setup() keeps the order');
    b.post(cancelBody({ cancel: ['Zain Khan'] }));
    const r = b.rows()[1];
    assert.deepEqual([r.side, r.party_size, r.men, r.women, r.infants], ['asmat', 2, 1, 1, 0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('side is required on attend (2_main_idea issue 16)', () => {
  const party = (side, over = {}) => sideParty(side, over);
  const cancelBody = (over = {}) => ({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', ...over });
  const BAD = [undefined, '', '   ', 'both', 'asmat,saima', 'asmatt', 'unknown', '=HYPERLINK("x")', 'sa ima', 1, true, null, ['asmat'], { side: 'asmat' }];

  test('an attend POST with no or an invalid side is rejected: nothing written, no email', () => {
    for (const side of BAD) {
      const b = fresh();
      const r = b.post(party(side));
      assert.deepEqual(r, { ok: false, error: 'invalid' }, JSON.stringify(side));
      assert.equal(b.rows().length, 0, JSON.stringify(side));
      assert.equal(b.mails.length, 0, JSON.stringify(side));
    }
  });

  test('a rejected attend leaves the Party\'s existing active row alone (no supersede)', () => {
    const b = fresh();
    b.post(party('saima'));
    b.mails.length = 0;
    const before = JSON.stringify(b.rows());
    assert.deepEqual(b.post(party(undefined, { members: ['Sara Khan', 'Ali Khan'] })), { ok: false, error: 'invalid' });
    assert.equal(JSON.stringify(b.rows()), before);
    assert.equal(b.mails.length, 0);
  });

  test('party_too_large still wins over a missing side', () => {
    const b = fresh({ props: { MAX_PARTY: '2' } });
    assert.deepEqual(b.post(party(undefined, { members: ['Sara Khan', 'Ali Khan'] })), { ok: false, error: 'party_too_large' });
  });

  test('honeypot without a side still pretends success and writes nothing', () => {
    const b = fresh();
    assert.deepEqual(b.post(party(undefined, { website: 'http://spam' })), { ok: true });
    assert.equal(b.rows().length, 0);
    assert.equal(b.mails.length, 0);
  });

  test('resubmitting from the other Side (link or choice) updates the Side on the new active row', () => {
    const b = fresh();
    b.post(party('asmat'));
    const r = b.post(party('SAIMA', { members: ['Sara Khan', 'Ali Khan'] }));
    assert.equal(r.ok, true);
    assert.equal(r.replaced, true);
    assert.deepEqual(b.rows().map((x) => [x.type, x.status, x.side]), [['attend', 'superseded', 'asmat'], ['attend', 'active', 'saima']]);
    assert.match(ownerMails(b).at(-1).body, /Side: Saima’s side/);
  });

  test('cancels never need a side and keep the Party\'s (a side in the body is ignored)', () => {
    const b = fresh();
    b.post(party('saima', { members: ['Sara Khan', 'Ali Khan'] }));
    for (const side of [undefined, '', 'nope', 'asmat']) {
      const body = cancelBody({ cancel: ['Ali Khan'] });
      if (side !== undefined) body.side = side;
      const b2 = fresh();
      b2.post(party('saima', { members: ['Sara Khan', 'Ali Khan'] }));
      assert.equal(b2.post(body).ok, true, JSON.stringify(side));
      assert.equal(active(b2)[0].side, 'saima', JSON.stringify(side));
    }
    assert.equal(b.post(cancelBody({ all: true })).ok, true);
    assert.deepEqual(b.rows().map((x) => [x.status, x.side]), [['superseded', 'saima'], ['cancelled', 'saima']]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('partial cancel keeps category counts right (2_main_idea issue 18)', () => {
  const COUNTS = (r) => [r.party_size, r.men, r.women, r.infants];
  const family = (members = [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Zain', last: 'Khan', category: 'infant' }]) =>
    attendBody({ first: 'Ali', last: 'Khan', category: 'man', members });
  const cancel = (b, list, extra = {}) => b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: list, ...extra });
  const invariant = (r) => assert.equal(r.party_size, r.men + r.women + r.infants, 'party_size = men + women + infants');

  test('cancelling the infant from a 1/1/1 Party → party_size 2, men 1, women 1, infants 0', () => {
    const b = fresh();
    b.post(family());
    const r = cancel(b, [{ name: 'Zain Khan', category: 'infant' }]);
    assert.deepEqual(r, { ok: true, cancelled: ['Zain Khan'], remaining: ['Ali Khan', 'Sara Khan'], status: 'active' });
    const neu = b.rows()[1];
    assert.equal(neu.status, 'active');
    assert.deepEqual(COUNTS(neu), [2, 1, 1, 0]);
    invariant(neu);
    assert.equal(neu.names, 'Ali Khan — man\nSara Khan — woman', 'remaining lines keep their tags');
    assert.doesNotMatch(neu.note, /untagged/);
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 2, households: 1 });
  });

  test('the invariant holds on every new active row through a chain of partial cancels', () => {
    const b = fresh();
    b.post(family([{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Zain', last: 'Khan', category: 'infant' },
      { first: 'Omar', last: 'Khan', category: 'man' }, { first: 'Lina', last: 'Khan', category: 'woman' }]));
    cancel(b, [{ name: 'Omar Khan', category: 'man' }, 'Lina Khan']);
    cancel(b, ['Sara Khan']);
    const rows = b.rows();
    assert.deepEqual(rows.map(COUNTS), [[5, 2, 2, 1], [3, 1, 1, 1], [2, 1, 0, 1]]);
    rows.forEach(invariant);
    assert.equal(rows[2].names, 'Ali Khan — man\nZain Khan — infant');
    assert.deepEqual(active(b).length, 1);
  });

  test('same name, different category: the exact { name, category } drops; a plain name drops the first', () => {
    const b = fresh();
    b.post(family([{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Sara', last: 'Khan', category: 'infant' }]));
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0701234567' }).people,
      [{ name: 'Ali Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }, { name: 'Sara Khan', category: 'infant' }]);
    cancel(b, [{ name: 'Sara Khan', category: 'infant' }]);
    let neu = b.rows()[1];
    assert.equal(neu.names, 'Ali Khan — man\nSara Khan — woman', 'the infant went, not the woman listed first');
    assert.deepEqual(COUNTS(neu), [2, 1, 1, 0]);

    const c = fresh();
    c.post(family([{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Sara', last: 'Khan', category: 'infant' }]));
    cancel(c, ['Sara Khan']);   // older page: plain name → first match
    neu = c.rows()[1];
    assert.equal(neu.names, 'Ali Khan — man\nSara Khan — infant');
    assert.deepEqual(COUNTS(neu), [2, 1, 0, 1]);
  });

  test('a category that no longer matches (tag edited since the lookup) falls back to the name', () => {
    const b = fresh();
    b.post(family());
    const r = cancel(b, [{ name: 'Sara Khan', category: 'man' }]);
    assert.deepEqual(r.remaining, ['Ali Khan', 'Zain Khan']);
    assert.deepEqual(COUNTS(b.rows()[1]), [2, 1, 0, 1]);
  });

  test('bad cancel entries → invalid, nothing written', () => {
    const b = fresh();
    b.post(family());
    for (const bad of [[{ name: 'Zain Khan', category: 'boy' }], [{ name: '' }], [{ category: 'infant' }], [['Zain Khan']], [{ name: 'Nobody', category: 'man' }],
      [{ name: 'Zain Khan', category: 'infant' }, { name: 'Zain Khan', category: 'infant' }],
      [{ name: { first: 'Zain' }, category: 'infant' }], [42], [{ name: 'Z'.repeat(162), category: 'infant' }], ['Z'.repeat(162)]]) {
      assert.deepEqual(cancel(b, bad), { ok: false, error: 'invalid' }, JSON.stringify(bad));
    }
    assert.equal(b.rows().length, 1);
    assert.equal(b.rows()[0].status, 'active');
  });

  test('a duplicate { name, category } never falls back to a same-name person of another category', () => {
    const b = fresh();
    b.post(family([{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Sara', last: 'Khan', category: 'infant' }]));
    const r = cancel(b, [{ name: 'Sara Khan', category: 'infant' }, { name: 'Sara Khan', category: 'infant' }]);
    assert.deepEqual(r, { ok: false, error: 'invalid' }, 'the woman is not silently cancelled');
    assert.equal(b.rows().length, 1, 'nothing written');
    assert.equal(b.rows()[0].status, 'active');
    // A tag edited since the lookup (no one had { Sara Khan, man }) still falls back to the name.
    assert.deepEqual(cancel(b, [{ name: 'Sara Khan', category: 'infant' }, { name: 'Sara Khan', category: 'man' }]).remaining, ['Ali Khan']);
  });

  test('{ name, category } entries with a missing category act like a plain name', () => {
    const b = fresh();
    b.post(family());
    assert.deepEqual(cancel(b, [{ name: 'Zain Khan' }, { name: 'Sara Khan', category: '' }]).remaining, ['Ali Khan']);
    assert.deepEqual(COUNTS(b.rows()[1]), [1, 1, 0, 0]);
  });

  test('a full cancel still marks the Party cancelled (all:true, or every person picked)', () => {
    const b = fresh();
    b.post(family());
    const everyone = [{ name: 'Ali Khan', category: 'man' }, { name: 'Sara Khan', category: 'woman' }, { name: 'Zain Khan', category: 'infant' }];
    const r = cancel(b, everyone, { all: true });
    assert.equal(r.status, 'cancelled');
    const gone = b.rows()[1];
    assert.deepEqual([gone.status, ...COUNTS(gone), gone.names], ['cancelled', 0, 0, 0, 0, '']);
    assert.doesNotMatch(gone.note, /untagged/);
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0701234567' }), { ok: false, error: 'not_found' });

    const c = fresh();
    c.post(family());
    assert.equal(cancel(c, everyone).status, 'cancelled');
    assert.deepEqual(COUNTS(c.rows()[1]), [0, 0, 0, 0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('integration review: email links and cancel lists keep side and categories', () => {
  const family = () => attendBody({ first: 'Ali', last: 'Khan', category: 'man', side: 'saima', lang: 'sv',
    members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Zain', last: 'Khan', category: 'infant' }] });

  test('"View the invitation" link carries ?lang= and &side= of the Party (attend and cancel emails)', () => {
    const b = fresh();
    b.post(family());
    const site = 'https://chatchaisornkarn.github.io/asmat-saima/?lang=sv&side=saima';
    const [g] = guestMails(b, 'a@x.se');
    assert.ok(g.body.includes(site), 'plain text');
    assert.ok(g.htmlBody.includes(site.replace('&', '&amp;')), 'html');
    b.mails.length = 0;
    b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', cancel: [{ name: 'Zain Khan', category: 'infant' }] });
    assert.ok(guestMails(b, 'a@x.se')[0].body.includes('?lang=en&side=saima'), 'a cancel keeps the row side');
  });

  test('siteUrlFor_: side only when asmat | saima; an existing query string is extended', () => {
    const b = fresh();
    const cfg = { siteUrl: 'https://x.example/' };
    assert.equal(b.call('siteUrlFor_', cfg, 'en', 'asmat'), 'https://x.example/?lang=en&side=asmat');
    for (const bad of ['', undefined, 'Saima ', 'other']) assert.equal(b.call('siteUrlFor_', cfg, 'ur', bad), 'https://x.example/?lang=ur');
    assert.equal(b.call('siteUrlFor_', { siteUrl: 'https://x.example/?a=1' }, 'th', 'saima'), 'https://x.example/?a=1&lang=th&side=saima');
  });

  test('partial cancel: guest email lists the remaining people with localized categories; owner email tags the cancelled', () => {
    const b = fresh();
    b.post(family());
    b.mails.length = 0;
    b.post({ action: 'cancel', lang: 'sv', email: 'a@x.se', phone: '0701234567', cancel: [{ name: 'Zain Khan', category: 'infant' }] });
    const [g] = guestMails(b, 'a@x.se');
    assert.ok(g.body.includes('  • Ali Khan (man)') && g.body.includes('  • Sara Khan (kvinna)'), 'remaining tagged in Swedish');
    assert.ok(g.htmlBody.includes('(kvinna)'), 'html remaining tagged');
    const [o] = ownerMails(b);
    assert.match(o.body, /Cancelled \(1\):\n {2}• Zain Khan \(child 0–3\)/);
    assert.ok(o.htmlBody.includes('Zain Khan (child 0–3)'));
    assert.match(o.body, /Still coming \(2\):\n {2}• Ali Khan \(man\)\n {2}• Sara Khan \(woman\)/);
  });

  test('full cancel: owner email lists every cancelled person with their category', () => {
    const b = fresh();
    b.post(family());
    b.mails.length = 0;
    b.post({ action: 'cancel', lang: 'en', email: 'a@x.se', phone: '0701234567', all: true });
    assert.match(ownerMails(b)[0].body, /Cancelled \(3\):\n {2}• Ali Khan \(man\)\n {2}• Sara Khan \(woman\)\n {2}• Zain Khan \(child 0–3\)/);
  });
});
