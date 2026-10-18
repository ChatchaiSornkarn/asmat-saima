// Add-to-calendar (design Q21): an RFC 5545 .ics file and a Google Calendar link.
//
// Pure functions (no DOM, no i18n import) so they run under node for tests/layout/calendar.test.mjs.
// The caller passes the already-translated strings:
//
//   const strings = { title, description, location, url };
//   buildIcs(config, strings, { now? })   → string (CRLF line endings, folded at 75 octets)
//   googleCalendarUrl(config, strings)    → https://calendar.google.com/calendar/render?action=TEMPLATE&…
//   downloadIcs(ics, { filename?, config? })  (browser only)
//
// All-day while config.eventStart is null (DTSTART;VALUE=DATE:20261213 / DTEND;VALUE=DATE:20261214).
// Timed once eventStart is set: local wall-clock times with TZID + a VTIMEZONE block (CET/CEST rules
// for Europe/Stockholm and the other EU "Central European Time" zones); end = eventEnd or start + 4 h.
// For a zone we have no VTIMEZONE for, times are converted to UTC ("…Z") instead — always correct.
//
// iOS delivery (researched, see downloadIcs): a Blob typed text/calendar + <a download> on every platform.
// WebKit blocks top-level navigation to data: URLs (anti-phishing), so the old "open a data:text/calendar
// URL" trick no longer reliably shows the Add-to-Calendar sheet; an empty-typed Blob lands silently in
// Files › Downloads. The typed Blob gives Safari the MIME type it needs. The most reliable iOS path of all
// is a real hosted .ics file — set config.icsUrl to one and iPhone/iPad navigate to it instead.

export const ICS_FILENAME = 'wedding-asmat-saima.ics';
const UID_DOMAIN = 'asmat-saima.invite';
const DEFAULT_DURATION_MIN = 4 * 60;

// ── Date helpers (calendar arithmetic on plain Y/M/D/h/m, no host time zone involved) ─────────────

const pad = (n, w = 2) => String(n).padStart(w, '0');

function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) throw new Error(`calendar: invalid eventDate "${iso}" (expected YYYY-MM-DD)`);
  return { y: +m[1], mo: +m[2], d: +m[3] };
}

function parseTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`calendar: invalid time "${hhmm}" (expected HH:MM)`);
  return { h: +m[1], mi: +m[2] };
}

/** Add minutes to a wall-clock date-time; returns a normalised {y,mo,d,h,mi}. */
function addMinutes({ y, mo, d, h = 0, mi = 0 }, minutes) {
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi) + minutes * 60000);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}

const ymd = (p) => `${p.y}${pad(p.mo)}${pad(p.d)}`;
const ymdhms = (p) => `${ymd(p)}T${pad(p.h)}${pad(p.mi)}00`;

function utcStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** Offset (minutes east of UTC) of `timeZone` at the given UTC instant, via Intl. */
function tzOffsetMinutes(timeZone, utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type) => +parts.find((p) => p.type === type).value;
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - utcMs) / 60000);
}

/** Wall-clock time in `timeZone` → UTC {y,mo,d,h,mi}. Two passes handle DST transitions. */
function zonedToUtc(p, timeZone) {
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  let off = tzOffsetMinutes(timeZone, wall);
  off = tzOffsetMinutes(timeZone, wall - off * 60000);
  return addMinutes(p, -off);
}

/**
 * Resolve the event times from config.
 * @returns {{ allDay: true, start: {y,mo,d}, end: {y,mo,d} } |
 *           { allDay: false, start: {y,mo,d,h,mi}, end: {y,mo,d,h,mi}, timeZone: string }}
 */
export function eventTimes(config) {
  const date = parseDate(config.eventDate);
  if (config.eventStart == null || config.eventStart === '') {
    return { allDay: true, start: date, end: addMinutes(date, 24 * 60) };
  }
  const start = { ...date, ...parseTime(config.eventStart) };
  let end;
  if (config.eventEnd) {
    end = { ...date, ...parseTime(config.eventEnd) };
    // An end at or before the start means the party runs past midnight.
    if (end.h * 60 + end.mi <= start.h * 60 + start.mi) end = addMinutes(end, 24 * 60);
  } else {
    end = addMinutes(start, DEFAULT_DURATION_MIN);
  }
  return { allDay: false, start, end, timeZone: config.timeZone || 'Europe/Stockholm' };
}

// ── RFC 5545 text handling ──────────────────────────────────────────────────────────────────────────

/** Escape a TEXT value (RFC 5545 §3.3.11): backslash, semicolon, comma, newline. */
export function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();
const octets = (s) => encoder.encode(s).length;

/**
 * Fold one content line at 75 octets (RFC 5545 §3.1), measured in UTF-8 bytes. Breaks only between
 * code points — never inside a multibyte sequence — and keeps a combining mark (Thai vowels/tones,
 * Urdu diacritics, ZWJ/ZWNJ) on the same line as its base character where possible.
 * Continuation lines start with one space, which counts toward their 75.
 */
export function foldLine(line) {
  if (octets(line) <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  const isMark = (ch) => /[\p{M}‌‍]/u.test(ch);
  const chars = Array.from(line);
  for (let i = 0; i < chars.length; i++) {
    // Group a base character with the combining marks that follow it.
    let cluster = chars[i];
    // Keep an escape pair (\, \; \n \\) together — legal to split, but kinder to naive parsers.
    if (cluster === '\\' && i + 1 < chars.length) cluster += chars[++i];
    while (i + 1 < chars.length && isMark(chars[i + 1]) && octets(cluster + chars[i + 1]) <= 74) cluster += chars[++i];
    const b = octets(cluster);
    if (curBytes + b > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // continuation lines: 1 leading space + 74 octets
    }
    cur += cluster;
    curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// VTIMEZONE for the EU Central European Time zones (last Sunday of March 02:00 → CEST,
// last Sunday of October 03:00 → CET). Same rules for all of these.
const CET_ZONES = new Set([
  'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Berlin', 'Europe/Paris', 'Europe/Amsterdam',
  'Europe/Brussels', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Rome', 'Europe/Madrid', 'Europe/Prague',
  'Europe/Warsaw', 'Europe/Budapest', 'Europe/Luxembourg', 'Europe/Belgrade', 'Europe/Zagreb', 'Europe/Ljubljana',
]);

function vtimezone(tzid) {
  return [
    'BEGIN:VTIMEZONE',
    `TZID:${tzid}`,
    `X-LIC-LOCATION:${tzid}`,
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
}

/**
 * Build the .ics file text.
 * @param {object} config  site config (eventDate, eventStart, eventEnd, timeZone, venue)
 * @param {{title:string, description?:string, location?:string, url?:string, lang?:string}} strings
 * @param {{now?: Date}} [opts]
 */
export function buildIcs(config, strings, { now = new Date() } = {}) {
  const ev = eventTimes(config);
  const location = strings.location ?? config.venue?.mapQuery ?? '';
  const lang = strings.lang ? `;LANGUAGE=${strings.lang}` : '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Asmat & Saima//Wedding Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  let dtStart, dtEnd, alarm;
  if (ev.allDay) {
    dtStart = `DTSTART;VALUE=DATE:${ymd(ev.start)}`;
    dtEnd = `DTEND;VALUE=DATE:${ymd(ev.end)}`;
    // All-day events start at midnight: "-P1D" would ring at 00:00. -PT15H = 09:00 the day before
    // (what Apple Calendar itself writes for "1 day before" on all-day events).
    alarm = '-PT15H';
  } else if (CET_ZONES.has(ev.timeZone)) {
    lines.push(...vtimezone(ev.timeZone));
    dtStart = `DTSTART;TZID=${ev.timeZone}:${ymdhms(ev.start)}`;
    dtEnd = `DTEND;TZID=${ev.timeZone}:${ymdhms(ev.end)}`;
    alarm = '-P1D';
  } else {
    dtStart = `DTSTART:${ymdhms(zonedToUtc(ev.start, ev.timeZone))}Z`;
    dtEnd = `DTEND:${ymdhms(zonedToUtc(ev.end, ev.timeZone))}Z`;
    alarm = '-P1D';
  }

  lines.push(
    'BEGIN:VEVENT',
    // Stable UID: adding the event again (e.g. after the time is announced) updates rather than duplicates.
    `UID:wedding-${ymd(parseDate(config.eventDate))}@${UID_DOMAIN}`,
    `DTSTAMP:${utcStamp(now)}`,
    // A timed version supersedes an earlier all-day import of the same UID.
    `SEQUENCE:${ev.allDay ? 0 : 1}`,
    dtStart,
    dtEnd,
    `SUMMARY${lang}:${escapeText(strings.title)}`,
  );
  if (strings.description) lines.push(`DESCRIPTION${lang}:${escapeText(strings.description)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`); // a Swedish address: no LANGUAGE tag
  if (strings.url) lines.push(`URL:${strings.url}`);
  lines.push(
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:${alarm}`,
    `DESCRIPTION:${escapeText(strings.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Google Calendar "create event" link. Local times + ctz for timed events; dates only for all-day. */
export function googleCalendarUrl(config, strings) {
  const ev = eventTimes(config);
  const dates = ev.allDay ? `${ymd(ev.start)}/${ymd(ev.end)}` : `${ymdhms(ev.start)}/${ymdhms(ev.end)}`;
  const location = strings.location ?? config.venue?.mapQuery ?? '';
  const details = [strings.description, strings.url].filter(Boolean).join('\n\n');
  const q = [
    'action=TEMPLATE',
    `text=${encodeURIComponent(strings.title)}`,
    `dates=${dates}`,
  ];
  if (!ev.allDay) q.push(`ctz=${encodeURIComponent(ev.timeZone)}`);
  if (details) q.push(`details=${encodeURIComponent(details)}`);
  if (location) q.push(`location=${encodeURIComponent(location)}`);
  return `https://calendar.google.com/calendar/render?${q.join('&')}`;
}

const isIOS = () => {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * Hand the .ics to the guest's calendar (browser only).
 * - Everywhere: Blob typed `text/calendar;charset=utf-8` + <a download>. Desktop browsers save the
 *   file (opening it imports into Apple Calendar / Outlook); Android opens it with the calendar app.
 * - iPhone/iPad with config.icsUrl set: navigate to that hosted file — Safari then shows its native
 *   "Add to Calendar" sheet, the most reliable iOS experience.
 * - iPhone/iPad otherwise: the same typed Blob download (Safari asks to download it, and tapping it in
 *   Downloads opens the Add-to-Calendar sheet). Not a data: URL — WebKit blocks top-level navigation
 *   to data: URLs, so that path can silently fail.
 */
export function downloadIcs(ics, { filename = ICS_FILENAME, config = {} } = {}) {
  if (config.icsUrl && isIOS()) {
    window.location.href = config.icsUrl;
    return;
  }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
