// Local test harness for the Apps Script backend (apps-script/*.gs).
// Loads the .gs files into a Node `vm` context with faithful-enough mocks of the Apps Script services:
// SpreadsheetApp (grid with value coercion like Sheets: "'" prefix → text, "=" → formula, numeric strings → numbers),
// LockService, MailApp (quota), ContentService, PropertiesService, CacheService, Session, Utilities, Logger, console.
//
//   import { createBackend } from './harness.mjs';
//   const b = createBackend();            // fresh spreadsheet, setup() not run
//   b.setup();
//   const res = b.post({ action: 'attend', ... });   // → parsed JSON
//   b.rows()                               // RSVPs tab as objects
//   b.mails                                // every MailApp.sendEmail call
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPT_DIR = path.resolve(HERE, '../../apps-script');
export const GS_FILES = ['Code.gs', 'Rsvp.gs', 'Setup.gs', 'Emails.gs', 'Strings.gs'];

// ── Chainable no-op (formatting builders, enums, protections…) ─────────────────────────────────────
function makeChain(log, name = 'chain') {
  const fn = function () {};
  const proxy = new Proxy(fn, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => `[${name}]`;
      if (prop === 'then') return undefined;
      return (...args) => { log && log.push([name, String(prop), args]); return proxy; };
    },
    apply() { return proxy; },
  });
  return proxy;
}

/** Wraps an object so any method it doesn't define is a chainable no-op returning the object itself. */
function lenient(target, log, name) {
  const proxy = new Proxy(target, {
    get(t, prop, recv) {
      if (prop in t) return Reflect.get(t, prop, recv);
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      return (...args) => { log.push([name, String(prop), args]); return proxy; };
    },
  });
  return proxy;
}

const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';

// ── Spreadsheet model ─────────────────────────────────────────────────────────────────────────────
class Cell {
  constructor(value = '', formula = null, raw = undefined) { this.value = value; this.formula = formula; this.raw = raw; }
}

class MockSheet {
  constructor(ss, name, id) {
    this.ss = ss; this.name = name; this.id = id;
    this.grid = [];            // grid[r][c] = Cell  (0-based)
    this.maxRows = 1000; this.maxCols = 26;
    this.notes = {}; this.frozen = 0; this.protections = [];
    this.writes = [];          // every raw value written: { r, c, raw }
  }
  // coercion like typing into Sheets
  coerce(raw) {
    if (typeof raw === 'string') {
      if (raw.startsWith("'")) return new Cell(raw.slice(1), null, raw);
      if (raw.startsWith('=')) return new Cell('#FORMULA', raw, raw);
      if (/^[+-]?\d+(\.\d+)?$/.test(raw.trim()) && raw.trim() !== '') return new Cell(Number(raw), null, raw);
      if (raw === 'TRUE' || raw === 'FALSE') return new Cell(raw === 'TRUE', null, raw);
      return new Cell(raw, null, raw);
    }
    if (raw === null || raw === undefined) return new Cell('', null, raw);
    return new Cell(raw, null, raw);
  }
  check(r, c, nr, nc) {
    if (!(r >= 1 && c >= 1 && nr >= 1 && nc >= 1) || !Number.isInteger(r + c + nr + nc)) throw new Error(`Invalid range ${r},${c},${nr},${nc}`);
    if (r + nr - 1 > this.maxRows || c + nc - 1 > this.maxCols) {
      throw new Error('Exception: The coordinates of the range are outside the dimensions of the sheet.');
    }
  }
  cell(r, c) { return (this.grid[r - 1] && this.grid[r - 1][c - 1]) || new Cell(); }
  write(r, c, raw, asFormula = false) {
    this.check(r, c, 1, 1);
    if (!this.grid[r - 1]) this.grid[r - 1] = [];
    this.grid[r - 1][c - 1] = asFormula ? new Cell('#FORMULA', raw, raw) : this.coerce(raw);
    this.writes.push({ r, c, raw });
  }
  getLastRow() {
    for (let r = this.grid.length; r >= 1; r--) {
      const row = this.grid[r - 1];
      if (row && row.some((x) => x && (x.value !== '' || x.formula))) return r;
    }
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.grid.forEach((row) => row && row.forEach((x, i) => { if (x && (x.value !== '' || x.formula)) m = Math.max(m, i + 1); }));
    return m;
  }
}

function makeRange(sheet, r, c, nr, nc, log) {
  sheet.check(r, c, nr, nc);
  const range = {
    getRow: () => r, getColumn: () => c, getNumRows: () => nr, getNumColumns: () => nc,
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
      const v = sheet.cell(r + i, c + j).value; return isDate(v) ? new Date(v.getTime()) : v;
    })),
    getValue: () => sheet.cell(r, c).value,
    getFormula: () => sheet.cell(r, c).formula || '',
    getFormulas: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sheet.cell(r + i, c + j).formula || '')),
    setValues(vals) {
      if (!Array.isArray(vals) || vals.length !== nr || vals.some((row) => !Array.isArray(row) || row.length !== nc)) {
        throw new Error(`Exception: The number of rows/columns in the data does not match the range (${nr}x${nc}).`);
      }
      vals.forEach((row, i) => row.forEach((v, j) => sheet.write(r + i, c + j, v)));
      return proxy;
    },
    setValue(v) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sheet.write(r + i, c + j, v); return proxy; },
    setFormula(f) { sheet.write(r, c, f, true); return proxy; },
    setNote(n) { sheet.notes[`${r},${c}`] = n; return proxy; },
    getNote: () => sheet.notes[`${r},${c}`] || '',
  };
  const proxy = lenient(range, log, `range:${sheet.name}`);
  return proxy;
}

function makeSheetApi(sheet, log) {
  const api = {
    getName: () => sheet.name,
    setName: (n) => { sheet.name = n; return proxy; },
    getSheetId: () => sheet.id,
    getMaxRows: () => sheet.maxRows,
    getMaxColumns: () => sheet.maxCols,
    insertRowsAfter: (after, n) => { sheet.maxRows += n; return proxy; },
    insertColumnsAfter: (after, n) => { sheet.maxCols += n; return proxy; },
    getLastRow: () => sheet.getLastRow(),
    getLastColumn: () => sheet.getLastColumn(),
    getRange: (a, b, c = 1, d = 1) => {
      if (typeof a === 'string') throw new Error('A1 notation not supported by the mock');
      return makeRange(sheet, a, b, c, d, log);
    },
    getDataRange: () => makeRange(sheet, 1, 1, Math.max(sheet.getLastRow(), 1), Math.max(sheet.getLastColumn(), 1), log),
    appendRow: (vals) => { const r = sheet.getLastRow() + 1; if (r > sheet.maxRows) sheet.maxRows = r; vals.forEach((v, j) => sheet.write(r, j + 1, v)); return proxy; },
    deleteRows: (start, n) => { sheet.grid.splice(start - 1, n); return proxy; },
    clear: () => { sheet.grid = []; return proxy; },
    clearNotes: () => { sheet.notes = {}; return proxy; },
    setFrozenRows: (n) => { sheet.frozen = n; return proxy; },
    getProtections: () => sheet.protections.slice(),
    protect: () => { const p = makeChain(log, 'protection'); sheet.protections.push(p); return p; },
  };
  const proxy = lenient(api, log, `sheet:${sheet.name}`);
  return proxy;
}

class MockSpreadsheet {
  constructor(log) {
    this.log = log; this.sheets = []; this.nextId = 0; this.flushes = 0;
    this.addSheet('Sheet1');
  }
  addSheet(name, index) {
    const s = new MockSheet(this, name, this.nextId++);
    if (index === undefined || index > this.sheets.length) this.sheets.push(s); else this.sheets.splice(index, 0, s);
    return s;
  }
  find(name) { return this.sheets.find((s) => s.name === name) || null; }
  api() {
    const self = this;
    const wrap = (s) => (s ? makeSheetApi(s, self.log) : null);
    let active = null;
    return lenient({
      getSheetByName: (n) => wrap(self.find(n)),
      insertSheet: (n, i) => { if (self.find(n)) throw new Error(`A sheet with the name "${n}" already exists.`); return wrap(self.addSheet(n, i)); },
      getSheets: () => self.sheets.map(wrap),
      deleteSheet: (sh) => { const i = self.sheets.findIndex((s) => s.name === sh.getName()); if (self.sheets.length < 2) throw new Error('last sheet'); self.sheets.splice(i, 1); },
      getUrl: () => 'https://docs.google.com/spreadsheets/d/TEST_SHEET_ID/edit',
      getId: () => 'TEST_SHEET_ID',
      setActiveSheet: (sh) => { active = sh.getName(); return sh; },
      moveActiveSheet: (pos) => { const i = self.sheets.findIndex((s) => s.name === active); const [s] = self.sheets.splice(i, 1); self.sheets.splice(pos - 1, 0, s); },
    }, self.log, 'spreadsheet');
  }
}

// ── Backend factory ──────────────────────────────────────────────────────────────────────────────
export function createBackend({ quota = 100, owner = 'owner@example.com', props = {}, files = GS_FILES, verbose = false } = {}) {
  const log = [];
  const logs = [];
  const ss = new MockSpreadsheet(log);
  const ssApi = ss.api();
  const mails = [];
  const state = { quota, mailThrowsNext: false, lockAvailable: true, lockHeld: false, lockAcquired: 0, now: null };
  const properties = new Map(Object.entries(props));
  const cache = new Map();

  const mailApp = {
    sendEmail(...args) {
      const msg = typeof args[0] === 'object' ? { ...args[0] } : { to: args[0], subject: args[1], body: args[2], ...(args[3] || {}) };
      if (state.mailThrowsNext) { state.mailThrowsNext = false; throw new Error('Mail service failed (simulated)'); }
      if (state.quota < 1) throw new Error('Service invoked too many times for one day: email.');
      if (!msg.to || !/@/.test(msg.to)) throw new Error('Invalid email: ' + msg.to);
      state.quota -= 1;
      mails.push(msg);
    },
    getRemainingDailyQuota: () => state.quota,
  };

  const lock = {
    tryLock: () => { if (!state.lockAvailable) return false; state.lockHeld = true; state.lockAcquired++; return true; },
    waitLock: () => { if (!state.lockAvailable) throw new Error('Lock timeout'); state.lockHeld = true; state.lockAcquired++; },
    releaseLock: () => { state.lockHeld = false; },
    hasLock: () => state.lockHeld,
  };

  const nowMs = () => (state.now !== null ? state.now : Date.now());
  const scriptCache = {
    get: (k) => { const e = cache.get(k); if (!e) return null; if (e.exp < nowMs()) { cache.delete(k); return null; } return e.v; },
    put: (k, v, ttl = 600) => { if (String(k).length > 250) throw new Error('key too long'); cache.set(k, { v: String(v), exp: nowMs() + ttl * 1000 }); },
    remove: (k) => { cache.delete(k); },
  };

  const sandboxConsole = {
    log: (...a) => { logs.push(['log', a.join(' ')]); if (verbose) console.log('[gs]', ...a); },
    info: (...a) => { logs.push(['info', a.join(' ')]); },
    warn: (...a) => { logs.push(['warn', a.join(' ')]); },
    error: (...a) => { logs.push(['error', a.join(' ')]); if (verbose) console.error('[gs]', ...a); },
  };

  const context = {
    console: sandboxConsole,
    Logger: { log: (m) => { logs.push(['Logger', String(m)]); } },
    SpreadsheetApp: lenient({
      getActiveSpreadsheet: () => ssApi,
      getActive: () => ssApi,
      flush: () => { ss.flushes++; },
      newDataValidation: () => makeChain(log, 'validation'),
      newConditionalFormatRule: () => makeChain(log, 'cf'),
      getUi: () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); },
      BorderStyle: { SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM' },
      ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
    }, log, 'SpreadsheetApp'),
    LockService: { getScriptLock: () => lock, getDocumentLock: () => lock },
    MailApp: mailApp,
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (s) => {
        const out = { content: String(s), mime: 'text/plain' };
        out.setMimeType = (m) => { out.mime = m; return out; };
        out.getContent = () => out.content;
        out.getMimeType = () => out.mime;
        return out;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (properties.has(k) ? properties.get(k) : null),
        setProperty: (k, v) => { properties.set(k, String(v)); },
        getProperties: () => Object.fromEntries(properties),
        setProperties: (o, deleteAll) => { if (deleteAll) properties.clear(); Object.entries(o).forEach(([k, v]) => properties.set(k, String(v))); },
        deleteProperty: (k) => { properties.delete(k); },
      }),
    },
    CacheService: { getScriptCache: () => scriptCache },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => owner }),
      getActiveUser: () => ({ getEmail: () => owner }),
      getScriptTimeZone: () => 'Europe/Stockholm',
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(String(s), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64'),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      formatDate: (d, tz, fmt) => d.toISOString(),
      sleep: () => {},
    },
  };
  // Date.now override for rate-limit windows
  vm.createContext(context);
  const code = files.map((f) => `// ── ${f}\n` + fs.readFileSync(path.join(SCRIPT_DIR, f), 'utf8')).join('\n;\n');
  vm.runInContext(code, context, { filename: 'apps-script.gs' });
  if (state.now === null) { /* real clock */ }

  const toJson = (out) => {
    if (!out || typeof out.getContent !== 'function') throw new Error('handler did not return a TextOutput');
    if (out.getMimeType() !== 'application/json') throw new Error('response is not JSON mime: ' + out.getMimeType());
    return JSON.parse(out.getContent());
  };

  const backend = {
    context, ss, mails, logs, log, state, properties, cache,
    call: (fn, ...args) => context[fn](...args),
    setup: () => context.setup(),
    /** POST a body (object → JSON string, string → as-is). Returns parsed JSON. */
    post(body) {
      const contents = typeof body === 'string' ? body : JSON.stringify(body);
      const res = toJson(context.doPost({ postData: { contents, type: 'text/plain', length: contents.length }, parameter: {}, parameters: {} }));
      if (state.lockHeld) throw new Error('lock still held after doPost');
      return res;
    },
    postRaw: (e) => toJson(context.doPost(e)),
    get(params = {}) {
      const res = toJson(context.doGet({ parameter: params, parameters: {}, queryString: new URLSearchParams(params).toString() }));
      if (state.lockHeld) throw new Error('lock still held after doGet');
      return res;
    },
    sheet: (name) => ss.find(name),
    /** RSVPs tab rows as objects keyed by header (values as read back from the "sheet"). */
    rows(name = 'RSVPs') {
      const s = ss.find(name);
      if (!s) return [];
      const last = s.getLastRow();
      if (last < 2) return [];
      const width = s.getLastColumn();
      const header = Array.from({ length: width }, (_, j) => String(s.cell(1, j + 1).value));
      const out = [];
      for (let r = 2; r <= last; r++) {
        const o = { _row: r };
        header.forEach((h, j) => { o[h] = s.cell(r, j + 1).value; });
        out.push(o);
      }
      return out;
    },
    header(name = 'RSVPs') {
      const s = ss.find(name);
      return Array.from({ length: s.getLastColumn() }, (_, j) => s.cell(1, j + 1).value);
    },
    /** Raw values written to a sheet (what the script passed to setValue/setValues). */
    rawWrites: (name = 'RSVPs') => (ss.find(name)?.writes || []),
    setQuota: (n) => { state.quota = n; },
    advance: (ms) => { state.now = (state.now ?? Date.now()) + ms; },
  };
  return backend;
}

/** Attend body builder used by tests. */
export function attendBody({ first = 'Asmat', last = 'Khan', email = 'a@x.se', phone = '070 123 45 67', members = [], message = '', lang = 'en', website = '' } = {}) {
  return { action: 'attend', lang, main: { first, last, email, phone }, members: members.map((m) => (typeof m === 'string' ? { first: m.split(' ')[0], last: m.split(' ').slice(1).join(' ') } : m)), message, website };
}
