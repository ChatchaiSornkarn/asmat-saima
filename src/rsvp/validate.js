// Validation — pure, DOM-free. Used by the forms (client side) and the demo mock (server side).
// Error values are i18n keys (e.g. 'validation.required') so the UI can translate them.
import { isValidPhone } from './phone.js';
import { cleanSide } from './side.js';

export const LIMITS = { name: 80, email: 254, phone: 32, message: 1000 };

/** Trim and collapse runs of whitespace (incl. no-break spaces) to one space. */
export function cleanName(v) {
  return String(v ?? '').replace(/[\s ​]+/g, ' ').trim();
}

/**
 * A first name / surname: cleanName() plus em dash (U+2014) and horizontal bar (U+2015) → '-'.
 * The Sheet tags each name line as "Sara Khan — woman", so a name never contains " — " (issue 17;
 * the script does the same in Rsvp.gs → cleanPersonName_).
 */
export function cleanPersonName(v) {
  return cleanName(v).replace(/[\u2014\u2015]/g, '-');
}

/** Category of one person (issue 17): Man · Woman · Child 0–3. Stored in English. */
export const CATEGORIES = ['man', 'woman', 'infant'];

/** 'man' / ' Woman ' → the category; anything else → ''. */
export function cleanCategory(v) {
  const c = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return CATEGORIES.includes(c) ? c : '';
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
/** Every person row needs one of the three categories; the choice starts empty. */
export function checkCategory(v) {
  return cleanCategory(v) ? '' : 'validation.category';
}
export function checkMessage(v) {
  return cleanMessage(v).length > LIMITS.message ? 'validation.tooLong' : '';
}

export const fullName = (p) => cleanName(`${cleanPersonName(p.first)} ${cleanPersonName(p.last)}`);

/**
 * Validate a whole attend payload.
 * @returns {{ ok: boolean, errors: Record<string,string>, tooLarge: boolean }}
 *   error paths: 'main.first', 'main.email', 'main.category', 'members.3.last', 'members.3.category', 'message'
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
  put('main.category', checkCategory(main.category));
  members.forEach((m, i) => {
    put(`members.${i}.first`, checkName(m?.first));
    put(`members.${i}.last`, checkName(m?.last));
    put(`members.${i}.category`, checkCategory(m?.category));
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

/**
 * Build the exact attend body from raw form values (cleaned).
 * `side` ('asmat' | 'saima': the link's, else the guest's choice — rsvp/side.js → resolveSide) is included
 * only when valid. The form never sends without one (issue 16); the script and the mock reject a body without it.
 */
export function buildAttendPayload(values, lang, side = '') {
  const s = cleanSide(side);
  return {
    action: 'attend',
    lang,
    ...(s ? { side: s } : {}),
    main: {
      first: cleanPersonName(values.main.first),
      last: cleanPersonName(values.main.last),
      email: cleanEmail(values.main.email),
      phone: String(values.main.phone ?? '').trim(),
      category: cleanCategory(values.main.category),
    },
    members: (values.members || []).map((m) => ({ first: cleanPersonName(m.first), last: cleanPersonName(m.last), category: cleanCategory(m.category) })),
    message: cleanMessage(values.message),
    website: String(values.website ?? ''),
  };
}

/**
 * A lookup answer → the Party as [{ name, category }] for the cancel list (issue 18). Uses `people` when the
 * server sends it (index-aligned with `names`), else the plain names with category ''.
 */
export function lookupPeople(res) {
  const names = Array.isArray(res?.names) ? res.names.map(String) : [];
  if (Array.isArray(res?.people) && res.people.length === names.length) {
    return res.people.map((p, i) => ({ name: typeof p?.name === 'string' ? p.name : names[i], category: cleanCategory(p?.category) }));
  }
  return names.map((name) => ({ name, category: '' }));
}

/**
 * Cancel list labels: for each person, the i18n key of their category label ('form.category.woman' …) when the
 * same name appears more than once in the Party, so two "Sara Khan" can be told apart; '' otherwise (or untagged).
 */
const TAG_KEYS = { man: 'form.category.man', woman: 'form.category.woman', infant: 'form.category.infant' };
export function pickerTagKeys(people) {
  const seen = new Map();
  people.forEach((p) => seen.set(p.name, (seen.get(p.name) || 0) + 1));
  return people.map((p) => (seen.get(p.name) > 1 && Object.hasOwn(TAG_KEYS, p.category) ? TAG_KEYS[p.category] : ''));
}

/** The ticked people → the cancel body's `cancel` list: { name, category } (exact match on the server), or a plain name if untagged. */
export const cancelEntries = (chosen) => chosen.map((p) => (p.category ? { name: p.name, category: p.category } : p.name));
