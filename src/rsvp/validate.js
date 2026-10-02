// Validation — pure, DOM-free. Used by the forms (client side) and the demo mock (server side).
// Error values are i18n keys (e.g. 'validation.required') so the UI can translate them.
import { isValidPhone } from './phone.js';

export const LIMITS = { name: 80, email: 254, phone: 32, message: 1000 };

/** Trim and collapse runs of whitespace (incl. no-break spaces) to one space. */
export function cleanName(v) {
  return String(v ?? '').replace(/[\s ​]+/g, ' ').trim();
}

/** Trim, drop inner spaces (a common phone-keyboard slip), keep case as typed. */
export function cleanEmail(v) {
  return String(v ?? '').replace(/\s+/g, '');
}

export function cleanMessage(v) {
  return String(v ?? '').replace(/\r\n?/g, '\n').trim();
}

// Practical, permissive: something@domain.tld, no spaces, no consecutive/edge dots in the domain.
const EMAIL_RE = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/;
export function isValidEmail(v) {
  const s = cleanEmail(v);
  return s.length <= LIMITS.email && EMAIL_RE.test(s);
}

/** Returns an i18n error key, or '' when valid. */
export function checkName(v) {
  const s = cleanName(v);
  if (!s) return 'validation.required';
  if (s.length > LIMITS.name) return 'validation.tooLong';
  return '';
}
export function checkEmail(v) {
  const s = cleanEmail(v);
  if (!s) return 'validation.required';
  if (s.length > LIMITS.email) return 'validation.tooLong';
  return isValidEmail(s) ? '' : 'validation.email';
}
export function checkPhone(v) {
  const s = String(v ?? '').trim();
  if (!s) return 'validation.required';
  if (s.length > LIMITS.phone) return 'validation.tooLong';
  return isValidPhone(s) ? '' : 'validation.phone';
}
export function checkMessage(v) {
  return cleanMessage(v).length > LIMITS.message ? 'validation.tooLong' : '';
}

export const fullName = (p) => cleanName(`${cleanName(p.first)} ${cleanName(p.last)}`);

/**
 * Validate a whole attend payload.
 * @returns {{ ok: boolean, errors: Record<string,string>, tooLarge: boolean }}
 *   error paths: 'main.first', 'main.email', 'members.3.last', 'message'
 */
export function validateAttend(payload, maxPartySize = 20) {
  const errors = {};
  const main = payload?.main || {};
  const members = Array.isArray(payload?.members) ? payload.members : [];
  const put = (k, e) => { if (e) errors[k] = e; };
  put('main.first', checkName(main.first));
  put('main.last', checkName(main.last));
  put('main.email', checkEmail(main.email));
  put('main.phone', checkPhone(main.phone));
  members.forEach((m, i) => {
    put(`members.${i}.first`, checkName(m?.first));
    put(`members.${i}.last`, checkName(m?.last));
  });
  put('message', checkMessage(payload?.message));
  const tooLarge = 1 + members.length > maxPartySize;
  return { ok: !Object.keys(errors).length && !tooLarge, errors, tooLarge };
}

export function validateLookup({ email, phone } = {}) {
  const errors = {};
  const e = checkEmail(email); if (e) errors.email = e;
  const p = checkPhone(phone); if (p) errors.phone = p;
  return { ok: !Object.keys(errors).length, errors };
}

/** Build the exact attend body from raw form values (cleaned). */
export function buildAttendPayload(values, lang) {
  return {
    action: 'attend',
    lang,
    main: {
      first: cleanName(values.main.first),
      last: cleanName(values.main.last),
      email: cleanEmail(values.main.email),
      phone: String(values.main.phone ?? '').trim(),
    },
    members: (values.members || []).map((m) => ({ first: cleanName(m.first), last: cleanName(m.last) })),
    message: cleanMessage(values.message),
    website: String(values.website ?? ''),
  };
}
