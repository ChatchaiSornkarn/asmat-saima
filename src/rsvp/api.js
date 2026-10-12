// RSVP API client — talks to the Google Apps Script web app (ARCHITECTURE.md → Backend API),
// or to the in-browser demo mock when config.appsScriptUrl is ''.
//
// Every function resolves (never rejects) to the contract's shape:
//   { ok: true, ... }  or  { ok: false, error: 'invalid' | 'party_too_large' | 'not_found' | 'server' | 'network' }
// 'network' is client-side only: offline, DNS, timeout.
import { createMock } from './mock.js';

export const TIMEOUT_MS = 15000;
const KNOWN = new Set(['invalid', 'party_too_large', 'not_found', 'server']);

function safeLocalStorage() {
  try { const s = window.localStorage; s.getItem('x'); return s; } catch { return undefined; }
}

/**
 * @param {object} config  site config (appsScriptUrl, maxPartySize, rsvpDeadline, timeZone)
 * @param {object} [opts]  { fetch, timeout, storage, latency, now } — injectable for tests
 */
export function createApi(config, opts = {}) {
  const url = String(config?.appsScriptUrl || '').trim();
  if (!url) {
    const mock = createMock({ storage: opts.storage ?? (typeof window !== 'undefined' ? safeLocalStorage() : undefined), maxPartySize: config?.maxPartySize ?? 20, latency: opts.latency,
      rsvpDeadline: config?.rsvpDeadline ?? null, timeZone: config?.timeZone || 'Europe/Stockholm', now: opts.now });
    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search);
      if (q.get('demo') === 'reset') {
        mock.reset();
        q.delete('demo');
        const qs = q.toString();
        try { history.replaceState(history.state, '', location.pathname + (qs ? `?${qs}` : '') + location.hash); } catch { /* ignore */ }
      }
    }
    return { demo: true, attend: mock.attend, cancel: mock.cancel, lookup: mock.lookup, count: mock.count, reset: mock.reset };
  }

  const doFetch = opts.fetch || ((...a) => fetch(...a));
  const timeout = opts.timeout ?? TIMEOUT_MS;

  async function withTimeout(input, init = {}) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      return await doFetch(input, { ...init, signal: ctrl?.signal });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function readJson(res) {
    if (!res || (res.status && res.status >= 400)) return { ok: false, error: 'server' };
    let data;
    try { data = await res.json(); } catch { return { ok: false, error: 'server' }; } // HTML error page etc.
    if (!data || typeof data !== 'object') return { ok: false, error: 'server' };
    if (data.ok === true) return data;
    return { ok: false, error: KNOWN.has(data.error) ? data.error : 'server' };
  }

  const isAbort = (e) => e && (e.name === 'AbortError' || e.name === 'TimeoutError');
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

  async function post(body) {
    if (offline()) return { ok: false, error: 'network' };
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // simple request → no CORS preflight
      body: JSON.stringify(body),
      redirect: 'follow',
      credentials: 'omit',
    };
    let res;
    try {
      res = await withTimeout(url, init);
    } catch (err) {
      if (isAbort(err)) return { ok: false, error: 'network' };
      // A TypeError here is either a real network failure or a CORS block on the redirected response.
      // Retry opaquely: if that goes through, the post was delivered but its answer can't be read.
      try {
        await withTimeout(url, { ...init, mode: 'no-cors' });
        return { ok: true, opaque: true };
      } catch {
        return { ok: false, error: 'network' };
      }
    }
    if (res.type === 'opaque' || res.type === 'opaqueredirect') return { ok: true, opaque: true };
    return readJson(res);
  }

  async function get(params) {
    if (offline()) return { ok: false, error: 'network' };
    const u = new URL(url);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    try {
      const res = await withTimeout(u.toString(), { method: 'GET', redirect: 'follow', credentials: 'omit', cache: 'no-store' });
      return readJson(res);
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  return {
    demo: false,
    attend: (payload) => post({ ...payload, action: 'attend' }),
    cancel: (payload) => post({ ...payload, action: 'cancel' }),
    lookup: (email, phone) => get({ action: 'lookup', email: String(email ?? '').trim(), phone: String(phone ?? '').trim() }),
    count: () => get({ action: 'count' }),
  };
}
