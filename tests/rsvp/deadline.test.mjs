// Wedding date + reply-by deadline (2_main_idea issue 13, design Q9). Run from the repo root:
//   node --test 'tests/rsvp/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import config from '../../config.js';
import { isOpen, todayIn } from '../../src/rsvp/deadline.js';
import en from '../../src/i18n/en.js';
import sv from '../../src/i18n/sv.js';
import th from '../../src/i18n/th.js';
import ur from '../../src/i18n/ur.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TABLES = { en, sv, th, ur };
// Same locales and options as src/i18n/index.js and src/rsvp/index.js (renderDeadline).
const LOCALES = { en: 'en-GB', sv: 'sv-SE', th: 'th-TH', ur: 'ur-PK' };
const fmtDeadline = (lang, iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
};

test('config: Sunday 13 December 2026, reply by Friday 6 November 2026', () => {
  assert.equal(config.eventDate, '2026-12-13');
  assert.equal(config.rsvpDeadline, '2026-11-06');
  assert.equal(config.timeZone, 'Europe/Stockholm');
  assert.equal(new Date(Date.UTC(2026, 11, 13)).getUTCDay(), 0, '13 Dec 2026 is a Sunday');
  assert.equal(new Date(Date.UTC(2026, 10, 6)).getUTCDay(), 5, '6 Nov 2026 is a Friday');
});

test('i18n: title, description, postcard date and calendar subtitle say 13 December in all four languages', () => {
  const month = { en: '13 December', sv: '13 december', th: '13 ธันวาคม', ur: '13 دسمبر' };
  const sunday = { en: 'Sunday', sv: 'öndag', th: 'วันอาทิตย์', ur: 'اتوار' };
  for (const [lang, s] of Object.entries(TABLES)) {
    for (const key of ['meta.title', 'meta.description', 'postcard.date']) {
      const v = key.split('.').reduce((o, k) => o[k], s);
      assert.ok(v.includes(month[lang]), `${lang} ${key}: ${v}`);
    }
    const cal = JSON.stringify(s).match(/"calendarSub":"([^"]*)"/)[1];
    assert.ok(cal.includes(month[lang]), `${lang} calendarSub: ${cal}`);
    assert.ok(s.postcard.date.includes(sunday[lang]), `${lang} postcard.date keeps Sunday`);
  }
  assert.ok(th.postcard.date.includes('พ.ศ. 2569'), 'Thai keeps the Buddhist Era year');
});

test('i18n: reply-by line reads 6 November in all four languages', () => {
  const expect = { en: /6 November 2026/, sv: /6 november 2026/, th: /6 พฤศจิกายน 2569/, ur: /6 نومبر/ };
  for (const [lang, s] of Object.entries(TABLES)) {
    const line = s.rsvp.deadline.replace('{date}', fmtDeadline(lang, config.rsvpDeadline));
    assert.match(line, expect[lang], `${lang}: ${line}`);
  }
});

test('deadline: shown until the end of 6 November, Europe/Stockholm', () => {
  const D = config.rsvpDeadline;
  // 6 Nov 2026 is in CET (UTC+1): the day ends at 2026-11-06T23:00:00Z.
  assert.equal(isOpen(D, 'Europe/Stockholm', new Date('2026-10-12T10:00:00Z')), true, 'weeks before');
  assert.equal(isOpen(D, 'Europe/Stockholm', new Date('2026-11-06T00:00:00Z')), true, 'on the day');
  assert.equal(isOpen(D, 'Europe/Stockholm', new Date('2026-11-06T22:59:59Z')), true, '23:59:59 Göteborg');
  assert.equal(isOpen(D, 'Europe/Stockholm', new Date('2026-11-06T23:00:00Z')), false, '00:00 on 7 Nov Göteborg');
  assert.equal(isOpen(D, 'Europe/Stockholm', new Date('2026-11-20T12:00:00Z')), false, 'weeks after');
  // Default zone is Stockholm, whatever the device zone is.
  assert.equal(isOpen(D, undefined, new Date('2026-11-06T22:30:00Z')), true);
  assert.equal(isOpen(D, undefined, new Date('2026-11-06T23:30:00Z')), false);
  assert.equal(todayIn('Europe/Stockholm', new Date('2026-11-06T23:00:00Z')), '2026-11-07');
});

test('deadline: no or bad date → line hidden; unknown zone falls back to Stockholm', () => {
  assert.equal(isOpen(null), false);
  assert.equal(isOpen(''), false);
  assert.equal(isOpen('6/11/2026'), false);
  assert.equal(isOpen('2026-11-06', 'Not/AZone', new Date('2026-11-06T22:30:00Z')), true);
});

// Lines marked "retired" may name the old date on purpose: setup() replaces it in Script Properties (RETIRED_SETTINGS).
test('repo: no old date (2026-12-06 / 6 December) left in the site, script or tests', async () => {
  const OLD = [/2026-12-06/, /20261206/, /\b6 December\b/i, /\b6 ธันวาคม/, /\b6 دسمبر/, /Date\.UTC\(2026, 11, 6\b/, /December 6\b/i, /[๖۶٦]\s*(ธันวาคม|دسمبر)/];
  const skip = new Set(['node_modules', '__pycache__', '.git']);
  const self = fileURLToPath(import.meta.url);
  const hits = [];
  async function walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (p === self || !/\.(js|mjs|gs|html|md|py|css|json|svg)$/.test(e.name)) continue;
      const text = (await readFile(p, 'utf8')).split('\n').filter((line) => !/retired/i.test(line)).join('\n');
      for (const re of OLD) if (re.test(text)) hits.push(`${path.relative(root, p)} ~ ${re}`);
    }
  }
  await walk(root);
  assert.deepEqual(hits, []);
});
