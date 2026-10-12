// A small Google Sheets formula evaluator for the test harness (2_main_idea issue 19).
// It understands only the syntax and functions that Setup.gs writes into the Guests and Summary tabs, with
// Sheets semantics where they matter (case-insensitive "=" and criteria, "" = empty cell, FIND error → IFERROR,
// SPLIT drops empty parts, TRIM strips/collapses ASCII spaces, COUNTA counts a formula's "", arrays broadcast in operators). An unknown function throws,
// so a typo in a formula fails the test instead of silently passing.
//
//   import { evaluateSheet } from './formula-eval.mjs';
//   const grid = evaluateSheet(b.ss, 'Guests');   // 2-D array of computed values (spilled arrays included)

export class FormulaError extends Error {
  constructor(code, msg) { super(`${code}${msg ? ' ' + msg : ''}`); this.code = code; }
}
const err = (code, msg) => { throw new FormulaError(code, msg); };

// ── Tokenizer ────────────────────────────────────────────────────────────────────────────────────
function tokenize(src) {
  const t = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let s = ''; i++;
      for (;;) {
        if (i >= src.length) throw new Error('unterminated string in formula');
        if (src[i] === '"') { if (src[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; }
        s += src[i++];
      }
      t.push({ k: 'str', v: s }); continue;
    }
    const two = src.slice(i, i + 2);
    if (['<>', '<=', '>='].includes(two)) { t.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/&=<>(),'.includes(ch)) { t.push({ k: ch === '(' || ch === ')' || ch === ',' ? ch : 'op', v: ch }); i++; continue; }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { t.push({ k: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_.]*(![A-Za-z$]+\$?\d*(:[A-Za-z$]+\$?\d*)?)?(:[A-Za-z$]+\$?\d*)?/.exec(src.slice(i));
    if (id) { t.push({ k: 'id', v: id[0] }); i += id[0].length; continue; }
    throw new Error(`unexpected character ${JSON.stringify(ch)} in formula at ${i}`);
  }
  return t;
}

// ── Parser (precedence: comparison < & < + - < * / < unary) ─────────────────────────────────────
function parse(src) {
  const t = tokenize(src.replace(/^=/, ''));
  let p = 0;
  const peek = () => t[p];
  const eat = (k, v) => {
    const x = t[p];
    if (!x || x.k !== k || (v !== undefined && x.v !== v)) throw new Error(`expected ${v || k} at token ${p} (${x ? x.v : 'end'})`);
    p++; return x;
  };
  const isOp = (...ops) => peek() && peek().k === 'op' && ops.includes(peek().v);
  const bin = (next, ops) => () => {
    let left = next();
    while (isOp(...ops)) { const op = t[p++].v; left = { type: 'bin', op, left, right: next() }; }
    return left;
  };
  const primary = () => {
    const x = peek();
    if (!x) throw new Error('unexpected end of formula');
    if (x.k === 'op' && (x.v === '-' || x.v === '+')) { p++; const e = primary(); return x.v === '-' ? { type: 'neg', e } : e; }
    if (x.k === 'num') { p++; return { type: 'lit', v: x.v }; }
    if (x.k === 'str') { p++; return { type: 'lit', v: x.v }; }
    if (x.k === '(') { p++; const e = expr(); eat(')'); return e; }
    if (x.k === 'id') {
      p++;
      if (peek() && peek().k === '(') {
        p++;
        const args = [];
        if (peek().k !== ')') { args.push(expr()); while (peek().k === ',') { p++; args.push(expr()); } }
        eat(')');
        return { type: 'call', name: x.v.toUpperCase(), args };
      }
      if (/^(TRUE|FALSE)$/i.test(x.v)) return { type: 'lit', v: /^TRUE$/i.test(x.v) };
      if (x.v.includes('!') || /^\$?[A-Z]{1,3}\$?\d+(:\$?[A-Z]{1,3}\$?\d*)?$/.test(x.v)) return { type: 'ref', v: x.v };
      return { type: 'name', v: x.v.toLowerCase() };
    }
    throw new Error(`unexpected token ${x.v}`);
  };
  const mul = bin(primary, ['*', '/']);
  const add = bin(mul, ['+', '-']);
  const cat = bin(add, ['&']);
  const expr = bin(cat, ['=', '<>', '<', '>', '<=', '>=']);
  const ast = expr();
  if (p !== t.length) throw new Error(`trailing tokens after formula at ${p}: ${t[p].v}`);
  return ast;
}

// ── Values: scalar (number | string | boolean | Date) or { arr: 2-D array } ────────────────────────
const A = (rows) => ({ arr: rows });
const isArr = (v) => v && typeof v === 'object' && Array.isArray(v.arr);
const toArr = (v) => (isArr(v) ? v.arr : [[v]]);
const scalar = (v) => (isArr(v) ? v.arr[0][0] : v);
const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';
const num = (v) => {
  if (v instanceof FormulaError) throw v;
  if (v === '' || v === null || v === undefined || v === false) return 0;
  if (v === true) return 1;
  if (isDate(v)) return v.getTime() / 86400000 + 25569;
  if (typeof v === 'number') return v;
  const n = Number(String(v).trim());
  if (String(v).trim() === '' || Number.isNaN(n)) err('#VALUE!', `not a number: ${JSON.stringify(v)}`);
  return n;
};
const str = (v) => (v === true ? 'TRUE' : v === false ? 'FALSE' : v === null || v === undefined ? '' : String(v));
const truthy = (v) => (typeof v === 'string' ? (v === '' ? false : /^true$/i.test(v) ? true : err('#VALUE!', 'text as condition')) : num(v) !== 0);

function cmp(a, b) {   // Sheets order: numbers < text < booleans; "" equals 0 only against numbers
  const blank = (x) => x === '' || x === null || x === undefined;
  if (blank(a) && blank(b)) return 0;
  if (blank(a)) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (blank(b)) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  if (isDate(a)) a = num(a);
  if (isDate(b)) b = num(b);
  const rank = (x) => (typeof x === 'number' ? 0 : typeof x === 'string' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string') { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  return a < b ? -1 : a > b ? 1 : 0;
}

function broadcast(a, b, f) {
  if (!isArr(a) && !isArr(b)) return f(a, b);
  const x = toArr(a), y = toArr(b);
  const rows = Math.max(x.length, y.length), cols = Math.max(x[0].length, y[0].length);
  const pick = (m, r, c) => m[m.length === 1 ? 0 : r]?.[m[0].length === 1 ? 0 : c];
  if ((x.length !== 1 && x.length !== rows) || (y.length !== 1 && y.length !== rows)) err('#VALUE!', 'array sizes differ');
  return A(Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
    try { return f(pick(x, r, c), pick(y, r, c)); } catch (e) { if (e instanceof FormulaError) return e; throw e; }
  })));
}
const lift = (f) => (v, ...rest) => (isArr(v) ? A(v.arr.map((row) => row.map((x) => f(x, ...rest)))) : f(v, ...rest));

const BIN = {
  '+': (a, b) => num(a) + num(b), '-': (a, b) => num(a) - num(b), '*': (a, b) => num(a) * num(b),
  '/': (a, b) => (num(b) === 0 ? err('#DIV/0!') : num(a) / num(b)), '&': (a, b) => str(a) + str(b),
  '=': (a, b) => cmp(a, b) === 0, '<>': (a, b) => cmp(a, b) !== 0, '<': (a, b) => cmp(a, b) < 0,
  '>': (a, b) => cmp(a, b) > 0, '<=': (a, b) => cmp(a, b) <= 0, '>=': (a, b) => cmp(a, b) >= 0,
};

/** COUNTIFS / SUMIFS criterion: "active", "<>", "", "<>x", ">3"… (case-insensitive like Sheets). */
function criterion(c) {
  c = str(scalar(c));
  const m = /^(<>|<=|>=|=|<|>)?(.*)$/s.exec(c);
  const op = m[1] || '=', rhs = m[2];
  const blank = (v) => v === '' || v === null || v === undefined;
  if (rhs === '') return op === '<>' ? (v) => !blank(v) : (v) => blank(v);
  const asNum = rhs.trim() !== '' && !Number.isNaN(Number(rhs)) ? Number(rhs) : null;
  return (v) => {
    if (asNum !== null && typeof v === 'number') return BIN[op](v, asNum);
    if (asNum !== null && op !== '=' && op !== '<>') return false;
    return BIN[op](blank(v) ? '' : typeof v === 'number' ? String(v) : v, rhs);
  };
}
function ifsMask(args) {
  let mask = null;
  for (let i = 0; i < args.length; i += 2) {
    const range = toArr(args[i]).flat(), test = criterion(args[i + 1]);
    const m = range.map((v) => test(v));
    if (mask && mask.length !== m.length) err('#VALUE!', 'criteria ranges differ in size');
    mask = mask ? mask.map((x, j) => x && m[j]) : m;
  }
  return mask;
}

const FUNCS = {
  HSTACK: (...xs) => {
    const ms = xs.map(toArr), rows = Math.max(...ms.map((m) => m.length));
    return A(Array.from({ length: rows }, (_, r) => ms.flatMap((m) => (m[r] ? m[r] : Array(m[0].length).fill(new FormulaError('#N/A'))))));
  },
  VSTACK: (...xs) => {
    const ms = xs.map(toArr), cols = Math.max(...ms.map((m) => m[0].length));
    return A(ms.flatMap((m) => m.map((row) => [...row, ...Array(cols - row.length).fill(new FormulaError('#N/A'))])));
  },
  FILTER: (range, ...conds) => {
    const m = toArr(range);
    const keep = m.map((_, r) => conds.every((c) => { const cm = toArr(c); return truthy(cm[cm.length === 1 ? 0 : r][0]); }));
    const out = m.filter((_, r) => keep[r]);
    return out.length ? A(out) : err('#N/A', 'No matches are found in FILTER evaluation.');
  },
  SEQUENCE: (n) => A(Array.from({ length: num(n) }, (_, i) => [i + 1])),
  ROWS: (v) => toArr(v).length,
  INDEX: (v, r, c = 1) => {
    const m = toArr(v), row = m[num(r) - 1];
    if (!row || num(c) < 1 || num(c) > row.length) err('#REF!', 'INDEX out of range');
    const x = row[num(c) - 1];
    if (x instanceof FormulaError) throw x;
    return x;
  },
  TOCOL: (v, ignore = 0) => {
    const flat = toArr(v).flat().filter((x) => !(num(ignore) & 1 && (x === '' || x === null || x === undefined)));
    return flat.length ? A(flat.map((x) => [x])) : err('#N/A');
  },
  SPLIT: (text, delim, each = true, removeEmpty = true) => {
    const s = str(scalar(text)), d = str(scalar(delim));
    let parts = truthy(scalar(each)) ? s.split(new RegExp('[' + d.replace(/[\]\\^-]/g, '\\$&') + ']')) : s.split(d);
    if (truthy(scalar(removeEmpty))) parts = parts.filter((x) => x !== '');
    return parts.length ? A([parts]) : err('#VALUE!', 'SPLIT of empty text');
  },
  CHAR: (n) => String.fromCharCode(num(n)),
  FIND: (needle, hay, start = 1) => {
    const i = str(hay).indexOf(str(needle), num(start) - 1);
    return i < 0 ? err('#VALUE!', 'FIND: not found') : i + 1;
  },
  TRIM: lift((s) => str(s).replace(/^ +| +$/g, '').replace(/ {2,}/g, ' ')),   // ASCII spaces only, like Sheets
  // eslint-disable-next-line no-control-regex
  CLEAN: lift((s) => str(s).replace(/[\x00-\x1f]/g, '')),
  LOWER: lift((s) => str(s).toLowerCase()),
  LEFT: (s, n = 1) => str(s).slice(0, Math.max(0, num(n))),
  MID: (s, start, n) => str(s).substr(num(start) - 1, num(n)),
  LEN: (s) => str(s).length,
  COUNTIFS: (...args) => ifsMask(args).filter(Boolean).length,
  COUNTIF: (range, c) => ifsMask([range, c]).filter(Boolean).length,
  SUMIFS: (sum, ...args) => {
    const vals = toArr(sum).flat(), mask = ifsMask(args);
    if (vals.length !== mask.length) err('#VALUE!', 'SUMIFS ranges differ in size');
    return vals.reduce((acc, v, i) => acc + (mask[i] && typeof v === 'number' ? v : 0), 0);
  },
  SUM: (...xs) => xs.flatMap((x) => toArr(x).flat()).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0),
  SUMPRODUCT: (...xs) => {
    const ms = xs.map((x) => toArr(x).flat());
    return ms[0].reduce((acc, _, i) => acc + ms.reduce((p, m) => p * num(m[i]), 1), 0);
  },
  // Empty cells reach functions as null (see ctx.ref); a "" produced by a formula is a value and counts, as in Sheets.
  COUNTA: (...xs) => xs.flatMap((x) => toArr(x).flat()).filter((v) => v !== null && v !== undefined).length,
  COUNT: (...xs) => xs.flatMap((x) => toArr(x).flat()).filter((v) => typeof v === 'number' || isDate(v)).length,
  MAX: (...xs) => { const v = xs.flatMap((x) => toArr(x).flat()).filter((x) => typeof x === 'number' || isDate(x)).map(num); return v.length ? Math.max(...v) : 0; },
  AND: (...xs) => xs.flatMap((x) => toArr(x).flat()).every((v) => truthy(v)),
  ROUND: (x, d = 0) => { const f = 10 ** num(d); return Math.round(num(x) * f) / f; },
};

// ── Evaluator ────────────────────────────────────────────────────────────────────────────────────
function colNum(L) { return L.replace(/\$/g, '').split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); }

function evalAst(node, env, ctx) {
  switch (node.type) {
    case 'lit': return node.v;
    case 'neg': return lift((x) => -num(x))(evalAst(node.e, env, ctx));
    case 'bin': return broadcast(evalAst(node.left, env, ctx), evalAst(node.right, env, ctx), BIN[node.op]);
    case 'name': {
      if (!(node.v in env)) throw new Error(`unknown name "${node.v}" in formula`);
      return env[node.v];
    }
    case 'ref': return ctx.ref(node.v);
    case 'call': {
      const a = node.args;
      switch (node.name) {
        case 'LET': {
          if (a.length % 2 !== 1) throw new Error('LET needs name/value pairs and a final expression');
          const e = Object.create(env);
          for (let i = 0; i < a.length - 1; i += 2) {
            if (a[i].type !== 'name') throw new Error('LET name expected');
            e[a[i].v] = evalAst(a[i + 1], e, ctx);
          }
          return evalAst(a[a.length - 1], e, ctx);
        }
        case 'LAMBDA': {
          const params = a.slice(0, -1).map((x) => { if (x.type !== 'name') throw new Error('LAMBDA parameter expected'); return x.v; });
          const body = a[a.length - 1];
          return {
            lambda: (...vals) => {
              if (vals.length !== params.length) throw new Error(`LAMBDA expects ${params.length} arguments, got ${vals.length}`);
              const e = Object.create(env); params.forEach((pn, i) => { e[pn] = vals[i]; });
              return evalAst(body, e, ctx);
            },
          };
        }
        case 'IF': {
          const c = evalAst(a[0], env, ctx);
          if (isArr(c)) throw new Error('array IF not supported by this evaluator');
          return truthy(c) ? evalAst(a[1], env, ctx) : a.length > 2 ? evalAst(a[2], env, ctx) : false;
        }
        case 'IFERROR': {
          try { const v = evalAst(a[0], env, ctx); if (v instanceof FormulaError) throw v; return v; } catch (e) {
            if (!(e instanceof FormulaError)) throw e;
            return a.length > 1 ? evalAst(a[1], env, ctx) : '';
          }
        }
        case 'REDUCE': {
          let acc = evalAst(a[0], env, ctx);
          const items = toArr(evalAst(a[1], env, ctx)).flat(), fn = evalAst(a[2], env, ctx).lambda;
          for (const it of items) acc = fn(acc, it);
          return acc;
        }
        case 'MAP': {
          const arrs = a.slice(0, -1).map((x) => toArr(evalAst(x, env, ctx))), fn = evalAst(a[a.length - 1], env, ctx).lambda;
          return A(arrs[0].map((row, r) => row.map((_, c) => {
            const v = fn(...arrs.map((m) => m[r][c]));
            if (isArr(v)) err('#VALUE!', 'MAP lambda must return a single value');
            return v;
          })));
        }
        case 'MAKEARRAY': {
          const rows = num(evalAst(a[0], env, ctx)), cols = num(evalAst(a[1], env, ctx)), fn = evalAst(a[2], env, ctx).lambda;
          return A(Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
            const v = fn(r + 1, c + 1);
            if (isArr(v)) err('#VALUE!', 'MAKEARRAY lambda must return a single value');
            return v;
          })));
        }
        default: {
          const f = FUNCS[node.name];
          if (!f) throw new Error(`function ${node.name} is not supported by the test evaluator`);
          return f(...a.map((x) => evalAst(x, env, ctx)));
        }
      }
    }
    default: throw new Error('bad node ' + node.type);
  }
}

/**
 * Computes every formula of `sheetName` (and, on demand, of the sheets it references) in the harness's
 * MockSpreadsheet `ss`. Returns a 2-D array of values; array results spill from their cell like in Sheets.
 */
export function evaluateSheet(ss, sheetName, cache = new Map()) {
  if (cache.has(sheetName)) {
    const c = cache.get(sheetName);
    if (c === 'busy') throw new Error(`circular sheet reference via ${sheetName}`);
    return c;
  }
  const sheet = ss.find(sheetName);
  if (!sheet) throw new Error(`no sheet ${sheetName}`);
  cache.set(sheetName, 'busy');
  const out = [];
  const set = (r, c, v) => { (out[r] = out[r] || [])[c] = v; };
  const cells = [];
  sheet.grid.forEach((row, r) => row && row.forEach((cell, c) => { if (cell) { set(r, c, cell.formula ? undefined : cell.value === '' ? null : cell.value); if (cell.formula) cells.push([r, c, cell.formula]); } }));
  const state = new Map();   // "r,c" → 'busy' | done
  const grid = () => out;
  // eslint-disable-next-line prefer-const
  let ctx;
  const computeCell = (r, c, f) => {
    const key = `${r},${c}`;
    if (state.get(key) === 'done') return;
    if (state.get(key) === 'busy') throw new Error(`circular reference at ${sheetName}!${key}`);
    state.set(key, 'busy');
    let v;
    try { v = evalAst(parse(f), {}, ctx); } catch (e) { if (e instanceof FormulaError) v = e; else throw new Error(`${sheetName} R${r + 1}C${c + 1}: ${e.message}\n${f}`); }
    if (isArr(v)) v.arr.forEach((row, i) => row.forEach((x, j) => set(r + i, c + j, x)));
    else set(r, c, v);
    state.set(key, 'done');
  };
  const ensure = (r, c) => { const hit = cells.find(([rr, cc]) => rr === r && cc === c); if (hit) computeCell(...hit); };
  ctx = {
    ref(text) {
      let target = sheetName, a1 = text;
      if (text.includes('!')) [target, a1] = text.split('!');
      const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d*))?$/.exec(a1);
      if (!m) throw new Error('bad reference ' + text);
      const r1 = Number(m[2]) - 1, c1 = colNum(m[1]) - 1;
      const c2 = m[3] ? colNum(m[3]) - 1 : c1;
      const rEnd = m[3] ? (m[4] ? Number(m[4]) - 1 : Infinity) : r1;
      if (target === sheetName) cells.forEach(([r, c]) => { if (r >= r1 && r <= rEnd && c >= c1 && c <= c2) ensure(r, c); });
      const g = target === sheetName ? grid() : evaluateSheet(ss, target, cache);
      if (!m[3]) { const v = g[r1]?.[c1]; return v === undefined || v === null ? '' : v; }
      const r2 = m[4] ? Number(m[4]) - 1 : Math.max(r1, g.length - 1);   // open-ended "B2:B" → last used row
      // In ranges an empty cell is null (blank), distinct from a formula's "" (a value: COUNTA counts it).
      return A(Array.from({ length: r2 - r1 + 1 }, (_, i) => Array.from({ length: c2 - c1 + 1 }, (_, j) => {
        const v = g[r1 + i]?.[c1 + j]; return v === undefined ? null : v;
      })));
    },
  };
  cells.forEach((x) => computeCell(...x));
  cache.set(sheetName, out);
  return out;
}

/** Helpers for tests: the computed value at (row, col), 1-based; and the label → row number index of column A. */
export const at = (grid, r, c) => { const v = grid[r - 1]?.[c - 1]; return v === undefined || v === null ? '' : v; };
export function rowOf(grid, label) {
  const i = grid.findIndex((row) => row && String(row[0] ?? '').trim() === label);
  if (i < 0) throw new Error(`no row labelled "${label}"`);
  return i + 1;
}
