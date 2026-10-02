// Phone helpers — pure, DOM-free. Shared by the form validation and the demo mock.
// The Apps Script backend applies the very same normalisation (ARCHITECTURE.md).

/**
 * Normalise a phone number for matching:
 * strip spaces, dashes, dots and brackets; leading `00` → `+`; leading `0` → `+46`.
 *   '070-123 45 67'     → '+46701234567'
 *   '0046 70 123 45 67' → '+46701234567'
 *   '+46 (0)70 123 4567'→ '+46701234567'   (the Swedish "(0)" trunk prefix is dropped)
 */
export function normalisePhone(raw) {
  let p = String(raw ?? '').trim();
  // "+46 (0)70…" — a bracketed trunk zero after a country code is a common way to write numbers.
  p = p.replace(/^(\+\d{1,3})\s*\(0\)/, '$1');
  p = p.replace(/[\s\-.() ‐-―−]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  else if (p.startsWith('0')) p = '+46' + p.slice(1);
  return p;
}

/**
 * True when the number is plausible: written starting with `0` (Swedish) or `+` (international),
 * only digits and separators, and 8–15 digits once normalised (E.164 allows at most 15).
 */
export function isValidPhone(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  if (!/^[+0]/.test(s)) return false;
  if (!/^\+?[\d\s\-.() ‐-―−]+$/.test(s)) return false;
  const n = normalisePhone(s);
  return /^\+[1-9]\d{7,14}$/.test(n);
}
