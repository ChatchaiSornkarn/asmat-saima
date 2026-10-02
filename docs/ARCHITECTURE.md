# Architecture & module contracts

Static site, no build step. `index.html` at the root loads `src/main.js` as an ES module.
Design source: `../docs/wedding-invite-design.md` (Q-numbers below refer to it).

## File ownership

| Area | Files |
|---|---|
| Shell & wiring | `index.html`, `config.js`, `src/main.js`, `src/styles/tokens.css` |
| i18n + switcher | `src/i18n/index.js`, `src/i18n/{en,sv,th,ur}.js`, `src/switcher.js`, `src/styles/switcher.css` |
| Postcard + art | `src/postcard.js`, `src/styles/postcard.css`, `assets/art/*`, `assets/favicon.svg`, `assets/apple-touch-icon.png`, `assets/og-image.jpg` |
| Opening animation | `src/opening.js`, `src/styles/opening.css` |
| Layout, map, calendar, footer | `src/layout.js`, `src/calendar.js`, `src/styles/base.css`, `src/styles/sections.css` |
| RSVP UI | `src/rsvp/*.js`, `src/styles/rsvp.css` |
| Backend | `apps-script/*` |

## Page structure (`index.html`)

```
html[lang][dir]  (.js, later .is-open)
├─ a.skip-link
├─ nav#lang-switcher            → mountSwitcher(el, config)          fixed, top inline-end, z: --z-switcher
├─ div#opening                  → mountOpening(el, config): Promise  full-screen overlay, z: --z-opening
├─ main#site  (inert until opened)
│  ├─ .site__layout              (1 column; ≥1000px: card | panel side by side)
│  │  ├─ .site__card
│  │  │  ├─ section#postcard     → mountPostcard(el, config)
│  │  │  └─ div#rsvp-cue          ← layout.js
│  │  └─ .site__panel
│  │     ├─ section#actions       ← layout.js  (Directions, Add to calendar)
│  │     └─ section#rsvp          → mountRsvp(el, config)
│  └─ footer#footer               ← layout.js
```

`main.js` mounts everything, calls `applyTranslations(document)`, then awaits `mountOpening`.
When the guest opens the invitation it adds `html.is-open` and dispatches `document` event **`invite:opened`**.
Modules may listen for it to start entrance animations (postcard flowers, lanterns sway, etc.).

## Shared helpers (already written — import, don't copy)

- `src/art/arch.js` — `archPath(w, h, {open, x, y})`, `archHalfPath(w, h)`, `ARCH_TOP_RATIO`. The Postcard's Mughal arch traced
  from the PNG. **Both the postcard frame and the opening doors must use it** so they match exactly.
- `src/maps.js` — `mapsUrl(config)` (Apple Maps on iOS, Google Maps elsewhere), `isApplePlatform()`.
- Scroll reveal: any element with class **`reveal`** gets class **`is-visible`** when it scrolls into view
  (IntersectionObserver in `src/layout.js`, started on `invite:opened`). Style the hidden/visible states in your own CSS,
  scoped as `html.js .your-thing.reveal:not(.is-visible)`, and always show content under `prefers-reduced-motion`.
- Buttons: `base.css` defines `.btn`, `.btn--primary` (gold), `.btn--ghost` (outlined), `.btn--link`, `.btn[disabled]`,
  `.btn.is-busy` (spinner). Use these; add only feature-specific modifiers in your own CSS.

## i18n API (`src/i18n/index.js`)

```js
initI18n(config): Promise<void>     // detect (?lang → navigator.languages → en), load fonts, set html lang/dir
t(key, vars?): string               // 'form.counter', { count: 3 } — plural objects resolved via Intl.PluralRules(locale)
getLang(): 'en'|'sv'|'th'|'ur'
getLocale(): string                 // BCP-47 for Intl: en-GB, sv-SE, th-TH, ur-PK
setLang(code): Promise<void>        // updates html lang/dir, ?lang in URL (replaceState), re-applies, notifies
onLangChange(cb): () => void        // cb(lang); returns unsubscribe. Also fires document event 'langchange' {detail:{lang}}
applyTranslations(root=document)    // [data-i18n="key"] → textContent
                                    // [data-i18n-attr="placeholder:form.email;aria-label:x.y"] → attributes
                                    // [data-i18n-vars='{"n":2}'] → interpolation vars (JSON)
formatDate(iso, opts?): string      // Intl.DateTimeFormat(getLocale(), opts) — iso 'YYYY-MM-DD' treated as a calendar date
formatNumber(n): string
```

Rules for every module:
- **No user-visible text hard-coded** in HTML/JS. Static nodes use `data-i18n`; dynamic text calls `t()` and re-renders in `onLangChange`.
- The couple's names "Asmat", "Saima", "&" are not translated (Latin script calligraphy in all languages).
- Layout uses **CSS logical properties** (`margin-inline-start`, `inset-inline-end`, `text-align: start`) so Urdu RTL mirrors.
- Missing keys: `t()` falls back to English, then returns the key; warns once in the console.

## Backend API (Google Apps Script web app, `config.appsScriptUrl`)

All responses are JSON `{ ok: true, ... }` or `{ ok: false, error: <code> }`.
Error codes: `invalid`, `party_too_large`, `not_found`, `server`.

POST: body is a JSON string sent with `Content-Type: text/plain;charset=utf-8` (avoids CORS preflight); `fetch` follows the
Apps Script 302 redirect and reads the JSON. If reading fails with a CORS/opaque error, `api.js` falls back to `mode: 'no-cors'`
and treats the send as success (`{ ok: true, opaque: true }`).

```jsonc
// Attend
{ "action": "attend", "lang": "sv",
  "main": { "first": "Asmat", "last": "Khan", "email": "a@x.se", "phone": "070 123 45 67" },
  "members": [ { "first": "Sara", "last": "Khan" } ],
  "message": "No nuts please", "website": "" }          // website = honeypot, must be empty
→ { "ok": true, "partySize": 2, "names": ["Asmat Khan", "Sara Khan"], "replaced": false }

// Cancel (partial or full)
{ "action": "cancel", "lang": "en", "email": "...", "phone": "...",
  "cancel": ["Sara Khan"],        // exact names from lookup; or
  "all": true,                    // cancel the whole Party
  "message": "", "website": "" }
→ { "ok": true, "cancelled": ["Sara Khan"], "remaining": ["Asmat Khan"], "status": "active" | "cancelled" }
```

GET (query string):
```
?action=count                         → { ok, guests, households }        (aggregates only)
?action=lookup&email=..&phone=..      → { ok, names: [...] } | { ok:false, error:'not_found' }  (BOTH must match, Q13)
```

Row semantics (RSVPs tab, append-only): an attend writes `type=attend,status=active`; any matching active row (email OR phone)
becomes `superseded` and the new row's `replaces` points at it. A cancel (lookup needs email AND phone) marks the active row
`superseded` and appends `type=cancel` with the remaining members: `status=active` if anyone remains, else `cancelled`
(`party_size=0`), with what was cancelled in `note`. Guests and Summary count **every `status=active` row** regardless of type.

Honeypot-filled posts get `{ ok: true }` but nothing is written. Phone normalisation (both sides):
strip spaces, dashes, dots, brackets; leading `00` → `+`; leading `0` → `+46`.

### Demo mode
When `config.appsScriptUrl` is `''`, `src/rsvp/api.js` uses an in-browser mock that implements exactly the same contract
(stored in `localStorage` key `asmat-saima-demo`, same matching/supersede rules) and the RSVP section shows the
`rsvp.demo` notice. `?demo=reset` clears it.

## Dev

```
python3 -m http.server 8080   # from asmat-saima/, then open http://localhost:8080/
?lang=th          force a language
?open=1           skip the opening animation (development/screenshots only)
```
