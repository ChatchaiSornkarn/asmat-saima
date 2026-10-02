// Lists i18n keys used in src/ and index.html (t('…'), data-i18n, data-i18n-attr) that
// are missing from en.js, and en.js keys that nothing appears to use.
//   node tests/i18n/find-unknown-keys.mjs
// Dynamic keys (t(`errors.${code}`)) cannot be resolved statically and are listed separately.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const en = (await import(join(root, 'src/i18n/en.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'))).default;

const keys = new Set();
(function walk(o, p) {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (typeof v === 'string' || ['one', 'other'].some((c) => c in v)) keys.add(key);
    else walk(v, key);
  }
})(en, '');

const files = [join(root, 'index.html')];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'i18n') walk(p); }
    else if (/\.(js|html)$/.test(f)) files.push(p);
  }
})(join(root, 'src'));

const used = new Map();
const dynamic = [];
const add = (k, f) => { if (!used.has(k)) used.set(k, new Set()); used.get(k).add(relative(root, f)); };
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*(['"])([\w.]+)\1/g)) add(m[2], f);
  for (const m of src.matchAll(/\bt\(\s*`([^`]*)`/g)) dynamic.push(`${relative(root, f)}: t(\`${m[1]}\`)`);
  for (const m of src.matchAll(/data-i18n=(?:\\?["'])([\w.]+)/g)) add(m[1], f);
  for (const m of src.matchAll(/data-i18n-attr=(?:\\?["'])([^"'\\]+)/g)) {
    for (const pair of m[1].split(';')) { const k = pair.split(':')[1]; if (k && /^[\w.]+$/.test(k.trim())) add(k.trim(), f); }
  }
  // Modules pass keys through their own helpers (el('h2', 'rsvp.heading'), field({ label: 'form.email' })…),
  // so also take every quoted literal that starts with a known namespace.
  const ns = Object.keys(en).join('|');
  for (const m of src.matchAll(new RegExp(`(['"\`])((?:${ns})\\.[A-Za-z][\\w.]*)\\1`, 'g'))) add(m[2], f);
  for (const m of src.matchAll(new RegExp(`\`((?:${ns})\\.[\\w.]*\\$\\{[^\`]*)\``, 'g'))) dynamic.push(`${relative(root, f)}: \`${m[1]}\``);
  // setAttribute('data-i18n', 'key') / dataset.i18n = 'key' / i18n: 'key' helper objects
  for (const m of src.matchAll(/(?:dataset\.i18n|['"]data-i18n['"]\s*,)\s*=?\s*(['"])([\w.]+)\1/g)) add(m[2], f);
  for (const m of src.matchAll(/['"]data-i18n-attr['"]\s*,\s*(['"`])([^'"`]+)\1/g)) {
    for (const pair of m[2].split(';')) { const k = pair.split(':')[1]; if (k && /^[\w.]+$/.test(k.trim())) add(k.trim(), f); }
  }
}

const unknown = [...used].filter(([k]) => !keys.has(k) && k.includes('.'));
const unused = [...keys].filter((k) => !used.has(k));
console.log(`Unknown keys (used but not in en.js): ${unknown.length}`);
for (const [k, fs] of unknown) console.log(`  ${k}   ← ${[...fs].join(', ')}`);
console.log(`\nDynamic keys (check by hand): ${dynamic.length}`);
for (const d of dynamic) console.log(`  ${d}`);
console.log(`\nen.js keys with no static use: ${unused.length}`);
for (const k of unused) console.log(`  ${k}`);
