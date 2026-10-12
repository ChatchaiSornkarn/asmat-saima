// RSVP deadline (design 2_main_idea Q9). Pure — no DOM — so it runs under node for tests/rsvp/.
//
//   isOpen(iso, timeZone?, now?) → true until the end of the day `iso` ('YYYY-MM-DD') in `timeZone`
//                                  (default Europe/Stockholm); false after it, or when `iso` is not a date.
//   isLate(iso, timeZone?, now?) → true once that day has ended (a reply now is a late reply, issue 14);
//                                  false before it, and false when `iso` is not a date (no deadline = never late).
//
// The Apps Script has its own copy of the deadline (apps-script/Code.gs → CONFIG_DEFAULTS.RSVP_DEADLINE)
// and flags late rows with the same rule; tests/apps-script/deadline-sync.test.mjs keeps the two equal.
//
// "End of the day" = while today's calendar date in that zone is on or before `iso`, so the result is
// right whatever the guest's own device time zone is.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(timeZone = 'Europe/Stockholm', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isOpen(iso, timeZone = 'Europe/Stockholm', now = new Date()) {
  if (!iso || !ISO_DATE.test(String(iso))) return false;
  let today;
  try { today = todayIn(timeZone || 'Europe/Stockholm', now); } catch { today = todayIn('Europe/Stockholm', now); }
  return today <= String(iso);
}

export function isLate(iso, timeZone = 'Europe/Stockholm', now = new Date()) {
  if (!iso || !ISO_DATE.test(String(iso))) return false;
  return !isOpen(iso, timeZone, now);
}
