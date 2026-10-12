// Demo backend — used when config.appsScriptUrl is ''. Implements exactly the Apps Script contract
// (ARCHITECTURE.md → Backend API) against an append-only "RSVPs sheet" kept in localStorage.
// DOM-free: storage and latency are injected, so node tests can drive it directly.
import { normalisePhone } from './phone.js';
import { isLate } from './deadline.js';
import { cleanSide } from './side.js';
import { validateAttend, validateLookup, cleanName, cleanEmail, cleanMessage, cleanCategory, fullName, LIMITS } from './validate.js';

export const DEMO_KEY = 'asmat-saima-demo';

/** { men, women, infants } of a list of people ({ name, category }) — like the script's columns (issue 17). */
export function countCategories(people) {
  const out = { men: 0, women: 0, infants: 0 };
  for (const p of people) {
    const k = { man: 'men', woman: 'women', infant: 'infants' }[p.category];
    if (k) out[k] += 1;
  }
  return out;
}

/** A demo row's people; rows saved before issue 17 have plain names only. */
const peopleOf = (r) => (Array.isArray(r.people) ? r.people : (r.names || []).map((name) => ({ name, category: '' })));

/** Added to a cancel row's note when a remaining person has no category (like the script's UNTAGGED_NOTE). */
export const UNTAGGED_NOTE = 'untagged names — fix counts';

/**
 * A cancel entry → { name, category }: a person from the lookup ({ name, category }, issue 18) or a plain name.
 * null when the name is empty or the category is given but unknown.
 */
function cancelEntry(e) {
  const obj = e && typeof e === 'object' && !Array.isArray(e);
  const raw = obj ? e.name : e;
  if (typeof raw !== 'string') return null;
  const name = cleanName(raw);
  if (!name || name.length > 2 * LIMITS.name + 1) return null;
  const given = obj && e.category !== undefined && e.category !== null && e.category !== '';
  const category = given ? cleanCategory(e.category) : '';
  if (given && !category) return null;
  return { name, category };
}

/**
 * Index of the person to cancel: exact name + category first (two people of one name), else the first name match —
 * but a tagged entry falls back to name only when no one in `original` (the Party before removals) had that exact
 * { name, category } (tag edited since the lookup). Otherwise -1, like the script's findPerson_.
 */
export function findPerson(people, want, original = people) {
  if (want.category) {
    const exact = (p) => p.name === want.name && p.category === want.category;
    const i = people.findIndex(exact);
    if (i > -1) return i;
    if (original.some(exact)) return -1;
  }
  return people.findIndex((p) => p.name === want.name);
}

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

/**
 * @param {object}   opts
 * @param {Storage} [opts.storage]      localStorage-like; defaults to in-memory
 * @param {number}  [opts.maxPartySize] server-side cap (default 20)
 * @param {[number,number]} [opts.latency] simulated latency range in ms (default [500, 900]; [0,0] in tests)
 * @param {() => string} [opts.now]     ISO timestamp provider
 * @param {string|null} [opts.rsvpDeadline] 'YYYY-MM-DD' (config.rsvpDeadline); attend rows after the end of that day
 *                                     get late: true, like the script's `late` column (issue 14). null = never late.
 * @param {string} [opts.timeZone]      zone the deadline day ends in (default Europe/Stockholm)
 */
export function createMock({ storage = memoryStorage(), maxPartySize = 20, latency = [500, 900], now = () => new Date().toISOString(),
  rsvpDeadline = null, timeZone = 'Europe/Stockholm' } = {}) {
  const load = () => {
    try {
      const s = JSON.parse(storage.getItem(DEMO_KEY) || 'null');
      if (s && Array.isArray(s.rows)) return s;
    } catch { /* corrupted → start fresh */ }
    return { rows: [] };
  };
  const save = (s) => { try { storage.setItem(DEMO_KEY, JSON.stringify(s)); } catch { /* quota/private mode */ } };
  const wait = () => {
    const [a, b] = latency;
    const ms = a + Math.random() * Math.max(0, b - a);
    return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
  };
  const lc = (e) => cleanEmail(e).toLowerCase();
  const active = (rows) => rows.filter((r) => r.status === 'active');
  // Lookup/cancel need BOTH email and phone (Q13).
  const findBoth = (rows, email, phone) => {
    const e = lc(email), p = normalisePhone(phone);
    return rows.find((r) => r.status === 'active' && r.email === e && r.phone === p) || null;
  };

  async function attend(body = {}) {
    await wait();
    if (body.website) return { ok: true };                       // honeypot: pretend success, write nothing
    const v = validateAttend(body, maxPartySize);
    if (v.tooLarge) return { ok: false, error: 'party_too_large' };
    if (!v.ok) return { ok: false, error: 'invalid' };
    if (!cleanSide(body.side)) return { ok: false, error: 'invalid' };   // Side is required, like the script (issue 16)
    const s = load();
    const email = lc(body.main.email), phone = normalisePhone(body.main.phone);
    const people = [body.main, ...(body.members || [])].map((p) => ({ name: fullName(p), category: cleanCategory(p.category) }));
    const names = people.map((p) => p.name);
    // Supersede every active row matching email OR phone (Q8) — latest wins.
    const replacedIdx = [];
    s.rows.forEach((r, i) => {
      if (r.status === 'active' && (r.email === email || r.phone === phone)) { r.status = 'superseded'; replacedIdx.push(i + 2); }
    });
    const timestamp = now();
    s.rows.push({
      timestamp, type: 'attend', email, phone, side: cleanSide(body.side), party_size: names.length, ...countCategories(people), names, people,
      message: cleanMessage(body.message).slice(0, LIMITS.message), language: String(body.lang || ''),
      status: 'active', replaces: replacedIdx.join(','), late: isLate(rsvpDeadline, timeZone, new Date(timestamp)), note: '',
    });
    save(s);
    return { ok: true, partySize: names.length, names, people: people.map((p) => ({ ...p })), replaced: replacedIdx.length > 0 };
  }

  async function lookup(email, phone) {
    await wait();
    if (!validateLookup({ email, phone }).ok) return { ok: false, error: 'not_found' };
    const row = findBoth(load().rows, email, phone);
    return row ? { ok: true, names: row.names.slice(), people: peopleOf(row).map((p) => ({ name: p.name, category: p.category || '' })) }
      : { ok: false, error: 'not_found' };
  }

  async function cancel(body = {}) {
    await wait();
    if (body.website) return { ok: true };
    if (!validateLookup(body).ok) return { ok: false, error: 'invalid' };
    const s = load();
    const row = findBoth(s.rows, body.email, body.phone);
    if (!row) return { ok: false, error: 'not_found' };
    // People keep their category, so the remaining row's men / women / infants / party_size are recounted (issue 18).
    let gone, left;
    if (body.all === true) {
      gone = peopleOf(row).slice(); left = [];
    } else {
      const want = Array.isArray(body.cancel) ? body.cancel.map(cancelEntry) : [];
      if (!want.length || want.includes(null)) return { ok: false, error: 'invalid' };
      // Multiset removal: two members called "Sara Khan" can be cancelled one at a time.
      const original = peopleOf(row);
      left = original.slice(); gone = [];
      for (const w of want) {
        const i = findPerson(left, w, original);
        if (i === -1) return { ok: false, error: 'invalid' };
        gone.push(left.splice(i, 1)[0]);
      }
    }
    const cancelled = gone.map((p) => p.name), remaining = left.map((p) => p.name);
    const idx = s.rows.indexOf(row);
    row.status = 'superseded';
    const status = remaining.length ? 'active' : 'cancelled';
    s.rows.push({
      timestamp: now(), type: 'cancel', email: row.email, phone: row.phone, side: cleanSide(row.side), party_size: remaining.length,
      ...countCategories(left), names: remaining, people: left,
      message: cleanMessage(body.message).slice(0, LIMITS.message), language: String(body.lang || ''),
      status, replaces: String(idx + 2), late: row.late === true, note: [`Cancelled: ${cancelled.join(', ')}`, ...(left.some((p) => !p.category) ? [UNTAGGED_NOTE] : [])].join('; '),   // cancels always accepted; keeps the replaced row's late flag and side
    });
    save(s);
    return { ok: true, cancelled, remaining, status };
  }

  async function count() {
    await wait();
    const rows = active(load().rows);
    return { ok: true, guests: rows.reduce((a, r) => a + r.party_size, 0), households: rows.length };
  }

  const reset = () => { try { storage.removeItem(DEMO_KEY); } catch { /* ignore */ } };
  const rows = () => load().rows;

  return { attend, cancel, lookup, count, reset, rows };
}
