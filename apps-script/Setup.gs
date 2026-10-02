/**
 * setup() — run once from the Apps Script editor (and again any time to repair formatting).
 * Safe to re-run: it never deletes or changes RSVP rows, and never overwrites Script Properties you changed.
 */

var THEME_ = {
  cream: '#f3ead9', paper: '#fbf7ef', gold: '#a8843c', goldSoft: '#d8c49a', ink: '#4a3b22', muted: '#8a7a5c',
  activeBg: '#eef3e3', activeInk: '#3f5a22', supersededInk: '#a59a86', cancelledBg: '#f7e4de', cancelledInk: '#8a3b2e',
};

function setup() {
  var ss = getSpreadsheet_();
  var log = [];

  // 1. Settings → Script Properties (only fills in what is missing).
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperties() || {};
  var toSet = {};
  Object.keys(CONFIG_DEFAULTS).forEach(function (k) {
    if (existing[k] === undefined || existing[k] === null || String(existing[k]).trim() === '') {
      if (k === 'OWNER_EMAIL') {
        var me = '';
        try { me = Session.getEffectiveUser().getEmail(); } catch (err) { me = ''; }
        if (me) toSet[k] = me;
      } else if (CONFIG_DEFAULTS[k] !== '') {
        toSet[k] = CONFIG_DEFAULTS[k];
      }
    }
  });
  if (Object.keys(toSet).length) props.setProperties(toSet, false);
  log.push('Script Properties: ' + (Object.keys(toSet).length ? 'added ' + Object.keys(toSet).join(', ') : 'already complete'));

  // 2. Tabs.
  var rsvps = setupRsvpsSheet_(ss);
  var table = readRsvps_(rsvps);
  setupGuestsSheet_(ss, table.col);
  setupSummarySheet_(ss, table.col);
  removeEmptyDefaultSheet_(ss);
  orderSheets_(ss);
  SpreadsheetApp.flush();
  invalidateCount_();
  log.push('Tabs ready: ' + SHEET_RSVPS + ' (' + table.rows.length + ' rows), ' + SHEET_GUESTS + ', ' + SHEET_SUMMARY);

  // 3. Touch MailApp so the "send email as you" permission is granted now, not on the first RSVP.
  try { log.push('Emails left today: ' + MailApp.getRemainingDailyQuota()); } catch (err) { log.push('MailApp not authorised yet: ' + err); }

  var cfg = getConfig_();
  log.push('Notifications go to: ' + (cfg.ownerEmail || '(nobody — set OWNER_EMAIL)'));
  log.push('Next: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone). See README.md.');
  Logger.log(log.join('\n'));
  uiAlert_('Wedding RSVP — setup complete', log.join('\n'));
  return log;
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** RSVPs: header, frozen row, widths, wrapping, date format, validation, conditional formatting. */
function setupRsvpsSheet_(ss) {
  var sheet = getRsvpSheet_();
  var table = readRsvps_(sheet);
  var col = table.col;
  var width = table.width;
  var maxRows = Math.max(sheet.getMaxRows(), 1000);
  if (sheet.getMaxRows() < maxRows) sheet.insertRowsAfter(sheet.getMaxRows(), maxRows - sheet.getMaxRows());
  var dataRows = maxRows - 1;
  var c = function (name) { return col[name] + 1; };

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold').setFontColor(THEME_.ink).setBackground(THEME_.cream)
    .setBorder(null, null, true, null, null, null, THEME_.gold, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.getRange(1, 1, maxRows, width).setVerticalAlignment('top');

  var widths = { timestamp: 150, type: 70, email: 220, phone: 130, party_size: 80, names: 220, message: 260,
    language: 80, status: 100, replaces: 80, note: 320 };
  Object.keys(widths).forEach(function (h) { sheet.setColumnWidth(c(h), widths[h]); });
  ['names', 'message', 'note'].forEach(function (h) { sheet.getRange(2, c(h), dataRows, 1).setWrap(true); });
  sheet.getRange(2, c('timestamp'), dataRows, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange(2, c('party_size'), dataRows, 1).setHorizontalAlignment('center');

  var notes = {
    timestamp: 'When the RSVP arrived (Göteborg time).',
    type: 'attend = "We\'re coming" form · cancel = "Cancel / can\'t come" form',
    email: 'Main guest\'s email (lower-case). Used with phone to match RSVPs.',
    phone: 'Main guest\'s phone, normalised (+46…).',
    party_size: 'People on this row. Only "active" rows count.',
    names: 'One person per line, Main guest first.',
    status: 'active = counts · superseded = replaced by a later row · cancelled = whole Party cancelled',
    replaces: 'Row number(s) this row replaced.',
    note: 'What changed (e.g. who was cancelled), matching warnings, email problems.',
  };
  Object.keys(notes).forEach(function (h) { sheet.getRange(1, c(h)).setNote(notes[h]); });

  var list = function (values) {
    return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  };
  sheet.getRange(2, c('status'), dataRows, 1).setDataValidation(list(['active', 'superseded', 'cancelled']));
  sheet.getRange(2, c('type'), dataRows, 1).setDataValidation(list(['attend', 'cancel']));
  sheet.getRange(2, c('language'), dataRows, 1).setDataValidation(list(LANGS));

  // Conditional formatting (replaces any rules this sheet had).
  var all = sheet.getRange(2, 1, dataRows, width);
  var st = '$' + colLetter_(c('status')) + '2';
  var rules = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=' + st + '="superseded"')
      .setFontColor(THEME_.supersededInk).setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=' + st + '="cancelled"')
      .setBackground(THEME_.cancelledBg).setFontColor(THEME_.cancelledInk).setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=' + st + '="active"')
      .setBackground(THEME_.activeBg).setRanges([sheet.getRange(2, c('status'), dataRows, 1)]).build(),
  ];
  sheet.setConditionalFormatRules(rules);

  protectWarningOnly_(sheet, 'Written by the RSVP script. Edit only if you know why (see README).');
  return sheet;
}

/**
 * Guests: ONE formula in A1 that lists every person of every active row (header included).
 * Uses LET / REDUCE / LAMBDA / VSTACK / HSTACK / MAKEARRAY / TOCOL — all available in Google Sheets.
 */
function guestsFormula_(col) {
  var r = function (name) { var L = colLetter_(col[name] + 1); return SHEET_RSVPS + '!' + L + '2:' + L; };
  return '=LET(' +
    'status_col, ' + r('status') + ', ' +
    'names_col, ' + r('names') + ', ' +
    'header, HSTACK("Name", "Party email", "Party phone", "RSVP time"), ' +
    'IF(COUNTIFS(status_col, "active", names_col, "<>") = 0, header, ' +
      'LET(parties, FILTER(HSTACK(names_col, ' + r('email') + ', ' + r('phone') + ', ' + r('timestamp') + '), ' +
          'status_col = "active", names_col <> ""), ' +
        'REDUCE(header, SEQUENCE(ROWS(parties)), LAMBDA(acc, idx, ' +
          'LET(people, TOCOL(SPLIT(INDEX(parties, idx, 1), CHAR(10)), 1), ' +
            'VSTACK(acc, HSTACK(people, MAKEARRAY(ROWS(people), 3, LAMBDA(rr, cc, INDEX(parties, idx, cc + 1)))))))))))';
  // 11 closers: INDEX, LAMBDA(rr,cc), MAKEARRAY, HSTACK, VSTACK, LET(people), LAMBDA(acc,idx), REDUCE, LET(parties), IF, LET.
}

function setupGuestsSheet_(ss, col) {
  var sheet = ss.getSheetByName(SHEET_GUESTS) || ss.insertSheet(SHEET_GUESTS);
  sheet.clear();
  sheet.clearNotes();
  sheet.getRange(1, 1).setFormula(guestsFormula_(col));
  sheet.getRange(1, 1).setNote('Generated automatically from the RSVPs tab: one row per person on every "active" row. ' +
    'Do not edit or type in this tab — change RSVPs instead.');
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setFontColor(THEME_.ink).setBackground(THEME_.cream)
    .setBorder(null, null, true, null, null, null, THEME_.gold, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sheet.setColumnWidth(1, 220); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 140); sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 24); sheet.setColumnWidth(6, 360);
  sheet.getRange(2, 4, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(1, 6).setValue('⟵ Automatic list of everyone coming (from the RSVPs tab). Don\'t edit this tab.')
    .setFontColor(THEME_.muted).setFontStyle('italic').setWrap(true);
  protectWarningOnly_(sheet, 'This tab is a formula. Change the RSVPs tab instead.');
  return sheet;
}

function setupSummarySheet_(ss, col) {
  var sheet = ss.getSheetByName(SHEET_SUMMARY) || ss.insertSheet(SHEET_SUMMARY);
  sheet.clear();
  sheet.clearNotes();
  var R = function (name) { var L = colLetter_(col[name] + 1); return SHEET_RSVPS + '!' + L + '2:' + L; };
  var st = R('status'), ps = R('party_size'), ty = R('type'), lg = R('language'), ts = R('timestamp');
  var langNames = { en: 'English', sv: 'Swedish', th: 'Thai', ur: 'Urdu' };

  var rows = [
    ['Asmat & Saima · Nikah · RSVP summary', '', ''],
    ['', '', ''],
    ['Guests coming', '=SUMIFS(' + ps + ', ' + st + ', "active")', 'Sum of party_size over active rows — the public count'],
    ['Households (active RSVPs)', '=COUNTIFS(' + st + ', "active")', 'The "families" in the public count'],
    ['Average party size', '=IF(B4 > 0, ROUND(B3 / B4, 1), 0)', ''],
    ['', '', ''],
    ['Fully cancelled parties', '=COUNTIFS(' + st + ', "cancelled")', ''],
    ['Attend submissions (all time)', '=COUNTIFS(' + ty + ', "attend")', 'Includes replaced ones'],
    ['Cancel submissions (all time)', '=COUNTIFS(' + ty + ', "cancel")', 'Partial and full'],
    ['Superseded rows (history)', '=COUNTIFS(' + st + ', "superseded")', ''],
    ['Rows in RSVPs', '=COUNTA(' + ts + ')', ''],
    ['', '', ''],
    ['Active households by language', 'Households', 'Guests'],
  ];
  LANGS.forEach(function (l) {
    rows.push(['   ' + langNames[l], '=COUNTIFS(' + st + ', "active", ' + lg + ', "' + l + '")',
      '=SUMIFS(' + ps + ', ' + st + ', "active", ' + lg + ', "' + l + '")']);
  });
  rows.push(['', '', '']);
  rows.push(['Last RSVP received', '=IF(COUNT(' + ts + ') > 0, MAX(' + ts + '), "—")', '']);
  var checkRow = rows.length + 1;
  rows.push(['People listed on the Guests tab', '=MAX(0, COUNTA(' + SHEET_GUESTS + '!A2:A))',
    '=IF(B' + checkRow + ' = B3, "✓ matches Guests coming", "⚠ differs from Guests coming — check names / party_size in RSVPs")']);
  rows.push(['', '', '']);
  rows.push(['Every number here is a formula over the RSVPs tab and updates by itself. Don\'t edit this tab.', '', '']);

  sheet.getRange(1, 1, rows.length, 3).setValues(rows);   // strings starting with "=" become formulas
  sheet.setColumnWidth(1, 260); sheet.setColumnWidth(2, 140); sheet.setColumnWidth(3, 420);
  sheet.getRange(1, 1, rows.length, 3).setFontColor(THEME_.ink).setVerticalAlignment('middle');
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor(THEME_.gold);
  sheet.getRange(3, 1, 2, 2).setFontWeight('bold').setFontSize(12);
  sheet.getRange(3, 2, 2, 1).setBackground(THEME_.cream);
  sheet.getRange(13, 1, 1, 3).setFontWeight('bold');
  sheet.getRange(1, 2, rows.length, 2).setHorizontalAlignment('left');
  sheet.getRange(3, 2, rows.length - 2, 1).setHorizontalAlignment('center');
  sheet.getRange(3, 3, rows.length - 2, 1).setFontColor(THEME_.muted).setFontStyle('italic');
  sheet.getRange(14, 3, LANGS.length, 1).setFontStyle('normal').setFontColor(THEME_.ink).setHorizontalAlignment('center');
  sheet.getRange(13, 2, 1, 2).setHorizontalAlignment('center').setFontStyle('normal').setFontColor(THEME_.ink);
  sheet.getRange(checkRow - 1, 2).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(rows.length, 1).setFontColor(THEME_.muted).setFontStyle('italic');
  protectWarningOnly_(sheet, 'This tab is formulas. Change the RSVPs tab instead.');
  return sheet;
}

function protectWarningOnly_(sheet, description) {
  try {
    var existing = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET) || [];
    if (existing.length === 0) sheet.protect().setDescription(description).setWarningOnly(true);
  } catch (err) {
    logError_('protect', err);
  }
}

/** Deletes the empty "Sheet1" / "Blad1" a new spreadsheet comes with (only if it is completely empty). */
function removeEmptyDefaultSheet_(ss) {
  var ours = [SHEET_RSVPS, SHEET_GUESTS, SHEET_SUMMARY];
  ss.getSheets().forEach(function (s) {
    if (ours.indexOf(s.getName()) >= 0) return;
    if (s.getLastRow() === 0 && s.getLastColumn() === 0 && ss.getSheets().length > 1) {
      try { ss.deleteSheet(s); } catch (err) { /* ignore */ }
    }
  });
}

function orderSheets_(ss) {
  try {
    [SHEET_SUMMARY, SHEET_GUESTS, SHEET_RSVPS].forEach(function (name, i) {
      var s = ss.getSheetByName(name);
      if (!s) return;
      ss.setActiveSheet(s);
      ss.moveActiveSheet(i + 1);
    });
    ss.setActiveSheet(ss.getSheetByName(SHEET_SUMMARY));
  } catch (err) {
    logError_('orderSheets', err);
  }
}
