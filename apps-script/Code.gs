/**
 * Asmat & Saima · Walima · RSVP backend (Google Apps Script web app, bound to the RSVP Google Sheet).
 *
 * Files in this project (all share one global scope — order does not matter):
 *   Code.gs     ← you are here: settings, web-app entry points (doGet / doPost), the Sheet menu
 *   Rsvp.gs     validation, phone/email normalisation, matching, attend / cancel / lookup / count
 *   Setup.gs    setup(): creates and formats the RSVPs, Guests and Summary tabs
 *   Emails.gs   the guest confirmation email (4 languages) and the owner notification email
 *   Strings.gs  the email wording in English, Swedish, Thai and Urdu
 *
 * API contract: ../docs/ARCHITECTURE.md → "Backend API". Setup steps: README.md in this folder.
 *
 * Functions whose name ends in "_" are internal (Apps Script hides them from the Run menu).
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Settings
//  These are DEFAULTS. To change a value, don't edit code: open the Apps Script editor →
//  Project Settings (gear icon) → Script Properties → Edit script properties, and add/change
//  the property with the same name. `setup()` writes these defaults there once so you can see them.
// ─────────────────────────────────────────────────────────────────────────────
var CONFIG_DEFAULTS = {
  OWNER_EMAIL: '',             // who receives the RSVP notifications ('' = the Google account that deployed the script).
                               // Several addresses: separate with commas.
  MAX_PARTY: '20',             // largest Party one RSVP may register, Main guest included (design Q25)
  SITE_URL: 'https://chatchaisornkarn.github.io/asmat-saima/',
  EVENT_DATE: '2026-12-13',    // YYYY-MM-DD — written out in each language in the emails
  RSVP_DEADLINE: '2026-11-06', // YYYY-MM-DD — reply-by date. An attend row that arrives after the END of this day
                               // (Europe/Stockholm) gets late = TRUE and a "LATE" owner-email subject (issue 14).
                               // MUST equal rsvpDeadline in ../config.js (the page's late notice uses that copy);
                               // tests/apps-script/deadline-sync.test.mjs checks this default against config.js.
  EVENT_TIME: '',              // 'HH:MM' (24h, Göteborg time) — shown in emails once known; '' = hidden
  VENUE_LINE1: 'Grand Plaza Bröllop & Konferens', // venue name shown to guests; the address stays in MAP_QUERY
  VENUE_LINE2: 'Göteborg',
  MAP_QUERY: 'Säve Flygplatsväg 26, 423 73 Säve, Sweden',
  SENDER_NAME: 'Asmat & Saima',
  SEND_GUEST_EMAILS: 'true',   // 'false' = don't send guests a confirmation (rows are still written)
  SEND_OWNER_EMAILS: 'true',   // 'false' = don't email you on every RSVP
};

var SHEET_RSVPS = 'RSVPs';
var SHEET_GUESTS = 'Guests';
var SHEET_SUMMARY = 'Summary';

/** The deadline day ends at midnight in this zone (same as config.js → timeZone). */
var DEADLINE_TIME_ZONE = 'Europe/Stockholm';

/**
 * Columns of the RSVPs tab (design Q10). The script finds columns by these header names, and
 * getRsvpSheet_() appends any that an existing sheet lacks (so a new column = add its name here).
 */
var RSVP_HEADERS = ['timestamp', 'type', 'email', 'phone', 'side', 'party_size', 'men', 'women', 'infants', 'names', 'message',
  'language', 'status', 'replaces', 'late', 'note'];

/**
 * Category of each person in a Party (2_main_idea issue 17, design Q2/Q4): exactly one of these.
 * 'infant' = a child aged 0–3 on the wedding day (labelled "Child 0–3" on the site; free at the venue).
 * Each `names` line is tagged in English, whatever the guest's language: "Sara Khan — woman".
 * The script writes the matching men / women / infants counts; party_size = men + women + infants.
 */
var CATEGORIES = ['man', 'woman', 'infant'];
var MAIN_CATEGORIES = ['man', 'woman'];   // the main guest gives the family's email and phone: an adult
var CATEGORY_COLUMNS = { man: 'men', woman: 'women', infant: 'infants' };
var NAME_TAG_SEP = ' — ';   // space, EM DASH, space. Names never contain an em dash (cleanPersonName_ replaces it).
// Added to a cancel row's note when a remaining `names` line has no valid tag, so men + women + infants < party_size.
var UNTAGGED_NOTE = 'untagged names — fix counts';

var LANGS = ['en', 'sv', 'th', 'ur'];

/**
 * The two families (design Q1). Each sends its own link, …/?side=asmat or …/?side=saima, and the site
 * posts that value with the attend reply. The script only ever stores one of these (see cleanSide_).
 */
var SIDES = ['asmat', 'saima'];

/** Same limits as the site's form (src/rsvp/validate.js → LIMITS). */
var LIMITS = { name: 80, email: 254, phone: 32, message: 1000, body: 32 * 1024 };

/** Abuse limits — generous enough that a real guest never meets them. */
var RATE = {
  windowSec: 600,           // 10-minute fixed windows
  lookupsPerKey: 12,        // lookups + cancels per email, and separately per phone number, per window
  guestMailsPerAddress: 6,  // confirmation emails to one address per window (stops using the form to spam someone)
};

var LOCK_WAIT_MS = 25000;   // how long a request waits for another one to finish writing
var COUNT_CACHE_SEC = 60;   // the public guest count is cached for a minute

/** Returns the effective settings: Script Properties over CONFIG_DEFAULTS, parsed. */
function getConfig_() {
  var props = {};
  try { props = PropertiesService.getScriptProperties().getProperties() || {}; } catch (err) { logError_('getConfig_', err); }
  var raw = {};
  Object.keys(CONFIG_DEFAULTS).forEach(function (k) {
    var v = props[k];
    raw[k] = (v === undefined || v === null || String(v).trim() === '') ? CONFIG_DEFAULTS[k] : String(v).trim();
  });
  var owner = raw.OWNER_EMAIL;
  if (!owner) {
    try { owner = Session.getEffectiveUser().getEmail() || ''; } catch (err) { owner = ''; }
  }
  var maxParty = parseInt(raw.MAX_PARTY, 10);
  if (!(maxParty >= 1 && maxParty <= 100)) maxParty = 20;
  var siteUrl = raw.SITE_URL;
  if (siteUrl && !/\/$/.test(siteUrl) && !/[?#]/.test(siteUrl)) siteUrl += '/';
  return {
    ownerEmail: owner,
    maxParty: maxParty,
    siteUrl: siteUrl,
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.EVENT_DATE) ? raw.EVENT_DATE : CONFIG_DEFAULTS.EVENT_DATE,
    rsvpDeadline: /^\d{4}-\d{2}-\d{2}$/.test(raw.RSVP_DEADLINE) ? raw.RSVP_DEADLINE : CONFIG_DEFAULTS.RSVP_DEADLINE,
    eventTime: /^\d{1,2}:\d{2}$/.test(raw.EVENT_TIME) ? raw.EVENT_TIME : '',
    venueLine1: raw.VENUE_LINE1,
    venueLine2: raw.VENUE_LINE2,
    mapQuery: raw.MAP_QUERY,
    senderName: raw.SENDER_NAME,
    sendGuestEmails: !/^(false|no|0|off)$/i.test(raw.SEND_GUEST_EMAILS),
    sendOwnerEmails: !/^(false|no|0|off)$/i.test(raw.SEND_OWNER_EMAILS),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Web app entry points
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST — the site sends a JSON string as text/plain (no CORS preflight).
 *   { action: 'attend', lang, side, main: {first,last,email,phone,category}, members: [{first,last,category}], message, website }
 *     side: 'asmat' | 'saima' (any case) — from the link (?side=, issue 15) or, on a bare link, the guest's
 *     own choice on the form (issue 16). REQUIRED: missing or anything else → { ok:false, error:'invalid' },
 *     nothing written, no email. Cancel bodies never carry a side (the Party keeps its own).
 *     category: 'man' | 'woman' | 'infant' for every person — required (issue 17).
 *   { action: 'cancel', lang, email, phone, cancel: [{name, category} | name] | all: true, message, website }
 *     cancel entries: people from the lookup (issue 18, exact name + category match) or plain names (older pages).
 * Always answers JSON: { ok: true, ... } or { ok: false, error: 'invalid'|'party_too_large'|'not_found'|'server' }.
 */
function doPost(e) {
  try {
    var body = parseBody_(e);
    if (!body) return json_({ ok: false, error: 'invalid' });
    // Honeypot: bots fill every field. Pretend it worked, write and send nothing.
    if (body.website) return json_({ ok: true });
    if (body.action === 'attend') return json_(handleAttend_(body));
    if (body.action === 'cancel') return json_(handleCancel_(body));
    return json_({ ok: false, error: 'invalid' });
  } catch (err) {
    logError_('doPost', err);
    return json_({ ok: false, error: 'server' });
  }
}

/**
 * GET
 *   ?action=count                      → { ok, guests, households }          (aggregates only)
 *   ?action=lookup&email=..&phone=..   → { ok, names: [...], people: [{ name, category }] } | { ok:false, error:'not_found' }
 *                                        (BOTH must match; category '' on an untagged line)
 *   (no action)                        → { ok: true, status: 'ready' }       (handy to check the URL)
 */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = String(p.action || '').trim().toLowerCase();
    if (action === 'count') return json_(handleCount_());
    if (action === 'lookup') return json_(handleLookup_(p.email, p.phone));
    if (!action) return json_({ ok: true, status: 'ready' });
    return json_({ ok: false, error: 'invalid' });
  } catch (err) {
    logError_('doGet', err);
    return json_({ ok: false, error: 'server' });
  }
}

/** Parses the POST body. Returns a plain object, or null when it isn't valid JSON of a sane size. */
function parseBody_(e) {
  var text = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (!text || text.length > LIMITS.body) return null;
  var body;
  try { body = JSON.parse(text); } catch (err) { return null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body;
}

/**
 * JSON response. Apps Script answers a web-app request with a 302 redirect to
 * script.googleusercontent.com, which serves this text with `Access-Control-Allow-Origin: *`,
 * so the site's fetch() (redirect: 'follow') can read it.
 */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** The current time. One place, so tests can set the clock. */
function now_() {
  return new Date();
}

/**
 * True when `date` is after the end of the reply-by day in Europe/Stockholm — the same rule as the
 * site's src/rsvp/deadline.js (isLate). 6 Nov 2026 ends at 2026-11-06T23:00:00Z.
 */
function isLateAt_(date, deadlineIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(deadlineIso || ''))) return false;
  return Utilities.formatDate(date, DEADLINE_TIME_ZONE, 'yyyy-MM-dd') > String(deadlineIso);
}

function logError_(where, err) {
  var msg = err && err.stack ? err.stack : String(err);
  try { console.error('[' + where + '] ' + msg); } catch (ignore) { /* no console */ }
  try { Logger.log('[' + where + '] ERROR ' + msg); } catch (ignore) { /* no Logger */ }
}

function logInfo_(msg) {
  try { console.log(msg); } catch (ignore) { /* no console */ }
}

// ─────────────────────────────────────────────────────────────────────────────
//  "Wedding RSVP" menu in the Google Sheet (appears a few seconds after the Sheet opens)
// ─────────────────────────────────────────────────────────────────────────────

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Wedding RSVP')
      .addItem('Set up / repair the tabs', 'setup')
      .addItem('Email me sample confirmations (all 4 languages)', 'sendSampleEmails')
      .addItem('Show settings', 'showSettings')
      .addSeparator()
      .addItem('Clear ALL RSVPs (before launch only)…', 'clearAllRsvps')
      .addToUi();
  } catch (err) {
    // Not opened from the Sheet UI (e.g. run from the editor) — nothing to do.
  }
}

/** Shows the effective settings (Script Properties + defaults) in a dialog and in the log. */
function showSettings() {
  var cfg = getConfig_();
  var quota = '?';
  try { quota = MailApp.getRemainingDailyQuota(); } catch (err) { /* not authorised yet */ }
  var lines = [
    'OWNER_EMAIL: ' + (cfg.ownerEmail || '(not set)'),
    'MAX_PARTY: ' + cfg.maxParty,
    'SITE_URL: ' + cfg.siteUrl,
    'EVENT_DATE: ' + cfg.eventDate,
    'RSVP_DEADLINE: ' + cfg.rsvpDeadline + ' (end of day, ' + DEADLINE_TIME_ZONE + ') — must match rsvpDeadline in config.js',
    'EVENT_TIME: ' + (cfg.eventTime || '(not set — hidden in emails)'),
    'VENUE: ' + cfg.venueLine1 + ', ' + cfg.venueLine2,
    'MAP_QUERY: ' + cfg.mapQuery,
    'SEND_GUEST_EMAILS: ' + cfg.sendGuestEmails,
    'SEND_OWNER_EMAILS: ' + cfg.sendOwnerEmails,
    'Emails left today: ' + quota,
    '',
    'Change these in the Apps Script editor → Project Settings → Script Properties.',
  ];
  Logger.log(lines.join('\n'));
  uiAlert_('Wedding RSVP settings', lines.join('\n'));
}

/**
 * Sends you one sample of every guest email (attend, partial cancel, full cancel × 4 languages)
 * plus a sample owner notification — for proofreading. Uses 13 emails of the daily quota.
 * Nothing is written to the Sheet.
 */
function sendSampleEmails() {
  var cfg = getConfig_();
  if (!cfg.ownerEmail) throw new Error('No OWNER_EMAIL — run setup() first.');
  var samples = sampleEvents_();
  var sent = 0;
  samples.forEach(function (ev) {
    var mail = renderGuestEmail_(ev, cfg);
    MailApp.sendEmail({ to: cfg.ownerEmail, subject: '[Sample ' + ev.lang.toUpperCase() + '] ' + mail.subject,
      body: mail.text, htmlBody: mail.html, name: cfg.senderName });
    sent++;
  });
  var owner = renderOwnerEmail_(samples[0], cfg);
  MailApp.sendEmail({ to: cfg.ownerEmail, subject: '[Sample] ' + owner.subject, body: owner.text, htmlBody: owner.html, name: cfg.senderName });
  sent++;
  uiAlert_('Samples sent', sent + ' sample emails were sent to ' + cfg.ownerEmail + '.');
}

/**
 * Deletes every RSVP row (keeps the header) — use it once to remove your test RSVPs before
 * sending the invitation. Asks for confirmation when run from the Sheet menu. Cannot be undone
 * (except via File → Version history in the Sheet).
 */
function clearAllRsvps() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (err) { ui = null; }
  if (ui) {
    var answer = ui.alert('Clear ALL RSVPs?',
      'This deletes every row in the RSVPs tab (the header stays). Only do this before launch, to remove test RSVPs.\n\nContinue?',
      ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
  } else {
    Logger.log('clearAllRsvps: run this from the Sheet menu (Wedding RSVP → Clear ALL RSVPs) so it can ask for confirmation.');
    return;
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new Error('Busy — try again in a moment.');
  try {
    var sheet = getRsvpSheet_();
    var last = sheet.getLastRow();
    if (last > 1) sheet.deleteRows(2, last - 1);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  invalidateCount_();
  uiAlert_('Done', 'All RSVP rows were deleted.');
}

function uiAlert_(title, text) {
  try { SpreadsheetApp.getUi().alert(title, text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (err) { /* run from the editor */ }
}
