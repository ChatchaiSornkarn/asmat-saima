// 2_main_idea issue 19 — Guests tab (one row per person) and the Summary's Side × category booking table + check.
// The formulas Setup.gs writes are checked structurally AND computed with a small Sheets evaluator
// (formula-eval.mjs) over the harness's RSVPs grid, so the numbers below are what the real Sheet should show.
//   node --test 'tests/apps-script/*.test.mjs'
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createBackend, attendBody } from './harness.mjs';
import { evaluateSheet, at, rowOf } from './formula-eval.mjs';

const fresh = () => { const b = createBackend(); b.setup(); b.mails.length = 0; return b; };
const HEADERS = ['timestamp', 'type', 'email', 'phone', 'side', 'party_size', 'men', 'women', 'infants', 'names', 'message', 'language',
  'status', 'replaces', 'late', 'note'];
const C = (h) => HEADERS.indexOf(h) + 1;
const R = (h) => { const L = String.fromCharCode(64 + C(h)); return `RSVPs!${L}2:${L}`; };

/** Guests tab computed: array of row arrays (header first). */
const guests = (b) => evaluateSheet(b.ss, 'Guests').filter((row) => row && row[0] !== undefined).map((row) => row.slice(0, 6));
const summary = (b) => evaluateSheet(b.ss, 'Summary');
/** Booking table row by label → { men, women, infants, total }. */
const booking = (s, label) => { const r = rowOf(s, label); return { men: at(s, r, 2), women: at(s, r, 3), infants: at(s, r, 4), total: at(s, r, 5) }; };
const NO_SIDE = 'Empty or unrecognised side';
const check = (s) => at(s, rowOf(s, 'Check'), 2);

/** Three Parties: Asmat side (man + woman + infant), Saima side (woman + man), no side (woman).
 *  Since issue 16 the script rejects an attend without a valid side, so the no-side Party is posted with a side and
 *  then its side cell is cleared by hand (as an owner editing the Sheet would). */
function seed(b) {
  b.post({ ...attendBody({ first: 'Ali', last: 'Khan', email: 'ali@x.se', phone: '0701111111', category: 'man',
    members: [{ first: 'Sara', last: 'Khan', category: 'woman' }, { first: 'Zain', last: 'Khan', category: 'infant' }] }), side: 'asmat' });
  b.post({ ...attendBody({ first: 'Hina', last: 'Ali', email: 'hina@x.se', phone: '0702222222', category: 'woman',
    members: [{ first: 'Omar', last: 'Ali', category: 'man' }] }), side: 'saima' });
  assert.equal(b.post(attendBody({ first: 'Lone', last: 'Guest', email: 'lone@x.se', phone: '0703333333', category: 'woman' })).ok, true);
  setCell(b, rowFor(b, 'lone@x.se'), 'side', '');
}
/** Write one RSVPs cell, finding the column by its header (works for older sheets with columns in another order). */
function setCell(b, rowNum, header, value) {
  const sh = b.sheet('RSVPs');
  const col = Array.from({ length: sh.getLastColumn() }, (_, j) => String(sh.cell(1, j + 1).value)).indexOf(header) + 1;
  assert.ok(col > 0, `RSVPs has a ${header} column`);
  sh.write(rowNum, col, value);
}
const rowFor = (b, email) => b.rows().find((r) => r.email === email && r.status === 'active')._row;

describe('Guests tab formula (issue 19)', () => {
  test('header row, columns from header names, split on NAME_TAG_SEP, balanced parentheses', () => {
    const b = fresh();
    const f = b.sheet('Guests').cell(1, 1).formula;
    assert.match(f, /^=LET\(/);
    assert.ok(f.includes('HSTACK("Name", "Category", "Side", "Party email", "Party phone", "RSVP time")'));
    for (const h of ['status', 'names', 'side', 'email', 'phone', 'timestamp']) assert.ok(f.includes(R(h)), h);
    assert.ok(f.includes(`"${b.context.NAME_TAG_SEP}"`), 'separator from NAME_TAG_SEP');
    assert.ok(f.includes('FIND(sep, x)') && f.includes('IFERROR(SPLIT(INDEX(parties, idx, 1), CHAR(10)), "(empty names)")'));
    assert.ok(f.includes('"(blank line)"'));
    assert.ok(!/;/.test(f.replace(/"[^"]*"/g, '')), 'comma separators only (setFormula syntax)');
    let depth = 0;
    for (const ch of f.replace(/"[^"]*"/g, '')) { if (ch === '(') depth++; if (ch === ')') depth--; assert.ok(depth >= 0); }
    assert.equal(depth, 0);
  });

  test('empty sheet → just the header', () => {
    const b = fresh();
    assert.deepEqual(guests(b), [['Name', 'Category', 'Side', 'Party email', 'Party phone', 'RSVP time']]);
  });

  test('one row per person across active rows with name, category, side, email', () => {
    const b = fresh();
    seed(b);
    const g = guests(b);
    assert.deepEqual(g.slice(1).map((r) => r.slice(0, 4)), [
      ['Ali Khan', 'man', 'asmat', 'ali@x.se'],
      ['Sara Khan', 'woman', 'asmat', 'ali@x.se'],
      ['Zain Khan', 'infant', 'asmat', 'ali@x.se'],
      ['Hina Ali', 'woman', 'saima', 'hina@x.se'],
      ['Omar Ali', 'man', 'saima', 'hina@x.se'],
      ['Lone Guest', 'woman', '', 'lone@x.se'],
    ]);
    assert.equal(g[1][4], '+46701111111', 'party phone');
    assert.ok(g[1][5] instanceof Date || typeof g[1][5] === 'object', 'RSVP time');
  });

  test('superseded and cancelled rows are not listed', () => {
    const b = fresh();
    seed(b);
    // Hina replies again with a smaller party → old row superseded; Lone cancels completely → cancelled.
    b.post({ ...attendBody({ first: 'Hina', last: 'Ali', email: 'hina@x.se', phone: '0702222222', category: 'woman' }), side: 'saima' });
    b.post({ action: 'cancel', lang: 'en', email: 'lone@x.se', phone: '0703333333', all: true });
    assert.ok(b.rows().some((r) => r.status === 'superseded') && b.rows().some((r) => r.status === 'cancelled'));
    assert.deepEqual(guests(b).slice(1).map((r) => r[0]), ['Ali Khan', 'Sara Khan', 'Zain Khan', 'Hina Ali']);
  });

  test('a hand-edited line without the tag → whole line as name, empty category; stray spaces / CR trimmed', () => {
    const b = fresh();
    seed(b);
    setCell(b, rowFor(b, 'ali@x.se'), 'names', 'Ali Khan — man\r\n  Sara   Khan  \nZain Khan — Infant ');
    assert.deepEqual(guests(b).slice(1, 4).map((r) => r.slice(0, 2)), [['Ali Khan', 'man'], ['Sara Khan', ''], ['Zain Khan', 'infant']]);
  });

  test('a names cell with only line breaks → one "(empty names)" row, not a broken tab; check flags it', () => {
    for (const names of ['\n', '\n\n']) {
      const b = fresh();
      seed(b);
      setCell(b, rowFor(b, 'lone@x.se'), 'names', names);
      const g = guests(b);
      assert.equal(g.length, 1 + 6, JSON.stringify(names));
      assert.deepEqual(g.at(-1).slice(0, 4), ['(empty names)', '', '', 'lone@x.se'], JSON.stringify(names));
      assert.ok(g.every((row) => row.every((v) => !(v instanceof Error))), 'no error cells');
      const s = summary(b);
      assert.equal(at(s, rowOf(s, 'On the Guests tab (by names tag)'), 3), 2, 'the placeholder has no category');
      assert.equal(check(s), '⚠ Mismatch', JSON.stringify(names));
    }
  });

  test('blank lines (only spaces / control characters) → visible "(blank line)" rows with empty category; check flags it', () => {
    const b = fresh();
    seed(b);
    setCell(b, rowFor(b, 'ali@x.se'), 'names', 'Ali Khan — man\n   \nSara Khan — woman\n\r\nZain Khan — infant');
    assert.deepEqual(guests(b).slice(1, 6).map((r) => r.slice(0, 2)),
      [['Ali Khan', 'man'], ['(blank line)', ''], ['Sara Khan', 'woman'], ['(blank line)', ''], ['Zain Khan', 'infant']]);
    const s = summary(b);
    assert.equal(at(s, rowOf(s, 'People listed on the Guests tab'), 2), 8);
    assert.equal(check(s), '⚠ Mismatch');
  });

  test('a names cell of spaces only → one "(blank line)" row', () => {
    const b = fresh();
    seed(b);
    setCell(b, rowFor(b, 'lone@x.se'), 'names', '   ');
    assert.deepEqual(guests(b).at(-1).slice(0, 2), ['(blank line)', '']);
    assert.equal(check(summary(b)), '⚠ Mismatch');
    setCell(b, rowFor(b, 'lone@x.se'), 'names', '\r\n\n');   // CR survives SPLIT on LF, then CLEAN → blank
    assert.deepEqual(guests(b).at(-1).slice(0, 2), ['(blank line)', '']);
  });
});

describe('Summary booking table and check (issue 19)', () => {
  test('labels and SUMIFS over active rows by side', () => {
    const b = fresh();
    const s = summary(b);
    const head = rowOf(s, 'Venue booking (active rows)');
    assert.deepEqual([2, 3, 4, 5].map((c) => at(s, head, c)), ['Men', 'Women', 'Infants (0–3)', 'Total']);
    const labels = [1, 2, 3, 4, 5].map((i) => at(s, head + i, 1));
    assert.deepEqual(labels, ['Asmat side', 'Saima side', NO_SIDE, 'Total', 'On the Guests tab (by names tag)']);
    const sheet = b.sheet('Summary');
    const f = (r, c) => sheet.cell(r, c).formula;
    assert.equal(f(head + 1, 2), `=SUMIFS(${R('men')}, ${R('status')}, "active", ${R('side')}, "asmat")`);
    assert.equal(f(head + 2, 4), `=SUMIFS(${R('infants')}, ${R('status')}, "active", ${R('side')}, "saima")`);
    assert.equal(f(head + 4, 3), `=SUMIFS(${R('women')}, ${R('status')}, "active")`);
    assert.equal(f(head + 3, 2), `=B${head + 4} - B${head + 1} - B${head + 2}`, 'no side = total − the two sides');
    assert.equal(f(head + 1, 5), `=SUM(B${head + 1}:D${head + 1})`);
    assert.equal(f(head + 5, 2), '=COUNTIFS(Guests!B2:B, "man")');
    // Old content still there.
    assert.equal(at(s, rowOf(s, 'Guests coming'), 2), 0);
    assert.equal(check(s), '✓ OK', 'empty sheet passes the check');
  });

  test('numbers match the replies (hand count) and the check passes', () => {
    const b = fresh();
    seed(b);
    const s = summary(b);
    assert.deepEqual(booking(s, 'Asmat side'), { men: 1, women: 1, infants: 1, total: 3 });
    assert.deepEqual(booking(s, 'Saima side'), { men: 1, women: 1, infants: 0, total: 2 });
    assert.deepEqual(booking(s, NO_SIDE), { men: 0, women: 1, infants: 0, total: 1 });
    assert.deepEqual(booking(s, 'Total'), { men: 2, women: 3, infants: 1, total: 6 });
    assert.deepEqual(booking(s, 'On the Guests tab (by names tag)'), { men: 2, women: 3, infants: 1, total: 6 });
    assert.equal(at(s, rowOf(s, 'Guests coming'), 2), 6);
    assert.equal(at(s, rowOf(s, 'Households (active RSVPs)'), 2), 3);
    assert.equal(at(s, rowOf(s, 'People listed on the Guests tab'), 2), 6);
    assert.equal(at(s, rowOf(s, 'Men + women + infants (active)'), 2), 6);
    assert.equal(at(s, rowOf(s, 'Active rows where men + women + infants ≠ party_size'), 2), 0);
    assert.equal(check(s), '✓ OK');
    assert.match(String(at(s, rowOf(s, 'Check'), 6)), /^✓/);
  });

  test('superseded and cancelled rows are not counted', () => {
    const b = fresh();
    seed(b);
    b.post({ ...attendBody({ first: 'Hina', last: 'Ali', email: 'hina@x.se', phone: '0702222222', category: 'woman' }), side: 'saima' });
    b.post({ action: 'cancel', lang: 'en', email: 'lone@x.se', phone: '0703333333', all: true });
    const s = summary(b);
    assert.deepEqual(booking(s, 'Saima side'), { men: 0, women: 1, infants: 0, total: 1 });
    assert.deepEqual(booking(s, NO_SIDE), { men: 0, women: 0, infants: 0, total: 0 });
    assert.deepEqual(booking(s, 'Total'), { men: 1, women: 2, infants: 1, total: 4 });
    assert.equal(at(s, rowOf(s, 'Guests coming'), 2), 4);
    assert.equal(check(s), '✓ OK');
  });

  test('a partial cancel: the remaining people (active cancel row) are counted, the cancelled one is not', () => {
    const b = fresh();
    seed(b);
    assert.equal(b.post({ action: 'cancel', lang: 'en', email: 'ali@x.se', phone: '0701111111', cancel: ['Sara Khan'] }).ok, true);
    const s = summary(b);
    assert.deepEqual(booking(s, 'Asmat side'), { men: 1, women: 0, infants: 1, total: 2 });
    assert.deepEqual(guests(b).slice(1).filter((r) => r[3] === 'ali@x.se').map((r) => r[0]), ['Ali Khan', 'Zain Khan']);
    assert.equal(check(s), '✓ OK');
  });

  test('a names cell edited by hand without fixing the counts → check flags a mismatch', () => {
    const cases = {
      'line added': 'Ali Khan — man\nSara Khan — woman\nZain Khan — infant\nNew Person — man',
      'line removed': 'Ali Khan — man\nSara Khan — woman',
      're-tagged': 'Ali Khan — man\nSara Khan — man\nZain Khan — infant',
      'tag dropped': 'Ali Khan — man\nSara Khan\nZain Khan — infant',
    };
    for (const [what, names] of Object.entries(cases)) {
      const b = fresh();
      seed(b);
      setCell(b, rowFor(b, 'ali@x.se'), 'names', names);
      const s = summary(b);
      assert.equal(check(s), '⚠ Mismatch', what);
      assert.match(String(at(s, rowOf(s, 'Check'), 6)), /^⚠/, what);
    }
  });

  test('a count edited without party_size (or vice versa) → mismatch and the bad-row counter', () => {
    const b = fresh();
    seed(b);
    setCell(b, rowFor(b, 'hina@x.se'), 'men', 2);
    const s = summary(b);
    assert.equal(at(s, rowOf(s, 'Active rows where men + women + infants ≠ party_size'), 2), 1);
    assert.equal(check(s), '⚠ Mismatch');
  });

  test('a moved side cell moves the people in the table (and the Guests tab)', () => {
    const b = fresh();
    seed(b);
    setCell(b, rowFor(b, 'lone@x.se'), 'side', 'asmat');
    const s = summary(b);
    assert.deepEqual(booking(s, 'Asmat side'), { men: 1, women: 2, infants: 1, total: 4 });
    assert.deepEqual(booking(s, NO_SIDE), { men: 0, women: 0, infants: 0, total: 0 });
    assert.equal(guests(b).at(-1)[2], 'asmat');
  });

  test('a mistyped side cell lands in "Empty or unrecognised side"', () => {
    const b = fresh();
    seed(b);
    setCell(b, rowFor(b, 'hina@x.se'), 'side', 'saimaa');
    const s = summary(b);
    assert.deepEqual(booking(s, 'Saima side'), { men: 0, women: 0, infants: 0, total: 0 });
    assert.deepEqual(booking(s, NO_SIDE), { men: 1, women: 2, infants: 0, total: 3 });
    assert.equal(check(s), '✓ OK');
  });

  test('setup() is idempotent: same formulas after re-running, and still right with rows present', () => {
    const b = fresh();
    seed(b);
    const snap = (name) => JSON.stringify(b.sheet(name).grid.map((row) => row && row.map((c) => c && (c.formula || c.value))));
    const before = [snap('Guests'), snap('Summary')];
    b.setup(); b.setup();
    assert.deepEqual([snap('Guests'), snap('Summary')], before);
    assert.equal(check(summary(b)), '✓ OK');
  });

  test('columns are found by header name: an older sheet with side/men/women/infants at the end still works', () => {
    const b = createBackend();
    const old = ['timestamp', 'type', 'email', 'phone', 'party_size', 'names', 'message', 'language', 'status', 'replaces', 'note'];
    const sh = b.ss.addSheet('RSVPs');
    old.forEach((h, i) => sh.write(1, i + 1, h));
    b.setup();
    seed(b);
    const s = summary(b);
    assert.deepEqual(booking(s, 'Total'), { men: 2, women: 3, infants: 1, total: 6 });
    assert.equal(check(s), '✓ OK');
    assert.deepEqual(guests(b)[1].slice(0, 4), ['Ali Khan', 'man', 'asmat', 'ali@x.se']);
  });
});
