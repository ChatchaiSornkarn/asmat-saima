// Tests for the Apps Script backend (apps-script/*.gs), run in Node with mocked Apps Script services.
//   node --test 'tests/apps-script/*.test.mjs'        (from the asmat-saima folder; Node 22+)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createBackend, attendBody } from './harness.mjs';

const fresh = (opts) => { const b = createBackend(opts); b.setup(); b.mails.length = 0; return b; };
const active = (b) => b.rows().filter((r) => r.status === 'active');
const guestMails = (b, to) => b.mails.filter((m) => m.to === to);
const ownerMails = (b) => b.mails.filter((m) => m.to === 'owner@example.com');
const HEADERS = ['timestamp', 'type', 'email', 'phone', 'party_size', 'names', 'message', 'language', 'status', 'replaces', 'note'];

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
    assert.equal(b.properties.get('EVENT_DATE'), '2026-12-06');
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
    assert.match(f, /RSVPs!I2:I/);        // status
    assert.match(f, /RSVPs!F2:F/);        // names
    assert.match(f, /"active"/);
    assert.match(f, /SPLIT\(.*CHAR\(10\)\)/);
    for (const col of ['C2:C', 'D2:D', 'A2:A']) assert.ok(f.includes('RSVPs!' + col), col);
    let depth = 0;
    for (const ch of f.replace(/"[^"]*"/g, '')) { if (ch === '(') depth++; if (ch === ')') depth--; assert.ok(depth >= 0); }
    assert.equal(depth, 0, 'balanced parentheses');
    // Only A1 (formula) and the side hint in F1 are written.
    const written = g.writes.map((w) => `${w.r},${w.c}`);
    assert.deepEqual([...new Set(written)].sort(), ['1,1', '1,6']);
  });

  test('Summary uses SUMIFS/COUNTIFS over active rows and a last-updated cell', () => {
    const b = fresh();
    const s = b.sheet('Summary');
    const formulas = s.grid.flat().filter((c) => c && c.formula).map((c) => c.formula);
    assert.ok(formulas.includes('=SUMIFS(RSVPs!E2:E, RSVPs!I2:I, "active")'), 'guests');
    assert.ok(formulas.includes('=COUNTIFS(RSVPs!I2:I, "active")'), 'households');
    assert.ok(formulas.includes('=COUNTIFS(RSVPs!B2:B, "attend")'));
    assert.ok(formulas.includes('=COUNTIFS(RSVPs!B2:B, "cancel")'));
    assert.ok(formulas.some((f) => /MAX\(RSVPs!A2:A\)/.test(f)), 'last RSVP received');
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
    assert.deepEqual(r, { ok: true, partySize: 2, names: ['Asmat Khan', 'Sara Khan'], replaced: false });
    const rows = b.rows();
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.type, 'attend');
    assert.equal(row.email, 'a@x.se');
    assert.equal(row.phone, '+46701234567', 'phone stays text, normalised');
    assert.equal(row.party_size, 2);
    assert.equal(row.names, 'Asmat Khan\nSara Khan');
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
    assert.equal(rawAt(6), "'=HYPERLINK(\"http://evil\",\"x\") +SUM(1)\n@me -1");
    assert.equal(rawAt(7), "'=1+2");
    assert.equal(rawAt(4), "'+46701234567");
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
    assert.deepEqual(b.get({ action: 'lookup', email: 'A@x.se ', phone: '+46701234567' }), { ok: true, names: ['Asmat Khan', 'Sara Khan'] });
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
    assert.equal(neu.names, 'Asmat Khan\nSara Khan');
    assert.equal(neu.replaces, '2');
    assert.equal(neu.language, 'sv');
    assert.match(neu.note, /Cancelled: Ali Khan/);
    assert.equal(neu.message, 'Vegetarian', 'message carried over');
    assert.deepEqual(b.get({ action: 'count' }), { ok: true, guests: 2, households: 1 });
    assert.deepEqual(b.get({ action: 'lookup', email: 'a@x.se', phone: '0701234567' }), { ok: true, names: ['Asmat Khan', 'Sara Khan'] });
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
    assert.match(g.body, /Sunday, 6 December 2026/);
    assert.match(g.body, /Säve Flygplatsväg 26/);
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
      en: { subj: /Your RSVP is confirmed/, date: 'Sunday, 6 December 2026', dir: 'ltr' },
      sv: { subj: /Ditt OSA är bekräftat/, date: 'Söndag 6 december 2026', dir: 'ltr' },
      th: { subj: /ยืนยันการตอบรับ/, date: 'วันอาทิตย์ที่ 6 ธันวาคม พ.ศ. 2569', dir: 'ltr' },
      ur: { subj: /نکاح/, date: 'بروز اتوار، 6 دسمبر 2026ء', dir: 'rtl' },
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
    assert.ok(!f.body.includes('Säve'), 'no venue block for a full cancel');
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
