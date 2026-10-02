// Demo backend — used when config.appsScriptUrl is ''. Implements exactly the Apps Script contract
// (ARCHITECTURE.md → Backend API) against an append-only "RSVPs sheet" kept in localStorage.
// DOM-free: storage and latency are injected, so node tests can drive it directly.
import { normalisePhone } from './phone.js';
import { validateAttend, validateLookup, cleanName, cleanEmail, cleanMessage, fullName, LIMITS } from './validate.js';

export const DEMO_KEY = 'asmat-saima-demo';

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
 */
export function createMock({ storage = memoryStorage(), maxPartySize = 20, latency = [500, 900], now = () => new Date().toISOString() } = {}) {
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
    const s = load();
    const email = lc(body.main.email), phone = normalisePhone(body.main.phone);
    const names = [fullName(body.main), ...(body.members || []).map(fullName)];
    // Supersede every active row matching email OR phone (Q8) — latest wins.
    const replacedIdx = [];
    s.rows.forEach((r, i) => {
      if (r.status === 'active' && (r.email === email || r.phone === phone)) { r.status = 'superseded'; replacedIdx.push(i + 2); }
    });
    s.rows.push({
      timestamp: now(), type: 'attend', email, phone, party_size: names.length, names,
      message: cleanMessage(body.message).slice(0, LIMITS.message), language: String(body.lang || ''),
      status: 'active', replaces: replacedIdx.join(','), note: '',
    });
    save(s);
    return { ok: true, partySize: names.length, names, replaced: replacedIdx.length > 0 };
  }

  async function lookup(email, phone) {
    await wait();
    if (!validateLookup({ email, phone }).ok) return { ok: false, error: 'not_found' };
    const row = findBoth(load().rows, email, phone);
    return row ? { ok: true, names: row.names.slice() } : { ok: false, error: 'not_found' };
  }

  async function cancel(body = {}) {
    await wait();
    if (body.website) return { ok: true };
    if (!validateLookup(body).ok) return { ok: false, error: 'invalid' };
    const s = load();
    const row = findBoth(s.rows, body.email, body.phone);
    if (!row) return { ok: false, error: 'not_found' };
    let cancelled, remaining;
    if (body.all === true) {
      cancelled = row.names.slice(); remaining = [];
    } else {
      const want = Array.isArray(body.cancel) ? body.cancel.map(cleanName).filter(Boolean) : [];
      if (!want.length) return { ok: false, error: 'invalid' };
      // Multiset removal: two members called "Sara Khan" can be cancelled one at a time.
      remaining = row.names.slice(); cancelled = [];
      for (const n of want) {
        const i = remaining.indexOf(n);
        if (i === -1) return { ok: false, error: 'invalid' };
        cancelled.push(remaining.splice(i, 1)[0]);
      }
    }
    const idx = s.rows.indexOf(row);
    row.status = 'superseded';
    const status = remaining.length ? 'active' : 'cancelled';
    s.rows.push({
      timestamp: now(), type: 'cancel', email: row.email, phone: row.phone, party_size: remaining.length, names: remaining,
      message: cleanMessage(body.message).slice(0, LIMITS.message), language: String(body.lang || ''),
      status, replaces: String(idx + 2), note: `Cancelled: ${cancelled.join(', ')}`,
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
