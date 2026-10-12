// Unit tests of the Sheets formula evaluator used by booking-view.test.mjs (2_main_idea issue 19).
//   node --test 'tests/apps-script/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSheet, FormulaError } from './formula-eval.mjs';

/** Minimal MockSpreadsheet stand-in: one sheet "S" with the given cells ({ r, c, value | formula }, 0-based). */
function sheetOf(cells) {
  const grid = [];
  for (const { r, c, ...cell } of cells) (grid[r] = grid[r] || [])[c] = cell;
  return { find: (name) => (name === 'S' ? { grid } : null) };
}
const calc = (formula, cells = []) => evaluateSheet(sheetOf([...cells, { r: 9, c: 9, formula }]), 'S')[9][9];

test('TRIM strips and collapses ASCII spaces only (not tabs / non-breaking spaces)', () => {
  assert.equal(calc('=TRIM("  a   b  ")'), 'a b');
  assert.equal(calc('=TRIM(CHAR(9) & "a" & CHAR(9))'), '\ta\t');
  assert.equal(calc('=TRIM(CHAR(160) & "a ")'), ' a');
});

test('COUNTA counts a formula\'s "" but not an empty cell', () => {
  const cells = [{ r: 0, c: 0, value: 'x' }, { r: 1, c: 0, formula: '=""' }, { r: 2, c: 0, value: '' }, { r: 4, c: 0, value: 'y' }];
  assert.equal(calc('=COUNTA(A1:A5)', cells), 3);
  assert.equal(calc('=COUNTA(MAP(SEQUENCE(3), LAMBDA(x, "")))'), 3);
});

test('MAKEARRAY lambda returning an array → #VALUE!, like MAP', () => {
  const v = calc('=MAKEARRAY(2, 1, LAMBDA(r, c, SEQUENCE(2)))');
  assert.ok(v instanceof FormulaError && v.code === '#VALUE!');
  const m = calc('=MAP(SEQUENCE(2), LAMBDA(x, SEQUENCE(2)))');
  assert.ok(m instanceof FormulaError && m.code === '#VALUE!');
});

test('IFERROR catches SPLIT of text with no parts', () => {
  assert.ok(calc('=SPLIT(CHAR(10), CHAR(10))') instanceof FormulaError);
  assert.equal(calc('=IFERROR(SPLIT(CHAR(10), CHAR(10)), "none")'), 'none');
});
