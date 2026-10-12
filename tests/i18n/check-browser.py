#!/usr/bin/env python3
"""Browser check for the i18n engine + language switcher (issue 02).

  python3 tests/i18n/check-browser.py [BASE_URL]      (default http://127.0.0.1:8090/)

Serve asmat-saima/ first (python3 -m http.server 8090). Needs Playwright (python) + Chromium.
Checks: ?lang=th, ?lang=ur (dir=rtl), navigator-language detection (sv-SE, nb-NO → en),
switching without reload (text, title, URL params kept, aria-pressed, langchange event),
arrow-key navigation, switcher above the opening overlay, no missing-key warnings.
"""
import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8090/').rstrip('/') + '/'
fails = []


def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond:
        fails.append(msg)


def page_for(browser, locale='en-GB', w=390, h=844):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, locale=locale)
    pg = ctx.new_page()
    pg.warnings = []
    pg.on('console', lambda m: m.type in ('error', 'warning') and pg.warnings.append(m.text))
    pg.on('pageerror', lambda e: pg.warnings.append(f'pageerror: {e}'))
    return pg


def ready(pg):
    pg.wait_for_selector('#lang-switcher .lang-switcher__opt', timeout=10000)
    pg.wait_for_timeout(400)


def i18n_warnings(pg):
    return [w for w in pg.warnings if '[i18n]' in w]


with sync_playwright() as p:
    b = p.chromium.launch()

    print('?lang=th')
    pg = page_for(b)
    pg.goto(BASE + '?lang=th', wait_until='networkidle'); ready(pg)
    check(pg.evaluate('document.documentElement.lang') == 'th', 'html lang=th')
    check(pg.evaluate('document.documentElement.dir') == 'ltr', 'dir=ltr')
    check('นิกะห์' in pg.title(), 'title in Thai')
    check(pg.evaluate("document.querySelector('[data-lang=th]').getAttribute('aria-pressed')") == 'true', 'TH pressed')
    check(pg.evaluate("document.fonts.check('16px \"Noto Serif Thai\"', 'นิกะห์')"), 'Noto Serif Thai loaded')
    check(not i18n_warnings(pg), f'no i18n warnings {i18n_warnings(pg)}')
    pg.context.close()

    print('?lang=ur')
    pg = page_for(b)
    pg.goto(BASE + '?lang=ur&open=1', wait_until='networkidle'); ready(pg)
    check(pg.evaluate('document.documentElement.lang') == 'ur', 'html lang=ur')
    check(pg.evaluate('document.documentElement.dir') == 'rtl', 'dir=rtl')
    check(pg.evaluate("document.querySelector('#lang-switcher').getAttribute('aria-label')") == 'زبان', 'nav label in Urdu')
    box = pg.evaluate("(() => { const r = document.querySelector('#lang-switcher').getBoundingClientRect(); return [r.left, r.right]; })()")
    check(box[0] < 60, f'switcher sits at the inline end (left) in RTL: {box}')
    check(not i18n_warnings(pg), f'no i18n warnings {i18n_warnings(pg)}')
    pg.context.close()

    print('navigator.languages = sv-SE')
    pg = page_for(b, locale='sv-SE')
    pg.goto(BASE, wait_until='networkidle'); ready(pg)
    check(pg.evaluate('document.documentElement.lang') == 'sv', 'detected sv')
    check('?lang' not in pg.url, 'detection does not write ?lang')
    pg.context.close()

    print('navigator.languages = nb-NO → en')
    pg = page_for(b, locale='nb-NO')
    pg.goto(BASE, wait_until='networkidle'); ready(pg)
    check(pg.evaluate('document.documentElement.lang') == 'en', 'Norwegian falls back to en')
    pg.context.close()

    print('switching without reload (opening overlay still closed)')
    pg = page_for(b)
    pg.goto(BASE + '?demo=1', wait_until='networkidle'); ready(pg)
    pg.evaluate("window.__marker = 1; window.__events = []; document.addEventListener('langchange', e => __events.push(e.detail.lang))")
    z = pg.evaluate("""(() => {
      const s = document.querySelector('#lang-switcher'), o = document.querySelector('#opening');
      const r = s.querySelector('[data-lang=sv]').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { above: +getComputedStyle(s).zIndex > +getComputedStyle(o).zIndex, hit: !!hit && s.contains(hit) };
    })()""")
    check(z['above'], 'switcher z-index above #opening')
    check(z['hit'], 'switcher is hit-testable while doors are closed')
    pg.click('#lang-switcher [data-lang=sv]')
    pg.wait_for_function("document.documentElement.lang === 'sv' && !document.documentElement.classList.contains('is-switching')", timeout=5000)
    check(pg.evaluate('window.__marker') == 1, 'no reload')
    check(pg.evaluate('__events') == ['sv'], 'langchange fired once')
    check('lang=sv' in pg.url and 'demo=1' in pg.url, f'URL updated, other params kept: {pg.url}')
    check('december 2026' in pg.title(), 'title switched to Swedish')
    check(pg.evaluate("document.querySelector('meta[name=description]').content").startswith('Varmt'), 'meta description switched')
    check(pg.evaluate("document.querySelector('[data-lang=sv]').getAttribute('aria-pressed')") == 'true', 'SV pressed')
    check(pg.evaluate("document.querySelector('[data-lang=en]').getAttribute('aria-pressed')") == 'false', 'EN released')
    txt = pg.evaluate("[...document.querySelectorAll('[data-i18n]')].map(e => e.dataset.i18n + '=' + e.textContent)")
    check(any(s.startswith('cue.aria=Skrolla') for s in txt), 'data-i18n text re-applied')

    print('keyboard')
    pg.focus('#lang-switcher [data-lang=sv]')
    pg.keyboard.press('ArrowRight')
    check(pg.evaluate("document.activeElement.dataset.lang") == 'th', 'ArrowRight → TH')
    pg.keyboard.press('End')
    check(pg.evaluate("document.activeElement.dataset.lang") == 'ur', 'End → اردو')
    pg.keyboard.press('Enter')
    pg.wait_for_function("document.documentElement.dir === 'rtl' && !document.documentElement.classList.contains('is-switching')", timeout=5000)
    check(pg.evaluate('document.documentElement.lang') == 'ur', 'Enter switches to ur, dir=rtl')
    pg.keyboard.press('ArrowRight')  # RTL: right = previous
    check(pg.evaluate("document.activeElement.dataset.lang") == 'th', 'RTL ArrowRight → TH')
    pg.keyboard.press('Home')
    check(pg.evaluate("document.activeElement.dataset.lang") == 'en', 'Home → EN')
    pg.keyboard.press('Space')
    pg.wait_for_function("document.documentElement.lang === 'en' && !document.documentElement.classList.contains('is-switching')", timeout=5000)
    check(pg.evaluate('document.documentElement.dir') == 'ltr', 'back to en, dir=ltr')
    tabbable = pg.evaluate("[...document.querySelectorAll('#lang-switcher button')].filter(b => b.tabIndex === 0).map(b => b.dataset.lang)")
    check(tabbable == ['en'], f'single tab stop on active language: {tabbable}')

    print('engine API')
    api = pg.evaluate("""(async () => {
      const m = await import('./src/i18n/index.js');
      const out = {};
      await m.setLang('sv'); out.sv = [m.t('form.counter', {count: 1}), m.t('form.counter', {count: 3}), m.formatDate('2026-12-13', {weekday:'long', day:'numeric', month:'long'})];
      await m.setLang('th'); out.th = [m.formatDate('2026-12-13'), m.t('form.counter', {count: 2})];
      await m.setLang('ur'); out.ur = [m.formatNumber(1234), m.t('form.counter', {count: 1}), m.formatDate('2026-12-13')];
      await m.setLang('en'); out.en = [m.t('nope.missing'), m.t('form.counter', {count: 1})];
      return out;
    })()""")
    print('   ', api)
    check(api['sv'][0] == 'Du har lagt till 1 person' and api['sv'][1] == 'Du har lagt till 3 personer', 'sv plurals')
    check(api['sv'][2] == 'söndag 13 december', 'sv date')
    check('2569' in api['th'][0], 'th uses Buddhist Era')
    check(api['ur'][0] == '1,234' or api['ur'][0] == '1٬234' or '1' in api['ur'][0] and '234' in api['ur'][0], 'ur number')
    check(all(c in '0123456789,' for c in api['ur'][0]), 'ur keeps Latin digits')
    check(api['en'][0] == 'nope.missing', 'missing key returns key')
    pg.context.close()

    b.close()

print('\n' + ('PASS' if not fails else f'FAILED: {len(fails)}'))
sys.exit(1 if fails else 0)
