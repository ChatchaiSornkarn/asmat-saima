/**
 * RSVP logic: validation, normalisation, matching (design Q8, Q13), attend / cancel / lookup / count.
 * Mirrors src/rsvp/validate.js + phone.js on the site, so the browser and the server agree.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Normalisation & validation (same rules as the site's form)
// ─────────────────────────────────────────────────────────────────────────────

var EMAIL_RE_ = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/;
// Characters that are never in a real address but would let one "address" reach several mailboxes.
var EMAIL_FORBIDDEN_RE_ = /[,;<>"\\()\[\]:\u0000-\u001F\u007F]/;
var PHONE_SEPARATORS_RE_ = /[\s\-.()\u00a0\u2010-\u2015\u2212]/g;
var PHONE_CHARS_RE_ = /^\+?[\d\s\-.()\u00a0\u2010-\u2015\u2212]+$/;
var BIDI_CONTROLS_RE_ = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
var CONTROL_RE_ = /[\u0000-\u001F\u007F-\u009F]/;

/** Trim, collapse whitespace (incl. no-break and zero-width spaces). Returns null for a non-string or control chars. */
function cleanName_(v) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') return null;
  var s = v.normalize('NFC').replace(BIDI_CONTROLS_RE_, '').replace(/[\s\u00a0\u200b]+/g, ' ').trim();
  if (CONTROL_RE_.test(s)) return null;
  return s;
}

/** 'Amina Rahman' → 'Amina' (the RSVPs tab keeps full names only; used to greet in cancel emails). */
function firstWord_(name) {
  return String(name || '').split(' ')[0];
}

/** "First" + "Last" → "First Last" (cleaned). */
function fullName_(first, last) {
  return cleanName_(first + ' ' + last);
}

/** Drops all whitespace and lower-cases. Returns null for a non-string. */
function cleanEmail_(v) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') return null;
  return v.replace(/\s+/g, '').toLowerCase();
}

function isValidEmail_(s) {
  return typeof s === 'string' && s.length > 0 && s.length <= LIMITS.email && EMAIL_RE_.test(s) && !EMAIL_FORBIDDEN_RE_.test(s);
}

/**
 * Phone normalisation (ARCHITECTURE.md, both sides of every comparison):
 * strip spaces, dashes, dots and brackets; leading 00 → +; leading 0 → +46.
 * "+46 (0)70 …" drops the bracketed trunk zero, exactly like the site does.
 *   '070-123 45 67' → '+46701234567'   '0046 70 123 45 67' → '+46701234567'
 */
function normalisePhone_(raw) {
  var p = String(raw === undefined || raw === null ? '' : raw).trim();
  p = p.replace(/^(\+\d{1,3})\s*\(0\)/, '$1');
  p = p.replace(PHONE_SEPARATORS_RE_, '');
  if (p.indexOf('00') === 0) p = '+' + p.slice(2);
  else if (p.charAt(0) === '0') p = '+46' + p.slice(1);
  return p;
}

/** Written starting with 0 (Swedish) or + (international), separators only, 8–15 digits once normalised. */
function isValidPhone_(raw) {
  if (typeof raw !== 'string') return false;
  var s = raw.trim();
  if (!s || s.length > LIMITS.phone) return false;
  if (!/^[+0]/.test(s)) return false;
  if (!PHONE_CHARS_RE_.test(s)) return false;
  return /^\+[1-9]\d{7,14}$/.test(normalisePhone_(s));
}

/** Message: CRLF → LF, trim, drop control characters except newline and tab. Returns null for a non-string. */
function cleanMessage_(v) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') return null;
  return v.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '').trim();
}

/** 'sv', 'SV', 'sv-SE' → 'sv'. Anything outside en/sv/th/ur → null. */
function cleanLang_(v) {
  if (typeof v !== 'string') return null;
  var code = v.trim().toLowerCase().split(/[-_]/)[0];
  return LANGS.indexOf(code) >= 0 ? code : null;
}

/**
 * Validates an attend body. Returns { error } or { value: { lang, email, phone, names, message } }.
 * party_too_large wins over other problems (same as the site's mock).
 */
function validateAttend_(body, maxParty) {
  var main = body.main;
  var members = body.members === undefined || body.members === null ? [] : body.members;
  if (!Array.isArray(members)) return { error: 'invalid' };
  if (1 + members.length > maxParty) return { error: 'party_too_large' };
  if (!main || typeof main !== 'object' || Array.isArray(main)) return { error: 'invalid' };

  var lang = cleanLang_(body.lang);
  var email = cleanEmail_(main.email);
  var phoneRaw = typeof main.phone === 'string' ? main.phone : null;
  var message = cleanMessage_(body.message);
  if (!lang || !isValidEmail_(email) || !isValidPhone_(phoneRaw) || message === null || message.length > LIMITS.message) {
    return { error: 'invalid' };
  }

  var people = [main].concat(members);
  var names = [];
  for (var i = 0; i < people.length; i++) {
    var p = people[i];
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: 'invalid' };
    var first = cleanName_(p.first);
    var last = cleanName_(p.last);
    if (!first || !last || first.length > LIMITS.name || last.length > LIMITS.name) return { error: 'invalid' };
    names.push(fullName_(first, last));
  }
  return {
    value: { lang: lang, email: email, phone: normalisePhone_(phoneRaw), first: cleanName_(main.first), names: names, message: message },
  };
}

/** Validates a cancel body. Returns { error } or { value: { lang, email, phone, all, cancel, message } }. */
function validateCancel_(body) {
  var lang = cleanLang_(body.lang);
  var email = cleanEmail_(body.email);
  var phoneRaw = typeof body.phone === 'string' ? body.phone : null;
  var message = cleanMessage_(body.message);
  if (!lang || !isValidEmail_(email) || !isValidPhone_(phoneRaw) || message === null || message.length > LIMITS.message) {
    return { error: 'invalid' };
  }
  var all = body.all === true;
  var cancel = [];
  if (!all) {
    if (!Array.isArray(body.cancel) || body.cancel.length === 0 || body.cancel.length > 100) return { error: 'invalid' };
    for (var i = 0; i < body.cancel.length; i++) {
      var n = cleanName_(body.cancel[i]);
      if (!n || n.length > 2 * LIMITS.name + 1) return { error: 'invalid' };
      cancel.push(n);
    }
  }
  return { value: { lang: lang, email: email, phone: normalisePhone_(phoneRaw), all: all, cancel: cancel, message: message } };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sheet access
// ─────────────────────────────────────────────────────────────────────────────

function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet: this script must be created from the Sheet (Extensions → Apps Script).');
  return ss;
}

/**
 * The RSVPs tab, created (and its header row completed) if needed — so an RSVP is never lost
 * even if setup() was not run. Columns are located by header name, so the owner may reorder
 * columns or add extra ones.
 */
function getRsvpSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_RSVPS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RSVPS, 0);
  }
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var isEmpty = header.every(function (h) { return h === ''; });
  if (isEmpty) {
    sheet.getRange(1, 1, 1, RSVP_HEADERS.length).setValues([RSVP_HEADERS]);
    return sheet;
  }
  var missing = RSVP_HEADERS.filter(function (h) { return header.indexOf(h) < 0; });
  if (missing.length) {
    var need = lastCol + missing.length - sheet.getMaxColumns();
    if (need > 0) sheet.insertColumnsAfter(sheet.getMaxColumns(), need);
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

/**
 * Reads the RSVPs tab into memory.
 * @returns {{ sheet, width, col: Object<string,number>, rows: Array<Object>, lastRow: number }}
 *   col: header → 0-based index. rows: one object per data row with rowNum (1-based sheet row).
 */
function readRsvps_(sheet) {
  var lastRow = sheet.getLastRow();
  var width = Math.max(sheet.getLastColumn(), RSVP_HEADERS.length);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var col = {};
  RSVP_HEADERS.forEach(function (h) {
    col[h] = header.indexOf(h);
    if (col[h] < 0) throw new Error('RSVPs tab is missing the "' + h + '" column — run setup().');
  });
  var data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var v = data[i];
    rows.push({
      rowNum: i + 2,
      timestamp: v[col.timestamp],
      type: String(v[col.type]).trim().toLowerCase(),
      email: cleanEmail_(String(v[col.email])) || '',
      phone: storedPhone_(v[col.phone]),
      partySize: Number(v[col.party_size]) || 0,
      names: splitNames_(v[col.names]),
      message: String(v[col.message] === undefined || v[col.message] === null ? '' : v[col.message]),
      status: String(v[col.status]).trim().toLowerCase(),
      note: String(v[col.note] === undefined || v[col.note] === null ? '' : v[col.note]),
    });
  }
  return { sheet: sheet, width: width, col: col, rows: rows, lastRow: lastRow };
}

/** A phone as stored in the sheet; a hand-typed +46… may have turned into a number. */
function storedPhone_(v) {
  if (typeof v === 'number') return '+' + String(v);
  return normalisePhone_(v);
}

function splitNames_(v) {
  return String(v === undefined || v === null ? '' : v).split(/\r?\n/).map(function (n) { return cleanName_(n) || ''; })
    .filter(function (n) { return n !== ''; });
}

/**
 * Formula-injection guard + "keep it text": a value starting with = + - @ (or a quote, tab, CR)
 * gets a leading apostrophe, which Sheets hides and which makes the cell plain text.
 * Phone numbers (+46…) therefore stay text instead of becoming numbers.
 */
function cellText_(v) {
  var s = String(v === undefined || v === null ? '' : v);
  return /^[=+\-@'\t\r]/.test(s) ? "'" + s : s;
}

/** Appends one RSVP row (laid out by header position) and returns its sheet row number. */
function appendRsvp_(table, rec) {
  var row = [];
  for (var i = 0; i < table.width; i++) row.push('');
  row[table.col.timestamp] = rec.timestamp;
  row[table.col.type] = rec.type;
  row[table.col.email] = cellText_(rec.email);
  row[table.col.phone] = cellText_(rec.phone);
  row[table.col.party_size] = rec.partySize;
  row[table.col.names] = cellText_(rec.names.join('\n'));
  row[table.col.message] = cellText_(rec.message);
  row[table.col.language] = rec.language;
  row[table.col.status] = rec.status;
  row[table.col.replaces] = rec.replaces ? "'" + rec.replaces : '';   // always text ("2,5" must not become a number)
  row[table.col.note] = cellText_(rec.note);
  var rowNum = table.lastRow + 1;
  var maxRows = table.sheet.getMaxRows();
  if (rowNum > maxRows) table.sheet.insertRowsAfter(maxRows, 200);   // getRange can't reach past the grid
  table.sheet.getRange(rowNum, 1, 1, table.width).setValues([row]);
  table.lastRow = rowNum;
  table.rows.push({
    rowNum: rowNum, timestamp: rec.timestamp, type: rec.type, email: rec.email, phone: rec.phone,
    partySize: rec.partySize, names: rec.names.slice(), message: rec.message, status: rec.status, note: rec.note,
  });
  return rowNum;
}

function setStatus_(table, row, status) {
  table.sheet.getRange(row.rowNum, table.col.status + 1).setValue(status);
  row.status = status;
}

/** Aggregates exactly like the Summary tab: guests = Σ party_size of active rows; households = active rows. */
function totalsOf_(rows) {
  var guests = 0, households = 0;
  rows.forEach(function (r) {
    if (r.status === 'active') { guests += r.partySize; households += 1; }
  });
  return { guests: guests, households: households };
}

/** The newest active row whose email AND phone both match (lookup / cancel, Q13). */
function findActiveBoth_(rows, email, phone) {
  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    if (r.status === 'active' && r.email === email && r.phone === phone) return r;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Handlers
// ─────────────────────────────────────────────────────────────────────────────

/** Attend (new or replacing). Latest wins: every active row matching email OR phone becomes superseded (Q8). */
function handleAttend_(body) {
  var cfg = getConfig_();
  var v = validateAttend_(body, cfg.maxParty);
  if (v.error) return { ok: false, error: v.error };
  var a = v.value;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) { logError_('attend', 'lock timeout'); return { ok: false, error: 'server' }; }
  var ev;
  try {
    var table = readRsvps_(getRsvpSheet_());
    var replaced = [];
    var notes = [];
    table.rows.forEach(function (r) {
      if (r.status !== 'active') return;
      var byEmail = r.email === a.email, byPhone = r.phone === a.phone;
      if (!byEmail && !byPhone) return;
      replaced.push(r);
      if (byEmail && !byPhone) notes.push('row ' + r.rowNum + ' matched on email only (its phone: ' + r.phone + ')');
      if (byPhone && !byEmail) notes.push('row ' + r.rowNum + ' matched on phone only (its email: ' + r.email + ')');
    });
    replaced.forEach(function (r) { setStatus_(table, r, 'superseded'); });
    if (!replaced.length) {
      for (var i = table.rows.length - 1; i >= 0; i--) {
        var c = table.rows[i];
        if (c.status === 'cancelled' && (c.email === a.email || c.phone === a.phone)) { notes.push('previously cancelled (row ' + c.rowNum + ')'); break; }
      }
    }
    var replacesRef = replaced.map(function (r) { return r.rowNum; }).join(',');
    var note = notes.join('; ');
    var rowNum = appendRsvp_(table, {
      timestamp: new Date(), type: 'attend', email: a.email, phone: a.phone, partySize: a.names.length,
      names: a.names, message: a.message, language: a.lang, status: 'active', replaces: replacesRef, note: note,
    });
    SpreadsheetApp.flush();
    ev = {
      kind: 'attend', lang: a.lang, email: a.email, phone: a.phone, greetName: a.first, names: a.names,
      message: a.message, rowNum: rowNum, replaces: replacesRef, note: note,
      previous: replaced.map(function (r) { return { rowNum: r.rowNum, names: r.names }; }),
      totals: totalsOf_(table.rows), sheetUrl: sheetUrl_(),
    };
  } finally {
    lock.releaseLock();
  }
  invalidateCount_();
  notify_(ev);
  return { ok: true, partySize: ev.names.length, names: ev.names.slice(), replaced: ev.replaces !== '' };
}

/** Cancel (partial or full). Needs the active Party matching BOTH email and phone (Q13). */
function handleCancel_(body) {
  var v = validateCancel_(body);
  if (v.error) return { ok: false, error: v.error };
  var c = v.value;
  if (!rateLimitOk_(c.email, c.phone)) return { ok: false, error: 'server' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) { logError_('cancel', 'lock timeout'); return { ok: false, error: 'server' }; }
  var ev, result;
  try {
    var table = readRsvps_(getRsvpSheet_());
    var row = findActiveBoth_(table.rows, c.email, c.phone);
    if (!row) return { ok: false, error: 'not_found' };

    var remaining = row.names.slice();
    var cancelled = [];
    if (c.all) {
      cancelled = remaining; remaining = [];
    } else {
      // Multiset removal: two members called "Sara Khan" are cancelled one at a time.
      for (var i = 0; i < c.cancel.length; i++) {
        var at = remaining.indexOf(c.cancel[i]);
        if (at < 0) return { ok: false, error: 'invalid' };   // the Party changed since the lookup
        cancelled.push(remaining.splice(at, 1)[0]);
      }
    }
    var status = remaining.length ? 'active' : 'cancelled';
    var noteParts = [(status === 'cancelled' ? 'Cancelled everyone: ' : 'Cancelled: ') + cancelled.join(', ')];
    var message = c.message;
    if (!message && status === 'active' && row.message) {
      message = row.message;   // keep e.g. allergy notes with the remaining guests
      noteParts.push('message carried over from row ' + row.rowNum);
    }
    setStatus_(table, row, 'superseded');
    var rowNum = appendRsvp_(table, {
      timestamp: new Date(), type: 'cancel', email: row.email, phone: row.phone, partySize: remaining.length,
      names: remaining, message: message, language: c.lang, status: status, replaces: String(row.rowNum),
      note: noteParts.join('; '),
    });
    SpreadsheetApp.flush();
    ev = {
      kind: 'cancel', lang: c.lang, email: row.email, phone: row.phone, greetName: firstWord_(row.names[0]),
      names: remaining, cancelled: cancelled, remaining: remaining, status: status, message: c.message,
      rowNum: rowNum, replaces: String(row.rowNum), note: noteParts.join('; '),
      previous: [{ rowNum: row.rowNum, names: row.names }],
      totals: totalsOf_(table.rows), sheetUrl: sheetUrl_(),
    };
    result = { ok: true, cancelled: cancelled.slice(), remaining: remaining.slice(), status: status };
  } finally {
    lock.releaseLock();
  }
  invalidateCount_();
  notify_(ev);
  return result;
}

/** Lookup: names of the active Party matching BOTH email and phone — nothing else, ever. */
function handleLookup_(emailRaw, phoneRaw) {
  var email = cleanEmail_(typeof emailRaw === 'string' ? emailRaw : '');
  var phone = typeof phoneRaw === 'string' ? phoneRaw : '';
  if (!isValidEmail_(email) || !isValidPhone_(phone)) return { ok: false, error: 'not_found' };
  var norm = normalisePhone_(phone);
  if (!rateLimitOk_(email, norm)) return { ok: false, error: 'server' };
  var table = readRsvps_(getRsvpSheet_());
  var row = findActiveBoth_(table.rows, email, norm);
  if (!row || !row.names.length) return { ok: false, error: 'not_found' };
  return { ok: true, names: row.names.slice() };
}

/** Public count: aggregates only. */
function handleCount_() {
  var cache = scriptCache_();
  if (cache) {
    var hit = cache.get('count:v1');
    if (hit) {
      try { var t = JSON.parse(hit); return { ok: true, guests: t.guests, households: t.households }; } catch (ignore) { /* recompute */ }
    }
  }
  var totals = totalsOf_(readRsvps_(getRsvpSheet_()).rows);
  if (cache) { try { cache.put('count:v1', JSON.stringify(totals), COUNT_CACHE_SEC); } catch (ignore) { /* cache full */ } }
  return { ok: true, guests: totals.guests, households: totals.households };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Small helpers: cache, rate limit, sheet link
// ─────────────────────────────────────────────────────────────────────────────

function scriptCache_() {
  try { return CacheService.getScriptCache(); } catch (err) { return null; }
}

function invalidateCount_() {
  var cache = scriptCache_();
  if (cache) { try { cache.remove('count:v1'); } catch (ignore) { /* ignore */ } }
}

/** SHA-256 → web-safe base64, so cache keys stay short and never contain the raw email/phone. */
function hashKey_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/**
 * Fixed-window counter in the script cache. Returns false once `limit` hits are reached in the
 * current window. Fails open (allows) if the cache is unavailable — real guests come first.
 */
function hit_(bucket, key, limit) {
  var cache = scriptCache_();
  if (!cache) return true;
  try {
    var win = Math.floor(Date.now() / (RATE.windowSec * 1000));
    var k = 'rl:' + bucket + ':' + hashKey_(key) + ':' + win;
    var n = parseInt(cache.get(k) || '0', 10) + 1;
    cache.put(k, String(n), RATE.windowSec + 60);
    return n <= limit;
  } catch (err) {
    logError_('rate', err);
    return true;
  }
}

/** Lookups and cancels: limited per email and per phone (stops guessing someone's phone for a known email). */
function rateLimitOk_(email, phone) {
  var okEmail = hit_('e', email, RATE.lookupsPerKey);
  var okPhone = hit_('p', phone, RATE.lookupsPerKey);
  if (!(okEmail && okPhone)) logInfo_('rate limit reached for a lookup/cancel');
  return okEmail && okPhone;
}

function sheetUrl_() {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEET_RSVPS);
    return ss.getUrl() + (sheet ? '#gid=' + sheet.getSheetId() : '');
  } catch (err) {
    return '';
  }
}
