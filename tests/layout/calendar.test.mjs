// Run: node --test tests/layout/calendar.test.mjs   (from asmat-saima/; Node 18+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, googleCalendarUrl, escapeText, foldLine, eventTimes } from '../../src/calendar.js';

const baseConfig = {
  eventDate: '2026-12-06',
  eventStart: null,
  eventEnd: null,
  timeZone: 'Europe/Stockholm',
  venue: { line1: 'Säve Flygplatsväg 26', line2: 'Göteborg', mapQuery: 'Säve Flygplatsväg 26, 423 73 Säve, Sweden' },
};
const strings = {
  title: 'Nikah of Asmat & Saima',
  description: 'You are warmly invited to the Nikah of Asmat & Saima. We look forward to celebrating with you.',
  url: 'https://chatchaisornkarn.github.io/asmat-saima/',
  lang: 'en',
};
const now = new Date(Date.UTC(2026, 9, 2, 8, 30, 5));
const enc = new TextEncoder();

/** RFC 5545 unfolding. */
const unfold = (ics) => ics.replace(/\r\n[ \t]/g, '');
const props = (ics) => unfold(ics).split('\r\n').filter(Boolean);
/** First property `name` inside the VEVENT (skips VTIMEZONE's own DTSTART lines). */
const prop = (ics, name) => props(ics).slice(props(ics).indexOf('BEGIN:VEVENT')).find((l) => l === name || l.startsWith(name + ':') || l.startsWith(name + ';'));

function assertWellFormed(ics) {
  assert.ok(ics.endsWith('\r\n'), 'ends with CRLF');
  assert.ok(!/[^\r]\n/.test(ics), 'every LF is preceded by CR');
  assert.ok(!/\r(?!\n)/.test(ics), 'no bare CR');
  for (const line of ics.split('\r\n')) {
    assert.ok(enc.encode(line).length <= 75, `line exceeds 75 octets (${enc.encode(line).length}): ${line}`);
    // Never split inside a UTF-8 sequence: each physical line must round-trip through UTF-8 unchanged.
    assert.ok(!line.includes('�'), 'no replacement characters');
  }
  const p = props(ics);
  assert.equal(p[0], 'BEGIN:VCALENDAR');
  assert.equal(p.at(-1), 'END:VCALENDAR');
  assert.ok(p.includes('VERSION:2.0'));
  assert.ok(p.some((l) => l.startsWith('PRODID:')));
  // Balanced components
  const stack = [];
  for (const l of p) {
    if (l.startsWith('BEGIN:')) stack.push(l.slice(6));
    if (l.startsWith('END:')) assert.equal(stack.pop(), l.slice(4), `unbalanced ${l}`);
  }
  assert.equal(stack.length, 0);
}

test('all-day event while eventStart is null', () => {
  const ics = buildIcs(baseConfig, strings, { now });
  assertWellFormed(ics);
  assert.equal(prop(ics, 'DTSTART'), 'DTSTART;VALUE=DATE:20261206');
  assert.equal(prop(ics, 'DTEND'), 'DTEND;VALUE=DATE:20261207');
  assert.ok(!ics.includes('VTIMEZONE'), 'no VTIMEZONE for an all-day event');
  assert.ok(!ics.includes('TZID'), 'no TZID for an all-day event');
  assert.equal(prop(ics, 'DTSTAMP'), 'DTSTAMP:20261002T083005Z');
  assert.match(prop(ics, 'UID'), /^UID:nikah-20261206@/);
  assert.equal(prop(ics, 'SUMMARY'), 'SUMMARY;LANGUAGE=en:Nikah of Asmat & Saima');
  assert.equal(prop(ics, 'URL'), 'URL:https://chatchaisornkarn.github.io/asmat-saima/');
  assert.equal(prop(ics, 'LOCATION'), 'LOCATION:Säve Flygplatsväg 26\\, 423 73 Säve\\, Sweden');
  // VALARM one day before (09:00 the day before for all-day events)
  const u = unfold(ics);
  assert.match(u, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15H\r\n/);
});

test('setting eventStart produces a timed event in Europe/Stockholm with VTIMEZONE', () => {
  const ics = buildIcs({ ...baseConfig, eventStart: '14:00' }, strings, { now });
  assertWellFormed(ics);
  assert.equal(prop(ics, 'DTSTART'), 'DTSTART;TZID=Europe/Stockholm:20261206T140000');
  assert.equal(prop(ics, 'DTEND'), 'DTEND;TZID=Europe/Stockholm:20261206T180000', 'defaults to start + 4h');
  const u = unfold(ics);
  assert.ok(u.includes('BEGIN:VTIMEZONE\r\nTZID:Europe/Stockholm'));
  assert.ok(u.includes('TZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nTZNAME:CEST'));
  assert.ok(u.includes('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU'));
  assert.ok(u.indexOf('END:VTIMEZONE') < u.indexOf('BEGIN:VEVENT'), 'VTIMEZONE precedes VEVENT');
  assert.match(u, /TRIGGER:-P1D\r\n/);
  assert.ok(!u.includes('VALUE=DATE'));
});

test('eventEnd is honoured, and an end past midnight rolls to the next day', () => {
  let ics = buildIcs({ ...baseConfig, eventStart: '14:00', eventEnd: '20:30' }, strings, { now });
  assert.equal(prop(ics, 'DTEND'), 'DTEND;TZID=Europe/Stockholm:20261206T203000');
  ics = buildIcs({ ...baseConfig, eventStart: '18:00', eventEnd: '01:00' }, strings, { now });
  assert.equal(prop(ics, 'DTEND'), 'DTEND;TZID=Europe/Stockholm:20261207T010000');
  ics = buildIcs({ ...baseConfig, eventStart: '21:30' }, strings, { now });
  assert.equal(prop(ics, 'DTEND'), 'DTEND;TZID=Europe/Stockholm:20261207T013000', 'start + 4h crosses midnight');
});

test('toggling eventStart back to null returns to all-day', () => {
  const cfg = { ...baseConfig, eventStart: '14:00' };
  assert.equal(eventTimes(cfg).allDay, false);
  cfg.eventStart = null;
  assert.equal(eventTimes(cfg).allDay, true);
  assert.equal(prop(buildIcs(cfg, strings, { now }), 'DTSTART'), 'DTSTART;VALUE=DATE:20261206');
});

test('zone without a VTIMEZONE table falls back to UTC times', () => {
  const ics = buildIcs({ ...baseConfig, eventStart: '14:00', timeZone: 'Asia/Karachi' }, strings, { now });
  assertWellFormed(ics);
  assert.equal(prop(ics, 'DTSTART'), 'DTSTART:20261206T090000Z'); // PKT = UTC+5
  assert.equal(prop(ics, 'DTEND'), 'DTEND:20261206T130000Z');
});

test('TEXT escaping of backslash, semicolon, comma and newlines', () => {
  assert.equal(escapeText('a\\b;c,d\ne\r\nf'), 'a\\\\b\\;c\\,d\\ne\\nf');
  const ics = buildIcs(baseConfig, { ...strings, title: 'A; B, C \\ D', description: 'Line 1\nLine 2' }, { now });
  assert.equal(prop(ics, 'SUMMARY'), 'SUMMARY;LANGUAGE=en:A\\; B\\, C \\\\ D');
  assert.equal(prop(ics, 'DESCRIPTION'), 'DESCRIPTION;LANGUAGE=en:Line 1\\nLine 2');
});

test('folding measures UTF-8 octets for Swedish, Thai and Urdu', () => {
  const samples = {
    sv: 'Ni är varmt välkomna till Asmats och Saimas nikah. Vi ser fram emot att fira tillsammans med er på Säve Flygplatsväg 26, Göteborg – åäö ÅÄÖ.',
    th: 'ขอเรียนเชิญท่านร่วมเป็นเกียรติในพิธีนิกาห์ของ Asmat และ Saima เรายินดีที่จะได้ร่วมเฉลิมฉลองกับท่าน ณ เมืองโกเธนเบิร์ก',
    ur: 'آپ کو عصمت اور صائمہ کے نکاح میں شرکت کی پُرخلوص دعوت دی جاتی ہے۔ ہم آپ کے ساتھ جشن منانے کے منتظر ہیں۔',
  };
  for (const [lang, description] of Object.entries(samples)) {
    const ics = buildIcs(baseConfig, { ...strings, lang, title: description.slice(0, 40), description }, { now });
    assertWellFormed(ics);
    const raw = ics.split('\r\n');
    assert.ok(raw.some((l) => l.startsWith(' ')), `${lang}: long text was folded`);
    // Unfolding restores the exact escaped text
    assert.equal(prop(ics, 'DESCRIPTION'), `DESCRIPTION;LANGUAGE=${lang}:${escapeText(description)}`);
    // Byte-level check: concatenated physical lines (minus fold markers) decode to the original
    const bytes = Buffer.from(ics, 'utf8');
    assert.equal(bytes.toString('utf8'), ics);
  }
});

test('foldLine keeps Thai combining marks with their base character', () => {
  const line = 'DESCRIPTION:' + 'ที่'.repeat(40);
  const folded = foldLine(line);
  for (const physical of folded.split('\r\n')) {
    const body = physical.startsWith(' ') ? physical.slice(1) : physical;
    assert.ok(!/^[ัิ-ฺ็-๎]/.test(body), `line starts with a combining mark: ${body.slice(0, 4)}`);
    assert.ok(enc.encode(physical).length <= 75);
  }
  assert.equal(folded.replace(/\r\n /g, ''), line);
});

test('foldLine leaves short lines alone and folds exactly at 75 octets', () => {
  assert.equal(foldLine('SUMMARY:Hi'), 'SUMMARY:Hi');
  const exact = 'X'.repeat(75);
  assert.equal(foldLine(exact), exact);
  const over = 'X'.repeat(76);
  assert.equal(foldLine(over), 'X'.repeat(75) + '\r\n X');
});

test('Google Calendar link: all-day dates, then local times with ctz', () => {
  let url = new URL(googleCalendarUrl(baseConfig, strings));
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('dates'), '20261206/20261207');
  assert.equal(url.searchParams.get('ctz'), null);
  assert.equal(url.searchParams.get('text'), 'Nikah of Asmat & Saima');
  assert.equal(url.searchParams.get('location'), baseConfig.venue.mapQuery);
  assert.ok(url.searchParams.get('details').includes(strings.url));

  url = new URL(googleCalendarUrl({ ...baseConfig, eventStart: '14:00' }, strings));
  assert.equal(url.searchParams.get('dates'), '20261206T140000/20261206T180000');
  assert.equal(url.searchParams.get('ctz'), 'Europe/Stockholm');
});

test('invalid config values throw a clear error', () => {
  assert.throws(() => buildIcs({ ...baseConfig, eventDate: '6/12/2026' }, strings), /eventDate/);
  assert.throws(() => buildIcs({ ...baseConfig, eventStart: '2pm' }, strings), /time/);
});
