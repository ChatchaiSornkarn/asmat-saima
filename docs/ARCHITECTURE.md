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
{ "action": "attend", "lang": "sv", "side": "asmat",   // side REQUIRED: 'asmat' | 'saima' — ?side= link or the guest's choice (issues 15, 16)
  "main": { "first": "Asmat", "last": "Khan", "email": "a@x.se", "phone": "070 123 45 67", "category": "man" },
  "members": [ { "first": "Sara", "last": "Khan", "category": "woman" } ],   // category: man | woman | infant, required
  "message": "No nuts please", "website": "" }          // website = honeypot, must be empty
→ { "ok": true, "partySize": 2, "names": ["Asmat Khan", "Sara Khan"],
    "people": [ { "name": "Asmat Khan", "category": "man" }, { "name": "Sara Khan", "category": "woman" } ], "replaced": false }

// Cancel (partial or full)
{ "action": "cancel", "lang": "en", "email": "...", "phone": "...",
  "cancel": [ { "name": "Sara Khan", "category": "woman" } ],   // people from lookup (a plain "Sara Khan" also works); or
  "all": true,                    // cancel the whole Party
  "message": "", "website": "" }
→ { "ok": true, "cancelled": ["Sara Khan"], "remaining": ["Asmat Khan"], "status": "active" | "cancelled" }
```

GET (query string):
```
?action=count                         → { ok, guests, households }        (aggregates only)
?action=lookup&email=..&phone=..      → { ok, names: [...], people: [{ name, category }] } | { ok:false, error:'not_found' }
                                         (BOTH must match, Q13; people is index-aligned with names, category '' if untagged)
```

Row semantics (RSVPs tab, append-only): an attend writes `type=attend,status=active`; any matching active row (email OR phone)
becomes `superseded` and the new row's `replaces` points at it. A cancel (lookup needs email AND phone) marks the active row
`superseded` and appends `type=cancel` with the remaining members: `status=active` if anyone remains, else `cancelled`
(`party_size=0`), with what was cancelled in `note`. Guests and Summary count **every `status=active` row** regardless of type.

Late replies (2_main_idea Q9, issue 14): columns are read by header name (`RSVP_HEADERS` in `Code.gs`; a missing header is
appended at the end of an existing sheet). The `late` column is `TRUE` on an attend row whose timestamp is after the end of
the reply-by day in Europe/Stockholm (6 Nov 2026 ends at `2026-11-06T23:00:00Z`), else `FALSE`. The script's deadline is
the `RSVP_DEADLINE` Script Property (default in `CONFIG_DEFAULTS`); it must equal `config.rsvpDeadline`, which drives the
page's notice (`src/rsvp/deadline.js` → `isLate`). Late attends are accepted as usual (same response); the owner email
subject starts with `LATE`. Cancels are always accepted; a cancel row copies the `late` value of the row it replaces.

Side from the link (2_main_idea Q1, issue 15): each family sends its own link, `…/asmat-saima/?side=asmat` or
`…/?side=saima` (any case; combines with `?lang=`, e.g. `?side=saima&lang=ur`). `src/rsvp/side.js` → `sideFromUrl()` is
called once in `rsvp/index.js` on load and the value is passed to `createAttend` only; it is never rendered.
`buildAttendPayload` adds `side` only when it is `asmat`/`saima`. The script stores `cleanSide_(body.side)` (`Rsvp.gs`:
trim + lower-case, only a value in `SIDES`) in the `side` column. A cancel never carries a Side: a cancel row copies `side`
from the row it replaces. The owner email shows a Side row ("Asmat’s side", "Saima’s side", or "Not given" for an old row
with an empty cell); the guest email does not.

Side choice on a bare link (2_main_idea Q6, issue 16): when `needsSideChoice(side)` is true (no valid `?side=`),
`attend.js` mounts `src/rsvp/side-choice.js` → `createSideChoice()` inside the Main guest group, above the name fields —
one per Party, never on the Cancel tab, never with a valid `?side=` link. It is a `role="radiogroup"` of two
`role="radio"` buttons ("Asmat's guest" / "Saima's guest", i18n block `sideChoice.*`), starts empty, has one Tab stop
(roving tabindex), and ←/→/↑/↓/Home/End move and select (←/→ mirrored in RTL, `side.js` → `sideKeyStep`); Space/Enter
select. On submit it is validated first (`checkSide` → `sideChoice.required`): the message shows under it, the
"check the highlighted fields" alert shows, focus moves to it, and nothing is sent. The sent side is
`resolveSide(linkSide, chosen)` — the link wins. The choice is kept in the session draft and in "Send another".
A new attend reply that replaces an old one stores the side of the new reply. The script **rejects** an attend body
without a valid side (`validateAttend_` → `{ ok: false, error: 'invalid' }`: nothing written, nothing superseded, no
email); `party_too_large` and the honeypot still win first. Cancels are unaffected. The demo mock applies the same rule.

Category per person (2_main_idea Q2/Q4/Q7, issue 17): every person (Main guest and each member) carries `category`
`man` | `woman` | `infant` (an Infant is a child 0–3 on the wedding day, labelled "Child 0–3"; children 4+ are man or
woman). A post where any person lacks a valid category is `invalid` and writes nothing. The row's `names` cell has one line
per person, Main guest first, tagged in English: `Ali Khan — man`, `Sara Khan — woman`, `Zain Khan — infant`; the
`men` / `women` / `infants` columns hold the counts and `party_size = men + women + infants`. An em dash (U+2014/U+2015)
inside a typed name becomes `-` (site and script), so ` — ` only ever separates the tag. Infants count everywhere like
anyone else: `party_size`, the "You've added N people" line, the `maxPartySize` cap and the public count. The form control is `src/rsvp/category.js` (native radios in a
`fieldset role=radiogroup`, starts empty); the guest email lists "Sara Khan (woman)" in the guest's language, the owner
email adds the men / women / infants counts.

Partial cancel (2_main_idea Q4, issue 18): lookup returns `people` (`{ name, category }`, parsed from the tags) next to
the plain `names`; the cancel list shows names only, but each box is index-aligned with its person, and the post sends
`{ name, category }` (`lookupPeople` / `cancelEntries` in `validate.js`). The server (`findPerson_`, mock `findPerson`)
removes people one at a time, preferring an exact name + category match, else the first person with that name (plain
names from older pages; a tag edited since the lookup). The new row keeps the remaining lines with their tags and recounts
`men` / `women` / `infants` and `party_size` from them, so `party_size = men + women + infants`; cancelling everyone
gives `status=cancelled`, all counts 0. A hand-typed line without a valid tag counts in `party_size` but in no category;
when one remains, the cancel row's `note` (and so the owner email) adds `untagged names — fix counts`.

Honeypot-filled posts get `{ ok: true }` but nothing is written. Phone normalisation (both sides):
strip spaces, dashes, dots, brackets; leading `00` → `+`; leading `0` → `+46`.

### Demo mode
When `config.appsScriptUrl` is `''`, `src/rsvp/api.js` uses an in-browser mock that implements exactly the same contract
(stored in `localStorage` key `asmat-saima-demo`, same matching/supersede rules, the same `side` column, and the same `late` flag from
`config.rsvpDeadline`; rows also keep `people` with categories and `men` / `women` / `infants`) and the RSVP section shows the `rsvp.demo` notice. `?demo=reset` clears it.

## Dev

```
python3 -m http.server 8080   # from asmat-saima/, then open http://localhost:8080/
?lang=th          force a language
?open=1           skip the opening animation (development/screenshots only)
```
