# RSVP backend — setup guide

The invitation site is static (GitHub Pages). RSVPs go to a small **Google Apps Script** program attached to a
**Google Sheet** you own. It writes every reply into the Sheet and sends two emails: a confirmation to the guest
(in their language) and a summary to you. Free, no servers, about 20 minutes to set up once.

Until you finish step 5, the site runs in **demo mode**: replies are kept only in the visitor's own browser.

---

## 1. Create the Sheet

1. Go to <https://sheets.new> (signed in with the Google account that should own the RSVPs).
2. Name it, e.g. **Asmat & Saima — RSVPs**.

## 2. Add the script

1. In the Sheet: **Extensions → Apps Script**. A code editor opens in a new tab.
2. Name the project at the top left, e.g. **Wedding RSVP**.
3. Create one script file per `.gs` file in this folder, with the same name:
   `Code`, `Rsvp`, `Setup`, `Emails`, `Strings` (click **+** next to *Files* → *Script*; the editor adds `.gs`).
   Paste each file's full contents, replacing anything already there (delete the sample `myFunction`).
4. Show the manifest: **Project Settings** (gear icon) → tick **Show "appsscript.json" manifest file in editor**.
   Back in the editor, open `appsscript.json` and replace its contents with `appsscript.json` from this folder.
5. Press **Save** (disk icon or Ctrl/Cmd + S).

## 3. Run `setup` once

1. In the toolbar's function menu choose **setup**, then click **Run**.
2. Google asks for permission: **Review permissions** → choose your account → *Google hasn't verified this app* →
   **Advanced** → **Go to Wedding RSVP (unsafe)** → **Allow**. (It's "unverified" only because you wrote it yourself.)
   The script asks for: this spreadsheet only, sending email as you, showing a menu in the Sheet, and your email address.
3. When it finishes, the Sheet has three tabs:
   - **RSVPs** — one row per reply (never delete rows here; see "Row meanings" below).
   - **Guests** — automatic list, one line per person who is coming: Name, Category (`man` / `woman` / `infant`),
     Side, and the Party's email, phone and reply time. Formula only; don't type in it.
   - **Summary** — totals (guests, households, the **venue booking table**, cancellations, by language, last reply)
     and a **Check** row. Formulas only. See "Reading the Summary" below.
4. Reload the Sheet: a **Wedding RSVP** menu appears (setup/repair, sample emails, settings, clear test rows).

`setup` is safe to run again at any time — it repairs formatting and never touches RSVP rows or settings you changed.

## 4. Deploy as a web app

1. **Deploy → New deployment**. Click the gear next to *Select type* → **Web app**.
2. Description: `RSVP v1`. **Execute as: Me**. **Who has access: Anyone**.
   ("Anyone" is required so guests without Google accounts can reply. They can only do what the script allows.)
3. **Deploy** → copy the **Web app URL** (ends in `/exec`).

## 5. Connect the site

In the repository, edit `config.js` on github.com (pencil icon) and paste the URL:

```js
appsScriptUrl: 'https://script.google.com/macros/s/AKfy…/exec',
```

Commit. GitHub Pages updates in about a minute; the demo notice disappears from the RSVP section.

## 6. Test it (then clear the test rows)

Open the URL in a browser — you should see `{"ok":true,"status":"ready"}`. Or in a terminal:

```bash
URL='https://script.google.com/macros/s/…/exec'

curl -sL "$URL?action=count"
# {"ok":true,"guests":0,"households":0}

curl -sL -H 'Content-Type: text/plain;charset=utf-8' "$URL" --data '{"action":"attend","lang":"en","side":"asmat",
  "main":{"first":"Test","last":"Guest","email":"YOUR@EMAIL","phone":"070 123 45 67","category":"woman"},
  "members":[{"first":"Plus","last":"One","category":"infant"}],"message":"test","website":""}'
# {"ok":true,"partySize":2,"names":["Test Guest","Plus One"],"people":[{"name":"Test Guest","category":"woman"},{"name":"Plus One","category":"infant"}],"replaced":false}

curl -sL "$URL?action=lookup&email=YOUR@EMAIL&phone=0701234567"
# {"ok":true,"names":["Test Guest","Plus One"],"people":[{"name":"Test Guest","category":"woman"},{"name":"Plus One","category":"infant"}]}

curl -sL -H 'Content-Type: text/plain;charset=utf-8' "$URL" --data '{"action":"cancel","lang":"en",
  "email":"YOUR@EMAIL","phone":"+46701234567","cancel":[{"name":"Plus One","category":"infant"}],"message":"","website":""}'
# {"ok":true,"cancelled":["Plus One"],"remaining":["Test Guest"],"status":"active"}
```

(`-L` is needed: Google answers with a redirect to the JSON.) Also try the real form on the site in each language.

To proofread every email: **Wedding RSVP → Email me sample confirmations** (sends 13 emails to you; nothing is written).

**Before sending the invitation:** **Wedding RSVP → Clear ALL RSVPs (before launch only)…** removes all test rows
(header kept). If you only want to remove some, delete those rows by hand *before launch*; after launch never delete
rows — row numbers are referenced in the `replaces` column.

## Updating the script later — keep the same URL

After pasting new code that adds a setting or a column (e.g. `RSVP_DEADLINE` and `late`, `side`, or `men` / `women` / `infants`), run **setup** once more:
it adds the missing Script Property and header without touching rows or values you changed.

Editing code does **not** change what guests use until you publish a new version, and creating a *new deployment*
gives a *new URL* (which would break the site). Always:

1. Save your code changes.
2. **Deploy → Manage deployments** → select the existing web app → **Edit** (pencil).
3. *Version*: **New version** → **Deploy**. The `/exec` URL stays the same.

## Settings (Script Properties)

Apps Script editor → **Project Settings** → **Script Properties** → *Edit script properties*. `setup` fills in defaults.
Changes take effect immediately (no redeploy needed).

| Property | Default | Meaning |
|---|---|---|
| `OWNER_EMAIL` | your account | Who gets the RSVP notifications. Several: comma-separated. Also the Reply-To on guest emails. |
| `MAX_PARTY` | `20` | Largest party per RSVP, main guest included. Keep in sync with `maxPartySize` in `config.js`. |
| `SITE_URL` | `https://chatchaisornkarn.github.io/asmat-saima/` | Link in the emails (`?lang=xx` is added, plus `&side=asmat|saima` from the Party's row so a guest who replies again keeps their side). |
| `EVENT_DATE` | `2026-12-13` | Date shown in the emails (written out per language). `setup()` never overwrites a property, so if an earlier `setup()` stored the old date, change it to `2026-12-13` in Script Properties. |
| `RSVP_DEADLINE` | `2026-11-06` | Reply-by date, `YYYY-MM-DD`. A "We're coming" reply after the **end of that day (Göteborg time)** is still saved, but gets `late = TRUE` and your notification subject starts with **LATE**. **Must equal `rsvpDeadline` in `config.js`** — the site's late notice uses that copy. A sheet set up before this setting existed: run `setup` again (it adds `RSVP_DEADLINE` and the `late` column) and check the value with *Show settings*. |
| `EVENT_TIME` | *(empty)* | `HH:MM`, e.g. `14:00`. Shown in emails once set. |
| `VENUE_LINE1` / `VENUE_LINE2` | `Grand Plaza Bröllop & Konferens` / `Göteborg` | Venue name and city in the emails (the street address is only in `MAP_QUERY`). |
| `MAP_QUERY` | `Säve Flygplatsväg 26, 423 73 Säve, Sweden` | Google Maps search for the map link. |
| `SENDER_NAME` | `Asmat & Saima` | Sender name on the emails. |
| `SEND_GUEST_EMAILS` | `true` | `false` = no guest confirmations (rows still written). |
| `SEND_OWNER_EMAILS` | `true` | `false` = no notification to you per RSVP. |

**Wedding RSVP → Show settings** shows the values in effect and how many emails you have left today.

## How replies are recorded (row meanings)

The RSVPs tab is append-only: `timestamp, type, email, phone, side, party_size, men, women, infants, names, message, language, status, replaces, late, note`.
(The script finds columns by header name. On a sheet made before `side`, `men` / `women` / `infants` or `late` existed, the missing
columns are added at the end. The design starts the Sheet fresh for these columns: clear the test rows and run `setup` again.)

- **Categories** (issue 17): every person is a man, a woman, or an Infant (child 0–3 on the wedding day — free at the
  venue; children 4 and up are man or woman). `names` has one line per person, Main guest first, tagged in English
  whatever the guest's language: `Ali Khan — man`, `Sara Khan — woman`, `Zain Khan — infant`. `men`, `women` and
  `infants` hold the counts, and `party_size = men + women + infants`. Infants count in `party_size` and the public total.

- **New reply** (`type=attend`) → `status=active`.
- **Same person replies again** (same email **or** same phone, any formatting: `070-123 45 67` = `+46701234567`) →
  the older row becomes `superseded`, the new row is `active`, and `replaces` lists the old row number(s).
  The `note` says if only the email or only the phone matched — worth a look in case two families share a phone.
- **Cancel** (needs email **and** phone) → the old row becomes `superseded`, and a `type=cancel` row lists who is
  still coming (`active`), or nobody (`status=cancelled`, `party_size=0`). `note` says who was cancelled. The remaining
  `names` lines keep their tags and `men` / `women` / `infants` / `party_size` are recounted from them. If a remaining
  line has no tag (typed by hand), `note` adds **untagged names — fix counts**: add the tag (` — man` etc.) and fix the
  numbers by hand.
- **Guests** and **Summary** count every `active` row. The site's public line ("N guests from M families") uses the
  same numbers (aggregates only — no names are ever public).
- **Late reply** (`late = TRUE`): an attend that arrived after `RSVP_DEADLINE` (end of that day, Göteborg time). It counts
  like any other active row; your notification subject starts with **LATE**, and the guest's confirmation and the site
  say you will confirm whether you can still fit them in. Cancels are always accepted; a cancel row keeps the `late`
  value of the row it replaces. Rows from before this column existed are left empty.
- **Side** (`side` = `asmat` / `saima`): which family's link the guest opened —
  `https://chatchaisornkarn.github.io/asmat-saima/?side=asmat` (Asmat's family) or `…/?side=saima` (Saima's family),
  any letter case, also with `&lang=…`. The guest never sees it; your notification shows it. On a link without
  `?side=` the form asks "Asmat's guest" / "Saima's guest", so every new attend row has a side: the script rejects an
  attend reply without one (nothing is written, no email). A cancel row keeps the `side` of the row it replaces; a new
  "We're coming" reply takes the side of its own link or choice. Someone got the other family's link? Just edit the `side` cell. Rows from before this
  column existed are left empty.
- `⚠` in `note` = an email couldn't be sent (e.g. daily quota). The RSVP itself is always saved.

You may fix a typo in a name by hand (one person per line in `names`; keep the ` — man|woman|infant` tag, and update
`party_size` and `men` / `women` / `infants` if you add, remove or re-tag a line).
The Summary's **Check** row shows ⚠ if you forget (see below).

## Reading the Summary (venue booking)

Everything counts **active** rows only (superseded and cancelled rows are history). A partial cancel's `cancel` row
is active and counts the people still coming.

**Venue booking (active rows)** — the numbers to give the venue:

|  | Men | Women | Infants (0–3) | Total |
|---|---|---|---|---|
| Asmat side | `SUMIFS(men, status, "active", side, "asmat")` … | | | men + women + infants |
| Saima side | … `side, "saima"` | | | |
| Empty or unrecognised side | Total − Asmat − Saima | | | |
| **Total** | `SUMIFS(men, status, "active")` … | | | |
| On the Guests tab (by names tag) | lines tagged `man` | `woman` | `infant` | rows on the Guests tab |

- **Empty or unrecognised side** = rows whose `side` is empty or not `asmat` / `saima` (replies from before the side
  column, or a side cell cleared or mistyped by hand). Every new attend has a side (a bare link asks the guest). Set
  the `side` cell on those RSVPs rows and they move to the right family. Infants (0–3) are free at the venue but are
  still people in the Total and in `party_size`.
- The grey **On the Guests tab** row recounts the same people from the `names` tags; it must equal **Total**.

**Check rows** (bottom): *People listed on the Guests tab*, *Men + women + infants (active)* and *Guests coming*
(Σ `party_size`) must all be equal, the tag counts must equal the booking Total per category, and *Active rows where
men + women + infants ≠ party_size* must be 0. Then **Check** shows **✓ OK**; otherwise **⚠ Mismatch** (red) — usually a
`names` cell edited by hand without fixing `men` / `women` / `infants` / `party_size` (or a line that lost its
` — man|woman|infant` tag: on the Guests tab it has an empty Category). A `names` cell with only line breaks shows as
one **(empty names)** row, and a blank line inside a cell as a **(blank line)** row — both with an empty Category, so the
check flags them too. Fix that RSVPs row and the check turns green.

**Verify by hand once (after `setup` and before launch):**

1. Send three test replies, e.g. via `…/?side=asmat` (a man, a woman and a Child 0–3), via `…/?side=saima` (a woman
   and a man), and one via the bare link, choosing **Saima's guest** (one woman). The Guests tab lists 6 people with the
   right category and side; the table shows Asmat 1 / 1 / 1 / 3, Saima 1 / 2 / 0 / 3, Empty or unrecognised side
   0 / 0 / 0 / 0, Total 2 / 3 / 1 / 6, and **✓ OK**.
2. Reply again as the `?side=saima` guest with only herself → her old row turns `superseded`; Saima side becomes
   0 / 2 / 0 / 2 and Total 1 / 3 / 1 / 5. Cancel the bare-link guest completely → `cancelled`; Saima side becomes
   0 / 1 / 0 / 1 and Total 1 / 2 / 1 / 4. Check still **✓ OK**.
3. A new reply can't have an empty side, so test that row by hand: on the Saima guest's active row, clear the `side`
   cell → Saima side 0 / 0 / 0 / 0, Empty or unrecognised side 0 / 1 / 0 / 1, Total unchanged, still **✓ OK**. Type
   `saima` back into the cell → Saima side 0 / 1 / 0 / 1 again.
4. On an active row, add a line `Test Person — man` to `names` without changing the counts → **⚠ Mismatch**. Undo it
   (Ctrl/Cmd + Z) → **✓ OK**.
5. **Wedding RSVP → Clear ALL RSVPs** to remove the test rows.

## Quotas

- Consumer Gmail accounts: **100 emails/day** sent by scripts (Workspace: 1,500). Each RSVP uses 2 (guest + you).
  If you expect more than ~50 replies in one day, set `SEND_OWNER_EMAILS` to `false` for that day and use the Sheet.
  When the quota runs out, RSVPs are still saved; the row's `note` records the unsent email.
- Script runtime and requests are far beyond what a wedding needs. Concurrent replies are queued (LockService).

## Privacy & security

- The Sheet is private to you. The web app runs **as you** but only exposes: submit/cancel an RSVP, look up a party's
  names with **both** its email and phone, and the total count.
- Lookups and cancels are rate-limited per email and per phone (12 per 10 minutes); guest confirmations to one
  address are limited (6 per 10 minutes). Cache keys are hashed, so no email or phone is stored outside the Sheet.
- A hidden "website" field catches bots: they get a fake "ok" and nothing is saved.
- Text that would start a formula (`=`, `+`, `-`, `@`) is stored as plain text.
- Guests' data: names, email, phone, message, language. Delete the Sheet after the wedding when no longer needed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site says it couldn't send / "server" error | Open the `/exec` URL in a private window: must show `{"ok":true,"status":"ready"}`. If it asks to sign in, the deployment's access isn't **Anyone** — edit the deployment. |
| Changes to the code have no effect | You didn't publish a new version: Manage deployments → Edit → New version → Deploy. |
| URL changed and the site broke | You created a new deployment. Put the new URL in `config.js`, or go back to the old deployment and edit it instead. |
| "Authorization is required" / emails not sent | Run `setup` once more from the editor and accept the permissions. |
| No notification emails | Check `OWNER_EMAIL` and `SEND_OWNER_EMAILS`; check spam; check `note` on the row for ⚠. |
| Guests tab shows `#ERROR!` or `#REF!` | Run **Wedding RSVP → Set up / repair the tabs** (it rebuilds Guests and Summary). |
| Summary **Check** shows ⚠ Mismatch | A `names` cell and its counts disagree on some active row — see "Reading the Summary". The Guests tab shows lines without a tag with an empty Category. |
| Columns were moved or renamed | Columns are found by header name. Keep the 16 header names exactly; `setup` re-adds missing ones at the end. |
| Late notice on the site and `late` in the Sheet disagree | `RSVP_DEADLINE` (Script Properties) and `rsvpDeadline` (`config.js`) differ. Make them the same date. |
| Execution log | Apps Script editor → **Executions** (left sidebar) shows every request and any error. |

## Developing locally

The repository has a Node test harness that runs these `.gs` files against mocked Google services:

```bash
node --test 'tests/apps-script/*.test.mjs'               # all backend tests (Node 22+)
node tests/apps-script/render-emails.mjs /tmp/emails     # every email variant as .html + .txt for review
```

The Guests and Summary formulas are computed in the tests by a small Sheets formula evaluator
(`tests/apps-script/formula-eval.mjs`, only the functions `Setup.gs` uses), so a changed formula is checked by its numbers.

The Swedish, Thai and Urdu email wording in `Strings.gs` is a **DRAFT** — have a native speaker proofread it
(use *Email me sample confirmations*) before launch.
