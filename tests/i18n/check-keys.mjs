#!/usr/bin/env node
// Verifies the four string tables mirror en.js:
//   • identical key trees (plural objects count as one leaf)
//   • identical {placeholder} sets per string (plural forms checked one by one)
//   • plural objects use exactly the locale's Intl.PluralRules categories
//   • no empty / whitespace-only strings
//   • couple's names untouched, DRAFT header present in translations
// Run from the repo root:  node tests/i18n/check-keys.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../src/i18n');
const LOCALES = { en: 'en-GB', sv: 'sv-SE', th: 'th-TH', ur: 'ur-PK' };
const CATS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);

const isPlural = (v) => !!v && typeof v === 'object' && Object.keys(v).length > 0 &&
  Object.keys(v).every((k) => CATS.has(k));

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' || isPlural(v)) out.set(key, v);
    else if (v && typeof v === 'object') flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const tables = {};
for (const code of Object.keys(LOCALES)) {
  const file = path.join(dir, `${code}.js`);
  tables[code] = { mod: (await import(pathToFileURL(file).href)).default, src: await readFile(file, 'utf8') };
}

const ref = flatten(tables.en.mod);

for (const [code, locale] of Object.entries(LOCALES)) {
  const { mod, src } = tables[code];
  const flat = flatten(mod);
  const cats = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;

  if (code !== 'en' && !src.includes('DRAFT — to be proofread by a native speaker before launch (issue 12)')) {
    fail(`${code}: missing DRAFT header comment`);
  }

  for (const key of ref.keys()) if (!flat.has(key)) fail(`${code}: missing key ${key}`);
  for (const key of flat.keys()) if (!ref.has(key)) fail(`${code}: extra key ${key}`);

  for (const [key, val] of flat) {
    const enVal = ref.get(key);
    if (enVal === undefined) continue;

    if (isPlural(enVal) !== isPlural(val)) { fail(`${code}: ${key} plural/string mismatch with en`); continue; }

    if (isPlural(val)) {
      const got = Object.keys(val).sort().join(',');
      const want = [...cats].sort().join(',');
      if (got !== want) fail(`${code}: ${key} plural categories [${got}] ≠ ${locale} [${want}]`);
      const enPh = new Set(Object.values(enVal).map(placeholders));
      for (const [cat, s] of Object.entries(val)) {
        if (typeof s !== 'string' || !s.trim()) { fail(`${code}: ${key}.${cat} is empty`); continue; }
        const ph = placeholders(s);
        if (!enPh.has(ph)) fail(`${code}: ${key}.${cat} placeholders {${ph}} ≠ en {${[...enPh].join(' | ')}}`);
      }
      continue;
    }

    if (typeof val !== 'string') { fail(`${code}: ${key} is not a string`); continue; }
    if (!val.trim()) { fail(`${code}: ${key} is empty`); continue; }
    if (placeholders(val) !== placeholders(enVal)) {
      fail(`${code}: ${key} placeholders {${placeholders(val)}} ≠ en {${placeholders(enVal)}}`);
    }
    if (/\{\s*\}|\{[^}\w]|\{\w+$/.test(val)) fail(`${code}: ${key} has a malformed placeholder: ${val}`);
    if (code !== 'en' && val === enVal && !/^[A-Z][\w &/·.]*$/.test(val)) {
      warnings.push(`${code}: ${key} identical to English ("${val}")`);
    }
  }

  if (mod.footer?.names !== 'Asmat & Saima') fail(`${code}: footer.names must stay "Asmat & Saima"`);
  for (const [key, val] of flat) {
    const strings = typeof val === 'string' ? [val] : Object.values(val || {});
    for (const s of strings) {
      // Each name the English string uses must survive in Latin script (sideChoice.asmat has only one).
      const refText = ref.get(key) ? JSON.stringify(ref.get(key)) : '';
      if (['Asmat', 'Saima'].some((n) => refText.includes(n) && !s.includes(n))) {
        fail(`${code}: ${key} lost the couple's names (Latin script required)`);
      }
    }
  }
  if (code === 'ur') {
    for (const [key, val] of flat) {
      const strings = typeof val === 'string' ? [val] : Object.values(val);
      for (const s of strings) if (/[؀-ۿ][.?](\s|$)/.test(s)) fail(`ur: ${key} uses Latin punctuation after Urdu text — use ۔ or ؟`);
    }
  }
}

for (const w of warnings) console.log(`  note  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  FAIL  ${e}`);
  console.error(`\n${errors.length} problem(s) in the string tables.`);
  process.exit(1);
}
console.log(`OK — ${ref.size} keys × ${Object.keys(LOCALES).length} languages: trees, placeholders, plurals and names all match.`);
