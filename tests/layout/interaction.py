"""Browser checks for src/layout.js (Playwright, python).

Run from asmat-saima/ with a static server on :8090:
    python3 -m http.server 8090 --bind 127.0.0.1 &
    python3 tests/layout/interaction.py [base_url]
"""
import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8090/').rstrip('/') + '/'
fails = []


def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        fails.append(msg)


def page_for(browser, w, h, mobile=False, lang='en', reduced=False, query='?open=1'):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile,
                              reduced_motion='reduce' if reduced else 'no-preference', accept_downloads=True)
    p = ctx.new_page()
    errors = []
    p.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    p.on('pageerror', lambda e: errors.append(str(e)))
    sep = '&' if '?' in query else '?'
    p.goto(BASE + query + f'{sep}lang={lang}', wait_until='networkidle')
    p.wait_for_timeout(600)
    return ctx, p, errors


with sync_playwright() as pw:
    b = pw.chromium.launch()

    # 1. No horizontal overflow, no console errors, at every target size and language.
    for (w, h, mob) in [(360, 740, True), (390, 844, True), (768, 1024, True), (1280, 800, False),
                        (1440, 900, False), (1920, 1080, False)]:
        for lang in ['en', 'ur', 'th', 'sv']:
            ctx, p, errs = page_for(b, w, h, mob, lang)
            sw = p.evaluate('document.documentElement.scrollWidth')
            cw = p.evaluate('document.documentElement.clientWidth')
            check(sw <= cw, f'{w}x{h} {lang}: no horizontal scroll ({sw} <= {cw})')
            check(not errs, f'{w}x{h} {lang}: no console errors {errs[:2]}')
            ctx.close()

    # 2. Scroll locked while the doors are closed.
    ctx, p, _ = page_for(b, 390, 844, True, query='')
    check(p.evaluate("getComputedStyle(document.documentElement).overflow") == 'hidden'
          or p.evaluate("getComputedStyle(document.body).overflow") == 'hidden',
          'scroll locked before html.is-open')
    check(p.evaluate("document.querySelectorAll('.reveal.is-visible').length") == 0, 'no reveal before opening')
    ctx.close()

    # 3. Calendar menu, desktop popover, keyboard.
    ctx, p, errs = page_for(b, 1440, 900)
    btn = p.locator('[aria-controls=calendar-dialog]')
    check(btn.get_attribute('aria-haspopup') == 'dialog', 'aria-haspopup=dialog')
    btn.focus()
    p.keyboard.press('Enter')
    p.wait_for_timeout(400)
    check(p.evaluate("document.getElementById('calendar-dialog').open"), 'Enter opens the menu')
    check(btn.get_attribute('aria-expanded') == 'true', 'aria-expanded=true when open')
    check(p.evaluate("document.activeElement.classList.contains('cal-option')"), 'keyboard open focuses first option')
    check(p.evaluate("document.getElementById('calendar-dialog').classList.contains('is-popover')"), 'popover on desktop')
    p.keyboard.press('ArrowDown')
    check(p.evaluate("document.activeElement.dataset.cal") == 'google', 'ArrowDown moves to Google option')
    p.keyboard.press('Escape')
    p.wait_for_timeout(500)
    check(not p.evaluate("document.getElementById('calendar-dialog').open"), 'Esc closes')
    check(btn.get_attribute('aria-expanded') == 'false', 'aria-expanded=false after close')
    check(p.evaluate("document.activeElement.getAttribute('aria-controls')") == 'calendar-dialog', 'focus returns to button')
    href = p.locator('[data-cal=google]').get_attribute('href')
    check('dates=20261213T160000%2F20261214T000000' in href or 'dates=20261213T160000/20261214T000000' in href,
          'Google link runs 16:00 to midnight')
    # .ics download
    btn.click()
    p.wait_for_timeout(400)
    check(not p.evaluate("document.activeElement.classList.contains('cal-option')"), 'pointer open does not ring an option')
    with p.expect_download() as dl:
        p.locator('[data-cal=ics]').click()
    path = dl.value.path()
    ics = open(path, 'rb').read().decode('utf-8')
    check(dl.value.suggested_filename.endswith('.ics'), f'download filename {dl.value.suggested_filename}')
    check('DTSTART;TZID=Europe/Stockholm:20261213T160000' in ics and '\r\n' in ics, '.ics content starts at 16:00 with CRLF')
    p.wait_for_timeout(500)
    check(not p.evaluate("document.getElementById('calendar-dialog').open"), 'menu closes after download')
    check(not errs, f'no console errors in calendar flow {errs[:2]}')
    ctx.close()

    # 4. Phone bottom sheet + backdrop close; RSVP cue.
    ctx, p, _ = page_for(b, 390, 844, True)
    check(p.locator('#rsvp-cue').is_visible(), 'cue visible on phone')
    p.locator('.rsvp-cue__link').click()
    p.wait_for_timeout(1400)
    check(p.evaluate("document.activeElement.id") == 'rsvp', 'cue focuses #rsvp')
    check(p.evaluate("Math.abs(document.getElementById('rsvp').getBoundingClientRect().top) < 120"), 'cue scrolled to #rsvp')
    p.wait_for_timeout(600)
    check(p.evaluate("document.getElementById('rsvp-cue').classList.contains('is-faded')"), 'cue fades after scroll')
    p.evaluate("document.getElementById('actions').scrollIntoView({block:'center'})")
    p.wait_for_timeout(700)
    check(p.evaluate("document.querySelector('.actions__inner').classList.contains('is-visible')"), 'actions revealed on scroll')
    p.locator('[aria-controls=calendar-dialog]').tap()
    p.wait_for_timeout(600)
    check(p.evaluate("document.getElementById('calendar-dialog').classList.contains('is-sheet')"), 'bottom sheet on phone')
    check(p.evaluate("document.documentElement.classList.contains('has-modal')"), 'page scroll locked under the sheet')
    p.mouse.click(195, 60)  # backdrop
    p.wait_for_timeout(600)
    check(not p.evaluate("document.getElementById('calendar-dialog').open"), 'backdrop tap closes the sheet')
    ctx.close()

    # 5. Desktop: cue hidden, card sticky.
    ctx, p, _ = page_for(b, 1440, 900)
    check(not p.locator('#rsvp-cue').is_visible(), 'cue hidden on desktop')
    check(p.evaluate("getComputedStyle(document.querySelector('.site__card')).position") == 'sticky', 'card sticky on desktop')
    ctx.close()

    # 6. Reduced motion: everything visible immediately after opening.
    ctx, p, _ = page_for(b, 390, 844, True, reduced=True)
    op = p.evaluate("getComputedStyle(document.querySelector('.footer__inner')).opacity")
    check(op == '1', f'reduced motion: footer visible without scrolling (opacity {op})')
    ctx.close()

    # 7. Language change re-renders dates.
    ctx, p, _ = page_for(b, 1280, 800)
    before = p.locator('.footer__date').text_content()
    p.evaluate("import('./src/i18n/index.js').then(m => m.setLang('sv'))")
    p.wait_for_timeout(800)
    after = p.locator('.footer__date').text_content()
    check(before != after and 'december' in after.lower(), f'date re-rendered on language change ({before!r} -> {after!r})')
    ctx.close()

    b.close()

print(f'\n{len(fails)} failure(s)')
sys.exit(1 if fails else 0)
