# Asmat & Saima — Nikah invitation

The wedding invitation website for the **Nikah of Asmat & Saima**, Sunday 6 December 2026, Säve Flygplatsväg 26, Göteborg.

Guests open a sealed envelope, the arched doors swing open, and they see the invitation postcard. Below it are
directions, "Add to calendar", a public guest count, and an RSVP form where one person can register their whole family
(or cancel some or all of them later). Replies go to a Google Sheet you own, and both you and the guest get an email.
The site is available in English, Swedish, Thai and Urdu (Urdu is right-to-left).

**Live URL:** <https://chatchaisornkarn.github.io/asmat-saima/>

It is a plain static site (HTML, CSS and vanilla JS ES modules) with no build step and no `npm install`.

---

## Quick start (on your own computer)

```bash
cd asmat-saima
python3 -m http.server 8080
```

Then open <http://localhost:8080/>. Handy URL parameters:

| Parameter | What it does |
|---|---|
| `?lang=en` / `sv` / `th` / `ur` | Forces a language. Without it the browser language is used, falling back to English. Use these links when sending the invitation to a group. |
| `?open=1` | Skips the opening animation. Meant for development and screenshots only. |
| `?demo=reset` | Clears the demo RSVPs stored in this browser (see below). |

You can combine them, e.g. `http://localhost:8080/?lang=ur&open=1`.

## Demo mode

While `appsScriptUrl` in `config.js` is empty (`''`), the site runs in **demo mode**:

- RSVPs, cancels and the guest count work exactly like the real thing, but they are stored **only in this browser**
  (`localStorage`). Nothing reaches a Sheet and no emails are sent.
- The RSVP section shows a small notice saying it is a demo.
- `?demo=reset` wipes the demo data.

So it is safe to share the site for feedback before the backend is set up.

## Go-live checklist

1. **Deploy the backend.** Follow [`apps-script/README.md`](apps-script/README.md): create the Sheet, paste the
   `.gs` files, run `setup`, and deploy as a web app ("Execute as: Me", "Who has access: Anyone").
2. **Connect the site.** Paste the web-app URL (ends in `/exec`) into `appsScriptUrl` in `config.js`.
3. **Fill in what you know.** Set `rsvpDeadline`, `eventStart` (and `eventEnd`) and `contactEmail` in `config.js`
   once decided. Each one can stay empty; the related line is then hidden, or the calendar entry is all-day.
   Also set the matching Script Properties (`EVENT_TIME`, `MAX_PARTY` etc.) described in the backend README.
4. **Push and enable GitHub Pages.** Commit and push to `main`
   (`git@github.com:ChatchaiSornkarn/asmat-saima.git`). On GitHub go to **Settings → Pages**, set *Source* to
   **Deploy from a branch**, branch **main**, folder **/ (root)**. The site appears at the live URL in about a minute.
5. **Test end to end**, proofread the translations, and clear the test rows from the Sheet
   (see `../requirements/issues/12_launch.md`).

After launch you can change any setting by editing `config.js` on github.com (pencil icon → Commit).
Pages redeploys in about a minute.

## Settings (`config.js`)

| Setting | Default | Meaning |
|---|---|---|
| `appsScriptUrl` | `''` | Apps Script web-app URL (ends in `/exec`). Empty = demo mode. |
| `rsvpDeadline` | `null` | ISO date `'YYYY-MM-DD'` for "Please reply by …". `null` hides the line. The form stays open after the date either way. |
| `guestCountThreshold` | `10` | The public "N guests from M families" line appears once N reaches this number. |
| `maxPartySize` | `20` | Largest party one RSVP may register, main guest included. Keep it in sync with `MAX_PARTY` in the Apps Script settings. |
| `eventDate` | `'2026-12-06'` | Date of the event (used by the calendar entry). |
| `eventStart` | `null` | Start time `'HH:MM'` in local Göteborg time. `null` = all-day calendar entry. |
| `eventEnd` | `null` | End time `'HH:MM'`. Defaults to start + 4 hours. |
| `timeZone` | `'Europe/Stockholm'` | Time zone of the event times. |
| `venue.line1`, `venue.line2` | `'Säve Flygplatsväg 26'`, `'Göteborg'` | Address shown on the site. |
| `venue.mapQuery` | `'Säve Flygplatsväg 26, 423 73 Säve, Sweden'` | Search text for the Directions link (Apple Maps on iPhone/iPad/Mac, Google Maps elsewhere). |
| `contactEmail` | `''` | Shown as "Larger family? Contact us" when a party reaches the cap. Empty = hidden. |
| `languages` | `['en', 'sv', 'th', 'ur']` | Languages offered in the switcher. |
| `defaultLanguage` | `'en'` | Fallback when the browser language isn't supported. |

## Project structure

```
asmat-saima/
├─ index.html            page shell (loads src/main.js as an ES module)
├─ config.js             all settings you may change after launch
├─ src/
│  ├─ main.js            wires everything together
│  ├─ i18n/              strings per language (en, sv, th, ur) + language detection/switching
│  ├─ switcher.js        EN / SV / TH / اردو switcher
│  ├─ opening.js         envelope → doors opening animation (art in src/art/)
│  ├─ postcard.js        the invitation card (SVG line art + cropped image layers)
│  ├─ layout.js          RSVP cue, Directions, Add to calendar, footer, scroll reveal
│  ├─ calendar.js        .ics file and Google Calendar link
│  ├─ maps.js            map link
│  ├─ rsvp/              RSVP forms, validation, API client, demo mock
│  └─ styles/            CSS
├─ assets/               images (art layers, favicon, share image)
├─ apps-script/          Google Apps Script backend + setup guide
├─ tests/                automated and browser checks (see below)
├─ tools/crop-art.py     regenerates the art crops from the reference PNG
└─ docs/ARCHITECTURE.md  module contracts, backend API, row meanings
```

## Running the tests

Run everything from the `asmat-saima/` folder. The Node tests need Node 22+ (the calendar test needs Node 18+).

```bash
# Backend (Apps Script code run against mocked Google services). Keep the quotes.
node --test 'tests/apps-script/*.test.mjs'

# RSVP logic, API client and demo mock
node --test tests/rsvp/

# Calendar (.ics / Google Calendar link)
node --test tests/layout/calendar.test.mjs

# Translations: all four string tables have the same keys, placeholders and plurals
node tests/i18n/check-keys.mjs
# Keys used in the code but missing from en.js (and unused keys)
node tests/i18n/find-unknown-keys.mjs

# Render every email variant to HTML/text for proofreading
node tests/apps-script/render-emails.mjs /tmp/emails
```

The browser checks use Python Playwright with Chromium. Start a server on port 8090 first:

```bash
python3 -m http.server 8090 --bind 127.0.0.1 &

python3 tests/i18n/check-browser.py        # detection, ?lang, switcher, RTL, fonts, date/number formats
python3 tests/layout/interaction.py        # no horizontal scroll, calendar menu, RSVP cue, reduced motion
python3 tests/postcard/overflow.py         # postcard text stays inside the arch, every size and language
python3 tests/opening/functional.py        # opening: keyboard, Skip, language switch, reduced motion, frame times (prints a report)
python3 tests/opening/capture.py --out /tmp/op --name phone --w 390 --h 844 --mobile   # contact sheet of the animation
python3 tests/opening/freeze.py  --out /tmp/op --name desk --w 1440 --h 900 --times 0,300,600   # stills at set times
python3 tests/postcard/render-assets.py    # regenerates assets/og-image.jpg and apple-touch-icon.png
```

## Replacing the art

The roses, lanterns and couple are cropped from the reference postcard PNG for now. To swap in clean transparent
layers, save them under the **same file names** in `assets/art/`. No code change is needed. File names, sizes and
placement are listed in [`assets/art/README.md`](assets/art/README.md). To recreate the crops, run
`python3 tools/crop-art.py`.

## Translations are drafts

The Swedish, Thai and Urdu texts on the site (`src/i18n/*.js`) and in the emails (`apps-script/Strings.gs`) are
**DRAFT** translations. A native speaker should proofread them before the link goes to guests, checking for a respectful
Nikah tone. In the Sheet, **Wedding RSVP → Email me sample confirmations** sends you every email to check.
Run `node tests/i18n/check-keys.mjs` after editing a strings file.

## More detail

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the modules fit together, the backend API, and row meanings.
- [`apps-script/README.md`](apps-script/README.md): backend setup, settings, quotas, and troubleshooting.
- `../docs/wedding-invite-design.md` and `../requirements/issues/`: the design and the feature issues.
