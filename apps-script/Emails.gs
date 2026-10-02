/**
 * Emails (design Q14): a confirmation to the Main guest in their language, and a summary to the owner.
 * Stationery look: cream paper, gold hairlines, an arched frame, script names — built from tables,
 * inline styles and Unicode ornaments only (no images, no SVG), so Gmail, Apple Mail and Outlook all
 * show it. Web fonts load where the mail app allows it (Apple Mail, iOS); elsewhere the font stacks fall
 * back to Georgia / the system script font.
 *
 * Email never blocks an RSVP: the row is written first; any email problem is logged and noted on the row.
 */

var MAIL_ = {
  page: '#ebe1cb', card: '#f3ead9', panel: '#f9f3e7', gold: '#a8843c', goldSoft: '#cdb37f', hair: '#dcc9a0',
  ink: '#4a3b22', muted: '#7b6a4b', button: '#a8843c', buttonInk: '#fffaf0',
  serif: "'Cormorant Garamond', 'EB Garamond', Garamond, Georgia, 'Times New Roman', serif",
  caps: "'Cinzel', 'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  script: "'Great Vibes', 'Pinyon Script', 'Snell Roundhand', 'Apple Chancery', 'Segoe Script', 'Lucida Handwriting', cursive",
  thai: "'Noto Serif Thai', 'Sarabun', 'Leelawadee UI', 'Thonburi', Tahoma, sans-serif",
  urdu: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Urdu Typesetting', 'Noto Naskh Arabic', 'Segoe UI', Tahoma, serif",
};

// ─────────────────────────────────────────────────────────────────────────────
//  Sending
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends the guest confirmation, then the owner summary. Never throws.
 * Problems (quota used up, throttled, MailApp error) are logged and appended to the row's note.
 */
function notify_(ev) {
  if (!ev) return;
  var problems = [];
  try {
    var cfg = getConfig_();
    if (cfg.sendGuestEmails) {
      if (!hit_('m', ev.email, RATE.guestMailsPerAddress)) {
        problems.push('guest email skipped (too many to this address in 10 min)');
      } else {
        var g = renderGuestEmail_(ev, cfg);
        var r1 = sendMail_({ to: ev.email, subject: g.subject, body: g.text, htmlBody: g.html, name: cfg.senderName,
          replyTo: cfg.ownerEmail || undefined });
        if (r1) problems.push('guest email not sent: ' + r1);
      }
    }
    if (cfg.sendOwnerEmails && cfg.ownerEmail) {
      var o = renderOwnerEmail_(ev, cfg);
      var r2 = sendMail_({ to: cfg.ownerEmail, subject: o.subject, body: o.text, htmlBody: o.html, name: cfg.senderName + ' · RSVP',
        replyTo: ev.email });
      if (r2) problems.push('owner email not sent: ' + r2);
    }
  } catch (err) {
    logError_('notify', err);
    problems.push('email error: ' + (err && err.message ? err.message : err));
  }
  if (problems.length) {
    logInfo_('Row ' + ev.rowNum + ': ' + problems.join('; '));
    appendNote_(ev.rowNum, '⚠ ' + problems.join('; '));
  }
}

/** Sends one email if the daily quota allows. Returns '' on success, or the reason it wasn't sent. */
function sendMail_(msg) {
  var left;
  try { left = MailApp.getRemainingDailyQuota(); } catch (err) { left = 1; }
  if (left < 1) return 'daily email quota used up';
  if (!msg.replyTo) delete msg.replyTo;
  try {
    MailApp.sendEmail(msg);
    return '';
  } catch (err) {
    logError_('sendMail', err);
    return String(err && err.message ? err.message : err).slice(0, 200);
  }
}

function appendNote_(rowNum, text) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { logInfo_('appendNote_: busy, note not written for row ' + rowNum); return; }
  try {
    var sheet = getRsvpSheet_();
    var table = readRsvps_(sheet);
    var cell = sheet.getRange(rowNum, table.col.note + 1);
    var before = String(cell.getValue() || '');
    cell.setValue(cellText_(before ? before + '; ' + text : text));
    SpreadsheetApp.flush();
  } catch (err) {
    logError_('appendNote', err);
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Building blocks
// ─────────────────────────────────────────────────────────────────────────────

function esc_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escMultiline_(s) {
  return esc_(s).replace(/\n/g, '<br>');
}

/** Type settings per language: Thai and Urdu never get letter-spacing or capitals (it breaks the script). */
function typeFor_(lang) {
  if (lang === 'th') return { body: MAIL_.thai, caps: MAIL_.thai, lh: '1.75', capsCss: '', capsSize: 14, bodySize: 16, dateCss: 'font-size:18px;' };
  if (lang === 'ur') return { body: MAIL_.urdu, caps: MAIL_.urdu, lh: '2.2', capsCss: '', capsSize: 14, bodySize: 16, dateCss: 'font-size:18px;' };
  return { body: MAIL_.serif, caps: MAIL_.caps, lh: '1.6', capsCss: 'letter-spacing:0.22em;text-transform:uppercase;', capsSize: 12, bodySize: 18,
    dateCss: 'font-family:' + MAIL_.caps + ';font-size:14px;letter-spacing:0.18em;text-transform:uppercase;' };
}

function fontLink_(lang) {
  var fam = 'family=Cinzel:wght@400;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Great+Vibes';
  if (lang === 'th') fam += '&family=Noto+Serif+Thai:wght@400;600';
  if (lang === 'ur') fam += '&family=Noto+Nastaliq+Urdu:wght@400;600';
  return '<link href="https://fonts.googleapis.com/css2?' + fam.replace(/&/g, '&amp;') + '&amp;display=swap" rel="stylesheet">';
}

function caps_(text, t, color, extra) {
  return '<div style="font-family:' + t.caps + ';font-size:' + t.capsSize + 'px;line-height:1.6;color:' + (color || MAIL_.gold) + ';' +
    t.capsCss + (extra || '') + '">' + esc_(text) + '</div>';
}

function rosette_(size) {
  return '<div style="font-family:\'Segoe UI Symbol\',\'Apple Symbols\',\'DejaVu Sans\',serif;font-size:' + (size || 22) +
    'px;line-height:1;color:' + MAIL_.gold + ';">&#10049;</div>';
}

function spacer_(px) {
  return '<div style="height:' + px + 'px;line-height:' + px + 'px;font-size:1px;">&nbsp;</div>';
}

/** Gold hairline — ornament — hairline. */
function divider_(ornament, widthPct) {
  var line = '<td valign="middle" style="width:50%;"><div style="height:1px;line-height:1px;font-size:1px;background:' + MAIL_.goldSoft + ';">&nbsp;</div></td>';
  return '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="width:' + (widthPct || 72) + '%;margin:0 auto;"><tr>' +
    line + '<td valign="middle" style="padding:0 12px;white-space:nowrap;font-family:\'Segoe UI Symbol\',\'Apple Symbols\',\'DejaVu Sans\',serif;font-size:13px;line-height:1;color:' +
    MAIL_.gold + ';">' + (ornament || '&#10022;') + '</td>' + line + '</tr></table>';
}

function namesLine_(size) {
  return '<div dir="ltr" class="names" style="font-family:' + MAIL_.script + ';font-size:' + size + 'px;line-height:1.15;color:' + MAIL_.gold + ';font-weight:normal;">Asmat &amp; Saima</div>';
}

/** Small italic line under a panel heading, e.g. "3 guests". */
function countLine_(text, t, lang) {
  return '<div style="font-family:' + t.body + ';font-size:15px;line-height:1.5;color:' + MAIL_.muted + ';' +
    (lang === 'en' || lang === 'sv' ? 'font-style:italic;' : '') + '">' + esc_(text) + '</div>';
}

/** A soft panel listing names, one per line. */
function nameList_(names, t, opts) {
  opts = opts || {};
  var color = opts.muted ? MAIL_.muted : MAIL_.ink;
  // Muted (not struck through): these are people we'll miss, not errors. Italic only where the script has it.
  var deco = opts.muted && opts.italic ? 'font-style:italic;' : '';
  return names.map(function (n) {
    return '<div dir="auto" style="font-family:' + t.body + ';font-size:' + (t.bodySize + 3) + 'px;line-height:' + (t.lh === '2.2' ? '2' : '1.45') +
      ';color:' + color + ';' + deco + '">' + esc_(n) + '</div>';
  }).join('');
}

function panel_(inner) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>' +
    '<td class="panel" style="background:' + MAIL_.panel + ';border:1px solid ' + MAIL_.hair + ';border-radius:10px;padding:20px 22px;text-align:center;">' +
    inner + '</td></tr></table>';
}

function button_(href, label, t) {
  return '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>' +
    '<td style="border-radius:999px;background:' + MAIL_.button + ';">' +
    '<a href="' + esc_(href) + '" target="_blank" style="display:inline-block;padding:13px 30px;border-radius:999px;font-family:' + t.caps +
    ';font-size:' + (t.capsSize + 1) + 'px;line-height:1.3;color:' + MAIL_.buttonInk + ';text-decoration:none;' + t.capsCss + '">' + esc_(label) + '</a>' +
    '</td></tr></table>';
}

/**
 * Keeps "Asmat & Saima" in one piece inside right-to-left text: without isolation the bidi algorithm
 * can split it ("Asmat &" … "Saima") or flip the ampersand. Takes and returns escaped HTML.
 */
function isolateNames_(html) {
  return String(html).replace(/Asmat &amp; Saima/g,
    '<span dir="ltr" style="unicode-bidi:isolate;white-space:nowrap;">Asmat &amp; Saima</span>');
}

/** Plain-text equivalent: Unicode LEFT-TO-RIGHT ISOLATE … POP DIRECTIONAL ISOLATE around the names (RTL only). */
function isolateNamesText_(text, dir) {
  return dir === 'rtl' ? String(text).replace(/Asmat & Saima/g, '\u2066Asmat & Saima\u2069') : String(text);
}

function para_(text, t, extra) {
  return '<p style="margin:0;font-family:' + t.body + ';font-size:' + t.bodySize + 'px;line-height:' + t.lh + ';color:' + MAIL_.ink + ';' + (extra || '') + '">' +
    isolateNames_(text) + '</p>';
}

function mapsUrl_(cfg) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cfg.mapQuery);
}

function siteUrlFor_(cfg, lang) {
  var u = cfg.siteUrl || '';
  return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'lang=' + encodeURIComponent(lang);
}

/** The full HTML document: page background, card, arched gold frame around `inner`, footer under the card. */
function shell_(o) {
  var css =
    'body{margin:0!important;padding:0!important;-webkit-text-size-adjust:100%;}' +
    'a{color:' + MAIL_.gold + ';}' +
    '@media only screen and (max-width:520px){' +
      '.outer{padding:14px 8px!important;}' +
      '.frame{padding:7px!important;}' +
      '.arch{padding:46px 18px 30px!important;}' +
      '.names{font-size:40px!important;}' +
      '.names-sm{font-size:32px!important;}' +
      '.panel{padding:16px 14px!important;}' +
    '}';
  return '<!DOCTYPE html>' +
    '<html lang="' + o.lang + '" dir="' + o.dir + '">' +
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">' +
    '<title>' + esc_(o.title) + '</title>' + fontLink_(o.lang) + '<style>' + css + '</style></head>' +
    '<body dir="' + o.dir + '" style="margin:0;padding:0;background:' + MAIL_.page + ';">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:' + MAIL_.page + ';">' +
      esc_(o.preheader) + '&#8199;&#847;'.repeat(40) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + MAIL_.page + ';">' +
    '<tr><td align="center" class="outer" style="padding:28px 12px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;">' +
      '<tr><td class="frame" style="background:' + MAIL_.card + ';border:1px solid ' + MAIL_.hair + ';border-radius:8px;padding:11px;">' +
        '<div class="arch" dir="' + o.dir + '" style="border:1px solid ' + MAIL_.gold + ';border-radius:300px 300px 6px 6px;padding:60px 34px 36px;text-align:center;">' +
          o.inner +
        '</div>' +
      '</td></tr>' +
      '<tr><td dir="' + o.dir + '" style="padding:18px 26px 6px;text-align:center;font-family:' + o.footerFont + ';font-size:12px;line-height:1.7;color:' + MAIL_.muted + ';">' +
        o.footer +
      '</td></tr>' +
      '</table>' +
    '</td></tr></table></body></html>';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Guest confirmation (en / sv / th / ur)
// ─────────────────────────────────────────────────────────────────────────────

/** Which of the three guest emails this event needs. */
function guestVariant_(ev) {
  if (ev.kind === 'attend') return 'attend';
  return ev.status === 'cancelled' ? 'cancelled' : 'partial';
}

/**
 * @param ev  { kind:'attend'|'cancel', lang, email, greetName, names, cancelled?, remaining?, status?, message, replaces }
 * @returns {{ subject, html, text }}
 */
function renderGuestEmail_(ev, cfg) {
  var S = EMAIL_STRINGS[ev.lang] || EMAIL_STRINGS.en;
  var lang = EMAIL_STRINGS[ev.lang] ? ev.lang : 'en';
  var t = typeFor_(lang);
  var variant = guestVariant_(ev);
  var replaced = ev.kind === 'attend' && !!ev.replaces;
  var subject = variant === 'attend' ? (replaced ? S.subject.attendUpdated : S.subject.attend) : S.subject[variant];
  var dateText = formatEventDate_(cfg.eventDate, lang);
  var timeText = cfg.eventTime ? fill_(S.time, { time: cfg.eventTime }) : '';
  var site = siteUrlFor_(cfg, lang);
  var maps = mapsUrl_(cfg);
  var greetName = ev.greetName || (ev.names && ev.names[0]) || '';
  var greeting = greetName ? fill_(S.greeting, { name: greetName }) : '';
  var greetingHtml = greetName ? esc_(S.greeting).replace('{name}', '<span dir="auto">' + esc_(greetName) + '</span>') : '';

  // ── HTML ──
  var h = '';
  h += rosette_(24) + spacer_(14);
  h += caps_(S.kicker[variant], t) + spacer_(12);
  h += '<div style="font-family:' + (lang === 'en' || lang === 'sv' ? MAIL_.serif + ';font-style:italic' : t.body) + ';font-size:17px;line-height:1.4;color:' + MAIL_.muted + ';">' + esc_(S.nikahOf) + '</div>';
  h += namesLine_(48) + spacer_(16) + divider_() + spacer_(24);
  if (greetingHtml) h += para_(greetingHtml, t, 'font-size:' + (t.bodySize + 2) + 'px;') + spacer_(10);
  h += para_(esc_(S.intro[variant]), t) + spacer_(22);

  if (variant === 'attend') {
    h += panel_(caps_(S.partyHeading, t) + countLine_(S.guests(ev.names.length), t, lang) + spacer_(10) + nameList_(ev.names, t));
    if (replaced) h += spacer_(12) + para_(esc_(S.replaced), t, 'font-size:15px;font-style:italic;color:' + MAIL_.muted + ';');
  } else if (variant === 'partial') {
    h += panel_(
      caps_(S.remainingHeading, t) + countLine_(S.guests(ev.remaining.length), t, lang) + spacer_(10) + nameList_(ev.remaining, t) +
      spacer_(18) + divider_('&#183;', 40) + spacer_(16) +
      caps_(S.cancelledHeading, t, MAIL_.muted) + spacer_(8) + nameList_(ev.cancelled, t, { muted: true, italic: lang === 'en' || lang === 'sv' }));
  } else {
    h += panel_(caps_(S.cancelledHeading, t, MAIL_.muted) + spacer_(8) + nameList_(ev.cancelled, t, { muted: true, italic: lang === 'en' || lang === 'sv' }));
  }

  if (ev.message) {
    h += spacer_(16) + panel_(caps_(S.messageHeading, t) + spacer_(8) +
      '<div dir="auto" style="font-family:' + t.body + ';font-size:' + (t.bodySize - 1) + 'px;line-height:' + t.lh + ';color:' + MAIL_.ink + ';' +
      (lang === 'en' || lang === 'sv' ? 'font-style:italic;' : '') + '">' + escMultiline_(ev.message) + '</div>');
  }

  if (variant !== 'cancelled') {
    h += spacer_(28) + divider_() + spacer_(22);
    h += caps_(S.whenWhere, t) + spacer_(10);
    h += '<div style="font-family:' + t.body + ';color:' + MAIL_.ink + ';line-height:1.6;' + t.dateCss + '">' + esc_(dateText) + '</div>';
    if (timeText) h += '<div style="font-family:' + t.body + ';font-size:16px;line-height:1.6;color:' + MAIL_.ink + ';">' + esc_(timeText) + '</div>';
    h += spacer_(8);
    h += '<div dir="ltr" style="font-family:' + MAIL_.serif + ';font-size:19px;line-height:1.45;color:' + MAIL_.ink + ';">' +
      '<a href="' + esc_(maps) + '" target="_blank" style="color:' + MAIL_.ink + ';text-decoration:none;">' + esc_(cfg.venueLine1) + '<br>' + esc_(cfg.venueLine2) + '</a></div>';
    h += spacer_(6) + '<div style="font-family:' + t.body + ';font-size:14px;line-height:1.6;"><a href="' + esc_(maps) + '" target="_blank" style="color:' + MAIL_.gold +
      ';text-decoration:underline;">' + esc_(S.maps) + '</a></div>';
  }

  h += spacer_(28) + button_(site, S.button, t) + spacer_(24);
  var hints = variant === 'cancelled' ? [S.comeBackHint] : [S.addHint, S.cancelHint];
  h += '<div style="max-width:420px;margin:0 auto;">' + hints.map(function (x) {
    return para_(esc_(x), t, 'font-size:14px;color:' + MAIL_.muted + ';' + (lang === 'en' || lang === 'sv' ? 'font-style:italic;' : ''));
  }).join(spacer_(8)) + '</div>';

  h += spacer_(28) + divider_('&#10049;', 46) + spacer_(18);
  h += '<div style="font-family:' + (lang === 'en' || lang === 'sv' ? MAIL_.serif + ';font-style:italic' : t.body) + ';font-size:17px;line-height:1.5;color:' + MAIL_.muted + ';">' + esc_(S.signoff) + '</div>';
  h += '<div dir="ltr" class="names-sm" style="font-family:' + MAIL_.script + ';font-size:36px;line-height:1.2;color:' + MAIL_.gold + ';">Asmat &amp; Saima</div>';
  h += spacer_(10) + caps_(S.dua, t, MAIL_.muted, 'font-size:' + (t.capsSize - (lang === 'en' || lang === 'sv' ? 1 : 0)) + 'px;');

  var footer = isolateNames_(esc_(S.footer)) + '<br><a href="' + esc_(site) + '" target="_blank" style="color:' + MAIL_.muted + ';">' + esc_(String(cfg.siteUrl).replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</a>';

  var html = shell_({ lang: lang, dir: S.dir, title: subject, preheader: S.intro[variant], inner: h, footer: footer, footerFont: t.body });

  // ── Plain text ──
  var L = [];
  L.push('Asmat & Saima — ' + S.nikahOf);
  L.push(S.kicker[variant]);
  L.push('');
  if (greeting) L.push(greeting);
  L.push(S.intro[variant]);
  L.push('');
  if (variant === 'attend') {
    L.push(S.partyHeading + ' (' + S.guests(ev.names.length) + '):');
    ev.names.forEach(function (n) { L.push('  • ' + n); });
    if (replaced) { L.push(''); L.push(S.replaced); }
  } else {
    if (variant === 'partial') {
      L.push(S.remainingHeading + ' (' + S.guests(ev.remaining.length) + '):');
      ev.remaining.forEach(function (n) { L.push('  • ' + n); });
      L.push('');
    }
    L.push(S.cancelledHeading + ':');
    ev.cancelled.forEach(function (n) { L.push('  • ' + n); });
  }
  if (ev.message) { L.push(''); L.push(S.messageHeading + ':'); L.push(ev.message); }
  if (variant !== 'cancelled') {
    L.push('');
    L.push(S.whenWhere + ':');
    L.push(dateText + (timeText ? ' · ' + timeText : ''));
    L.push(cfg.venueLine1 + ', ' + cfg.venueLine2);
    L.push(S.maps + ': ' + maps);
  }
  L.push('');
  L.push(S.button + ': ' + site);
  L.push('');
  hints.forEach(function (x) { L.push(x); });
  L.push('');
  L.push(S.signoff);
  L.push('Asmat & Saima');
  L.push(S.dua);
  L.push('');
  L.push('—');
  L.push(S.footer);
  return { subject: subject, html: html, text: isolateNamesText_(L.join('\n'), S.dir) };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Owner notification (English)
// ─────────────────────────────────────────────────────────────────────────────

var LANG_NAMES_ = { en: 'English', sv: 'Swedish', th: 'Thai', ur: 'Urdu' };

function renderOwnerEmail_(ev, cfg) {
  var t = typeFor_('en');
  var variant = guestVariant_(ev);
  var lead = (ev.kind === 'attend' ? ev.names[0] : (ev.previous && ev.previous[0] && ev.previous[0].names[0])) || ev.email;
  var kicker, headline, subject;
  if (variant === 'attend') {
    kicker = ev.replaces ? 'Updated RSVP' : 'New RSVP';
    headline = ev.names.length === 1 ? lead + ' is coming' : lead + ' + ' + (ev.names.length - 1) + ' ' + (ev.names.length === 2 ? 'guest' : 'guests') + ' are coming';
    subject = 'RSVP · ' + (ev.replaces ? 'Updated' : 'Attending') + ' · ' + lead + ' (' + ev.names.length + ')';
  } else if (variant === 'partial') {
    kicker = 'Partial cancellation';
    headline = ev.cancelled.length + ' cancelled · ' + ev.remaining.length + ' still coming';
    subject = 'RSVP · Partial cancel · ' + lead + ' (' + ev.remaining.length + ' still coming)';
  } else {
    kicker = 'Cancellation';
    headline = lead + (ev.cancelled.length > 1 ? '’s party can no longer come' : ' can no longer come');
    subject = 'RSVP · Cancelled · ' + lead + ' (' + ev.cancelled.length + ')';
  }
  var totals = 'Now ' + ev.totals.guests + ' ' + (ev.totals.guests === 1 ? 'guest' : 'guests') + ' from ' + ev.totals.households + ' ' +
    (ev.totals.households === 1 ? 'household' : 'households');

  var rows = [];
  var listHtml = function (names, muted) {
    return names.length ? names.map(function (n) {
      return '<div dir="auto" style="' + (muted ? 'color:' + MAIL_.muted + ';font-style:italic;' : '') + '">' + esc_(n) + '</div>';
    }).join('') : '<span style="color:' + MAIL_.muted + ';">—</span>';
  };
  if (variant === 'attend') rows.push(['Party (' + ev.names.length + ')', listHtml(ev.names)]);
  if (variant === 'partial') rows.push(['Still coming (' + ev.remaining.length + ')', listHtml(ev.remaining)]);
  if (variant !== 'attend') rows.push(['Cancelled (' + ev.cancelled.length + ')', listHtml(ev.cancelled, true)]);
  rows.push(['Email', '<a href="mailto:' + esc_(ev.email) + '" style="color:' + MAIL_.ink + ';">' + esc_(ev.email) + '</a>']);
  rows.push(['Phone', '<a href="tel:' + esc_(ev.phone) + '" style="color:' + MAIL_.ink + ';" dir="ltr">' + esc_(ev.phone) + '</a>']);
  rows.push(['Language', esc_((LANG_NAMES_[ev.lang] || ev.lang) + ' (' + ev.lang + ')')]);
  rows.push(['Message', ev.message ? '<div dir="auto" style="font-style:italic;">' + escMultiline_(ev.message) + '</div>' : '<span style="color:' + MAIL_.muted + ';">—</span>']);
  var prev = (ev.previous || []).map(function (p) { return 'row ' + p.rowNum + ' (' + p.names.join(', ') + ')'; }).join('; ');
  rows.push(['Sheet', 'Row ' + ev.rowNum + (prev ? '<br><span style="color:' + MAIL_.muted + ';">Replaces ' + esc_(prev) + '</span>' : '')]);
  if (ev.note) rows.push(['Note', esc_(ev.note)]);

  var table = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="text-align:left;">' +
    rows.map(function (r, i) {
      var border = i ? 'border-top:1px solid ' + MAIL_.hair + ';' : '';
      return '<tr><td valign="top" style="' + border + 'padding:10px 12px 10px 0;width:118px;font-family:' + MAIL_.caps + ';font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:' + MAIL_.gold + ';line-height:1.9;">' +
        esc_(r[0]) + '</td><td valign="top" style="' + border + 'padding:10px 0;font-family:' + MAIL_.serif + ';font-size:17px;line-height:1.45;color:' + MAIL_.ink + ';word-break:break-word;">' +
        r[1] + '</td></tr>';
    }).join('') + '</table>';

  var h = '';
  h += rosette_(20) + spacer_(12);
  h += caps_(kicker, t) + spacer_(10);
  h += '<div dir="auto" style="font-family:' + MAIL_.serif + ';font-size:26px;line-height:1.3;color:' + MAIL_.ink + ';">' + esc_(headline) + '</div>';
  h += spacer_(14);
  h += '<div style="display:inline-block;padding:7px 16px;border:1px solid ' + MAIL_.goldSoft + ';border-radius:999px;font-family:' + MAIL_.serif + ';font-size:16px;color:' + MAIL_.ink + ';background:' + MAIL_.panel + ';">' + esc_(totals) + '</div>';
  h += spacer_(22) + divider_() + spacer_(18);
  h += table;
  if (ev.sheetUrl) h += spacer_(24) + button_(ev.sheetUrl, 'Open the RSVP sheet', t);
  h += spacer_(16) + '<div style="font-family:' + MAIL_.serif + ';font-size:14px;line-height:1.5;color:' + MAIL_.muted + ';font-style:italic;">Reply to this email to write to the guest directly.</div>';

  var footer = 'Sent by the RSVP script for <span style="white-space:nowrap;">' + esc_(String(cfg.siteUrl).replace(/^https?:\/\//, '').replace(/\/$/, '')) +
    '</span>. Change who gets these in Script Properties → OWNER_EMAIL.';
  var html = shell_({ lang: 'en', dir: 'ltr', title: subject, preheader: headline + ' — ' + totals, inner: h, footer: footer, footerFont: MAIL_.serif });

  var L = [kicker.toUpperCase(), headline, totals, ''];
  if (variant === 'attend') { L.push('Party (' + ev.names.length + '):'); ev.names.forEach(function (n) { L.push('  • ' + n); }); }
  if (variant === 'partial') { L.push('Still coming (' + ev.remaining.length + '):'); ev.remaining.forEach(function (n) { L.push('  • ' + n); }); }
  if (variant !== 'attend') { L.push('Cancelled (' + ev.cancelled.length + '):'); ev.cancelled.forEach(function (n) { L.push('  • ' + n); }); }
  L.push('');
  L.push('Email: ' + ev.email);
  L.push('Phone: ' + ev.phone);
  L.push('Language: ' + (LANG_NAMES_[ev.lang] || ev.lang) + ' (' + ev.lang + ')');
  L.push('Message: ' + (ev.message || '—'));
  L.push('Sheet row: ' + ev.rowNum + (prev ? ' — replaces ' + prev : ''));
  if (ev.note) L.push('Note: ' + ev.note);
  if (ev.sheetUrl) { L.push(''); L.push('Open the sheet: ' + ev.sheetUrl); }
  return { subject: subject, html: html, text: L.join('\n') };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Samples (proofreading, tests)
// ─────────────────────────────────────────────────────────────────────────────

/** One attend, one partial cancel and one full cancel per language (12 events), with realistic names. */
function sampleEvents_() {
  var people = {
    en: { email: 'amina@example.com', names: ['Amina Rahman', 'Yusuf Rahman', 'Sara Rahman'], msg: 'Yusuf is allergic to nuts. We can’t wait!' },
    sv: { email: 'erik@example.se', names: ['Erik Lindqvist', 'Maja Lindqvist', 'Ella Lindqvist'], msg: 'Maja äter vegetariskt. Vi längtar!' },
    th: { email: 'somchai@example.co.th', names: ['สมชาย ใจดี', 'สุภาพร ใจดี', 'Anna Jaidee'], msg: 'ขอแสดงความยินดีล่วงหน้าด้วยนะคะ' },
    ur: { email: 'ayesha@example.pk', names: ['عائشہ خان', 'عمر خان', 'Zainab Khan'], msg: 'مبارک ہو! ہم ضرور حاضر ہوں گے۔' },
  };
  var out = [];
  LANGS.forEach(function (lang) {
    var p = people[lang];
    var base = { lang: lang, email: p.email, phone: '+46701234567', greetName: p.names[0].split(' ')[0], rowNum: 12,
      totals: { guests: 42, households: 15 }, sheetUrl: 'https://docs.google.com/spreadsheets/d/EXAMPLE/edit#gid=0' };
    out.push(merge_(base, { kind: 'attend', names: p.names, message: p.msg, replaces: '', note: '', previous: [] }));
    out.push(merge_(base, { kind: 'cancel', names: p.names.slice(0, 2), cancelled: [p.names[2]], remaining: p.names.slice(0, 2),
      status: 'active', message: '', replaces: '12', note: 'Cancelled: ' + p.names[2], previous: [{ rowNum: 12, names: p.names }] }));
    out.push(merge_(base, { kind: 'cancel', names: [], cancelled: p.names, remaining: [], status: 'cancelled', message: '',
      replaces: '12', note: 'Cancelled everyone: ' + p.names.join(', '), previous: [{ rowNum: 12, names: p.names }] }));
  });
  return out;
}

function merge_(a, b) {
  var o = {};
  Object.keys(a).forEach(function (k) { o[k] = a[k]; });
  Object.keys(b).forEach(function (k) { o[k] = b[k]; });
  return o;
}
