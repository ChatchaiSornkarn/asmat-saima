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

  var widths = { timestamp: 150, type: 70, email: 220, phone: 130, side: 70, party_size: 80, men: 60, women: 64, infants: 64, names: 240,
    message: 260,
    language: 80, status: 100, replaces: 80, late: 60, note: 320 };
  Object.keys(widths).forEach(function (h) { sheet.setColumnWidth(c(h), widths[h]); });
  ['names', 'message', 'note'].forEach(function (h) { sheet.getRange(2, c(h), dataRows, 1).setWrap(true); });
  sheet.getRange(2, c('timestamp'), dataRows, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  ['party_size', 'men', 'women', 'infants'].forEach(function (h) {
    sheet.getRange(2, c(h), dataRows, 1).setHorizontalAlignment('center').setNumberFormat('0');
  });
  sheet.getRange(2, c('late'), dataRows, 1).setHorizontalAlignment('center');
  sheet.getRange(2, c('side'), dataRows, 1).setHorizontalAlignment('center');

  var notes = {
    timestamp: 'When the RSVP arrived (Göteborg time).',
    type: 'attend = "We\'re coming" form · cancel = "Cancel / can\'t come" form',
    email: 'Main guest\'s email (lower-case). Used with phone to match RSVPs.',
    phone: 'Main guest\'s phone, normalised (+46…).',
    side: 'asmat = Asmat\'s family · saima = Saima\'s family. Comes from the link the guest opened (…/?side=asmat or ' +
      '…/?side=saima); on a link without it the guest picks "Asmat\'s guest" / "Saima\'s guest" on the form. Every attend ' +
      'row has one (empty only on rows from before that choice existed). Wrong side (someone got the other family\'s link)? ' +
      'Just change this cell. A cancel row keeps the value of the row it replaced.',
    party_size: 'People on this row (= men + women + infants). Only "active" rows count.',
    men: 'Men on this row (names tagged "— man"). Boys aged 4 and up count here too.',
    women: 'Women on this row (names tagged "— woman"). Girls aged 4 and up count here too.',
    infants: 'Children aged 0–3 on the wedding day (names tagged "— infant"). Free at the venue; still in party_size.',
    names: 'One person per line, Main guest first, tagged with the category in English: "Sara Khan — woman". ' +
      'If you edit a name by hand, keep the " — man|woman|infant" tag and fix men / women / infants to match.',
    status: 'active = counts · superseded = replaced by a later row · cancelled = whole Party cancelled',
    replaces: 'Row number(s) this row replaced.',
    late: 'TRUE = this "We\'re coming" reply arrived after the reply-by date (RSVP_DEADLINE, end of day Göteborg time). ' +
      'Confirm with the guest whether you can still fit them in. A cancel row keeps the value of the row it replaced.',
    note: 'What changed (e.g. who was cancelled), matching warnings, email problems.',
  };
  Object.keys(notes).forEach(function (h) { sheet.getRange(1, c(h)).setNote(notes[h]); });

  var list = function (values) {
    return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  };
  sheet.getRange(2, c('status'), dataRows, 1).setDataValidation(list(['active', 'superseded', 'cancelled']));
  sheet.getRange(2, c('type'), dataRows, 1).setDataValidation(list(['attend', 'cancel']));
  sheet.getRange(2, c('language'), dataRows, 1).setDataValidation(list(LANGS));
  sheet.getRange(2, c('side'), dataRows, 1).setDataValidation(list(SIDES));   // empty cells stay allowed

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
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + colLetter_(c('late')) + '2=TRUE')
      .setBackground(THEME_.cancelledBg).setFontColor(THEME_.cancelledInk).setBold(true)
      .setRanges([sheet.getRange(2, c('late'), dataRows, 1)]).build(),
  ];
  sheet.setConditionalFormatRules(rules);

  protectWarningOnly_(sheet, 'Written by the RSVP script. Edit only if you know why (see README).');
  return sheet;
}

/** Columns of the Guests tab (one row per person). The Summary's tag check counts column 2 (Category). */
var GUESTS_HEADERS = ['Name', 'Category', 'Side', 'Party email', 'Party phone', 'RSVP time'];
/** Placeholder Names on the Guests tab for a names cell with no text / a blank line (empty Category → check flags it). */
var GUESTS_EMPTY_NAMES = '(empty names)';
var GUESTS_BLANK_LINE = '(blank line)';

/**
 * Guests: ONE formula in A1 that lists every person of every active row (header included), 2_main_idea issue 19.
 * Each `names` line "Sara Khan — woman" is split on NAME_TAG_SEP into Name + Category; a line without the tag
 * keeps the whole line as the Name and an empty Category (the Summary check then flags it).
 * A names cell holding only line breaks (SPLIT → #VALUE!, which would break the whole REDUCE) becomes one
 * GUESTS_EMPTY_NAMES row, and a line that is blank after TRIM(CLEAN()) becomes a GUESTS_BLANK_LINE row: both
 * visible, both with an empty Category, so the Summary check flags a mismatch instead of the tab breaking.
 * Uses LET / REDUCE / LAMBDA / MAP / VSTACK / HSTACK / MAKEARRAY / TOCOL — all available in Google Sheets.
 * English function names and "," separators: setFormula() always takes them, whatever the spreadsheet locale.
 */
function guestsFormula_(col) {
  var r = function (name) { var L = colLetter_(col[name] + 1); return SHEET_RSVPS + '!' + L + '2:' + L; };
  var header = 'HSTACK(' + GUESTS_HEADERS.map(function (h) { return '"' + h + '"'; }).join(', ') + ')';
  return '=LET(' +
    'status_col, ' + r('status') + ', ' +
    'names_col, ' + r('names') + ', ' +
    'sep, "' + NAME_TAG_SEP + '", ' +
    'header, ' + header + ', ' +
    'IF(COUNTIFS(status_col, "active", names_col, "<>") = 0, header, ' +
      'LET(parties, FILTER(HSTACK(names_col, ' + r('side') + ', ' + r('email') + ', ' + r('phone') + ', ' + r('timestamp') + '), ' +
          'status_col = "active", names_col <> ""), ' +
        'REDUCE(header, SEQUENCE(ROWS(parties)), LAMBDA(acc, idx, ' +
          'LET(lines, MAP(TOCOL(IFERROR(SPLIT(INDEX(parties, idx, 1), CHAR(10)), "' + GUESTS_EMPTY_NAMES + '"), 1), ' +
            'LAMBDA(x, LET(t, TRIM(CLEAN(x)), IF(t = "", "' + GUESTS_BLANK_LINE + '", t)))), ' +
            'pos, MAP(lines, LAMBDA(x, IFERROR(FIND(sep, x), 0))), ' +
            'VSTACK(acc, HSTACK(' +
              'MAP(lines, pos, LAMBDA(x, p, IF(p > 0, TRIM(LEFT(x, p - 1)), x))), ' +
              'MAP(lines, pos, LAMBDA(x, p, IF(p > 0, LOWER(TRIM(MID(x, p + LEN(sep), LEN(x)))), ""))), ' +
              'MAKEARRAY(ROWS(lines), 4, LAMBDA(rr, cc, LET(v, INDEX(parties, idx, cc + 1), IF(v = "", "", v))))' +
            '))))))))';
}

function setupGuestsSheet_(ss, col) {
  var sheet = ss.getSheetByName(SHEET_GUESTS) || ss.insertSheet(SHEET_GUESTS);
  var n = GUESTS_HEADERS.length;
  sheet.clear();
  sheet.clearNotes();
  sheet.getRange(1, 1).setFormula(guestsFormula_(col));
  sheet.getRange(1, 1).setNote('Generated automatically from the RSVPs tab: one row per person on every "active" row ' +
    '(each line of `names`, split into Name and Category at "' + NAME_TAG_SEP + '"). ' +
    'Do not edit or type in this tab — change RSVPs instead.');
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, n).setFontWeight('bold').setFontColor(THEME_.ink).setBackground(THEME_.cream)
    .setBorder(null, null, true, null, null, null, THEME_.gold, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  [220, 80, 70, 220, 140, 150, 24, 360].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.getRange(2, 6, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(1, n + 2).setValue('⟵ Automatic list of everyone coming (from the RSVPs tab). Don\'t edit this tab.')
    .setFontColor(THEME_.muted).setFontStyle('italic').setWrap(true);
  protectWarningOnly_(sheet, 'This tab is a formula. Change the RSVPs tab instead.');
  return sheet;
}

/**
 * Summary: every cell is a formula over RSVPs (and the Guests tab for the check rows). Columns: A label,
 * B–E numbers (B alone for single figures; the booking table uses B–E), F explanation.
 */
function setupSummarySheet_(ss, col) {
  var sheet = ss.getSheetByName(SHEET_SUMMARY) || ss.insertSheet(SHEET_SUMMARY);
  sheet.clear();
  sheet.clearNotes();
  var W = 6;
  var R = function (name) { var L = colLetter_(col[name] + 1); return SHEET_RSVPS + '!' + L + '2:' + L; };
  var st = R('status'), ps = R('party_size'), ty = R('type'), lg = R('language'), ts = R('timestamp'), sd = R('side');
  var catCols = ['men', 'women', 'infants'];   // = CATEGORY_COLUMNS of CATEGORIES, in table order
  var langNames = { en: 'English', sv: 'Swedish', th: 'Thai', ur: 'Urdu' };
  var gName = SHEET_GUESTS + '!A2:A', gCat = SHEET_GUESTS + '!B2:B';

  var rows = [];
  var add = function (cells) { while (cells.length < W) cells.push(''); rows.push(cells); return rows.length; };   // → row number
  var at = {};

  add(['Asmat & Saima · Walima · RSVP summary']);
  add([]);
  at.guests = add(['Guests coming', '=SUMIFS(' + ps + ', ' + st + ', "active")', '', '', '', 'Sum of party_size over active rows — the public count']);
  at.households = add(['Households (active RSVPs)', '=COUNTIFS(' + st + ', "active")', '', '', '', 'The "families" in the public count']);
  add(['Average party size', '=IF(B' + at.households + ' > 0, ROUND(B' + at.guests + ' / B' + at.households + ', 1), 0)']);
  add([]);

  // Venue booking: Side × category over active rows (issue 19).
  var rowTotal = function (r) { return '=SUM(B' + r + ':D' + r + ')'; };
  at.bookingHead = add(['Venue booking (active rows)', 'Men', 'Women', 'Infants (0–3)', 'Total', '']);
  var sideLabels = { asmat: 'Asmat side', saima: 'Saima side' };
  var sideRows = [];
  SIDES.forEach(function (s) {
    var r = rows.length + 1;
    sideRows.push(r);
    add([sideLabels[s] || s].concat(catCols.map(function (c) {
      return '=SUMIFS(' + R(c) + ', ' + st + ', "active", ' + sd + ', "' + s + '")';
    })).concat([rowTotal(r), '']));
  });
  var noSideRow = rows.length + 1;
  var totalRow = noSideRow + 1;
  var letters = ['B', 'C', 'D'];
  add(['Empty or unrecognised side'].concat(letters.map(function (L) {
    return '=' + L + totalRow + sideRows.map(function (r) { return ' - ' + L + r; }).join('');
  })).concat([rowTotal(noSideRow),
    'Rows whose side is empty or not one of ' + SIDES.join(' / ') + ' (replies from before the side column, or a side cell cleared or mistyped by hand). Set the side cell in RSVPs to move them.']));
  add(['Total'].concat(catCols.map(function (c) { return '=SUMIFS(' + R(c) + ', ' + st + ', "active")'; }))
    .concat([rowTotal(totalRow), 'Men + women + infants over active rows. Infants (0–3) are free at the venue.']));
  at.tagRow = add(['On the Guests tab (by names tag)'].concat(CATEGORIES.map(function (k) {
    return '=COUNTIFS(' + gCat + ', "' + k + '")';
  })).concat(['=MAX(0, COUNTA(' + gName + '))', 'People counted from the " — man|woman|infant" tags; Total = rows on the Guests tab']));
  add([]);

  add(['Fully cancelled parties', '=COUNTIFS(' + st + ', "cancelled")']);
  add(['Attend submissions (all time)', '=COUNTIFS(' + ty + ', "attend")', '', '', '', 'Includes replaced ones']);
  add(['Cancel submissions (all time)', '=COUNTIFS(' + ty + ', "cancel")', '', '', '', 'Partial and full']);
  add(['Superseded rows (history)', '=COUNTIFS(' + st + ', "superseded")']);
  add(['Rows in RSVPs', '=COUNTA(' + ts + ')']);
  add([]);
  at.langHead = add(['Active households by language', 'Households', 'Guests']);
  LANGS.forEach(function (l) {
    add(['   ' + langNames[l], '=COUNTIFS(' + st + ', "active", ' + lg + ', "' + l + '")',
      '=SUMIFS(' + ps + ', ' + st + ', "active", ' + lg + ', "' + l + '")']);
  });
  add([]);
  at.last = add(['Last RSVP received', '=IF(COUNT(' + ts + ') > 0, MAX(' + ts + '), "—")']);

  // Check rows: Σ(men + women + infants) = Σ party_size = Guests tab rows, and the tags agree with the counts.
  var g = 'B' + at.guests, tot = 'E' + totalRow, tg = at.tagRow;
  at.listed = add(['People listed on the Guests tab', '=E' + tg, '', '', '', 'Must equal Guests coming']);
  at.catSum = add(['Men + women + infants (active)', '=' + tot, '', '', '', 'Must equal Guests coming']);
  at.badRows = add(['Active rows where men + women + infants ≠ party_size',
    '=IFERROR(SUMPRODUCT((' + st + ' = "active") * ((' + R('men') + ' + ' + R('women') + ' + ' + R('infants') + ') <> ' + ps + ')), "?")',
    '', '', '', 'Should be 0. Filter RSVPs on status = active to find them.']);
  at.check = add(['Check',
    '=IF(AND(' + tot + ' = ' + g + ', E' + tg + ' = ' + g + ', B' + tg + ' = B' + totalRow + ', C' + tg + ' = C' + totalRow +
      ', D' + tg + ' = D' + totalRow + ', B' + at.badRows + ' = 0), "✓ OK", "⚠ Mismatch")',
    '', '', '',
    '=IF(B' + (rows.length + 1) + ' = "✓ OK", "✓ men + women + infants = Guests coming = Guests tab, and the names tags match the counts", ' +
      '"⚠ A names cell or a count was probably edited by hand: on each active row, names needs one line per person tagged ' +
      '\'' + NAME_TAG_SEP.trim() + ' man|woman|infant\', men / women / infants must match the tags, and party_size = men + women + infants")']);
  add([]);
  var footer = add(['Every number here is a formula over the RSVPs tab and updates by itself. Don\'t edit this tab.']);

  sheet.getRange(1, 1, rows.length, W).setValues(rows);   // strings starting with "=" become formulas
  [260, 90, 90, 110, 90, 460].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.getRange(1, 1, rows.length, W).setFontColor(THEME_.ink).setVerticalAlignment('middle');
  sheet.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor(THEME_.gold);
  sheet.getRange(3, 2, rows.length - 2, 4).setHorizontalAlignment('center');
  sheet.getRange(3, W, rows.length - 2, 1).setFontColor(THEME_.muted).setFontStyle('italic').setWrap(true);
  sheet.getRange(at.guests, 1, 2, 2).setFontWeight('bold').setFontSize(12);
  sheet.getRange(at.guests, 2, 2, 1).setBackground(THEME_.cream);
  // Booking table: header, side rows, total, tag row.
  sheet.getRange(at.bookingHead, 1, 1, 5).setFontWeight('bold').setBackground(THEME_.cream)
    .setBorder(null, null, true, null, null, null, THEME_.gold, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(totalRow, 1, 1, 5).setFontWeight('bold')
    .setBorder(true, null, null, null, null, null, THEME_.gold, SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(at.bookingHead + 1, 5, totalRow - at.bookingHead, 1).setFontWeight('bold');
  sheet.getRange(tg, 1, 1, 5).setFontColor(THEME_.muted);
  sheet.getRange(at.bookingHead + 1, 2, tg - at.bookingHead, 4).setNumberFormat('0');
  sheet.getRange(at.langHead, 1, 1, 3).setFontWeight('bold');
  sheet.getRange(at.last, 2).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(at.check, 1, 1, 2).setFontWeight('bold');
  sheet.getRange(at.check, W).setFontStyle('normal').setFontColor(THEME_.ink);
  var checkCell = sheet.getRange(at.check, 2);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('⚠')
      .setBackground(THEME_.cancelledBg).setFontColor(THEME_.cancelledInk).setRanges([checkCell]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('✓')
      .setBackground(THEME_.activeBg).setFontColor(THEME_.activeInk).setRanges([checkCell]).build(),
  ]);
  sheet.getRange(footer, 1).setFontColor(THEME_.muted).setFontStyle('italic');
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
