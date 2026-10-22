// The reply-by deadline lives in two places (2_main_idea issue 14, design Q9 → Risks):
//   config.js → rsvpDeadline / timeZone        (page: "Please reply by …" and the late notice)
//   apps-script/Code.gs → CONFIG_DEFAULTS.RSVP_DEADLINE / DEADLINE_TIME_ZONE   (script: the late column)
// If they disagree, the page notice and the late flag disagree. This test fails until both match.
// (A RSVP_DEADLINE Script Property overrides the Code.gs default on the live script — check it by hand
//  with Wedding RSVP → Show settings.)
//   node --test 'tests/apps-script/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../../config.js';
import { isLate } from '../../src/rsvp/deadline.js';
import { createBackend } from './harness.mjs';

test('Code.gs defaults match config.js: deadline, time zone and event date', () => {
  const b = createBackend();
  const d = b.context.CONFIG_DEFAULTS;
  assert.equal(d.RSVP_DEADLINE, config.rsvpDeadline, 'CONFIG_DEFAULTS.RSVP_DEADLINE must equal config.js rsvpDeadline');
  assert.equal(b.context.DEADLINE_TIME_ZONE, config.timeZone, 'DEADLINE_TIME_ZONE must equal config.js timeZone');
  assert.equal(d.EVENT_DATE, config.eventDate, 'CONFIG_DEFAULTS.EVENT_DATE must equal config.js eventDate');
  assert.equal(d.EVENT_TIME, config.eventStart, 'CONFIG_DEFAULTS.EVENT_TIME must equal config.js eventStart');
  assert.equal(b.context.getConfig_().rsvpDeadline, config.rsvpDeadline);
});

test('the script and the page call the same instants late (end of 6 Nov = 2026-11-06T23:00:00Z)', () => {
  const b = createBackend();
  const instants = ['2026-10-12T10:00:00Z', '2026-11-06T00:00:00Z', '2026-11-06T22:59:59.999Z', '2026-11-06T23:00:00Z',
    '2026-11-07T10:00:00Z', '2026-12-13T12:00:00Z',
    // a summer-time deadline: the day then ends at 22:00Z
    '2026-06-30T21:59:59Z', '2026-06-30T22:00:00Z'];
  for (const iso of [config.rsvpDeadline, '2026-06-30']) {
    for (const t of instants) {
      const page = isLate(iso, config.timeZone, new Date(t));
      const script = b.context.isLateAt_(new Date(t), iso);
      assert.equal(script, page, `${iso} @ ${t}`);
    }
  }
  assert.equal(b.context.isLateAt_(new Date('2026-11-06T22:59:59Z'), config.rsvpDeadline), false);
  assert.equal(b.context.isLateAt_(new Date('2026-11-06T23:00:00Z'), config.rsvpDeadline), true);
});
