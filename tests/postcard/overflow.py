#!/usr/bin/env python3
"""Postcard layout check: no text leaves the gold arch, collides with the couple, or scrolls the page sideways.

    python3 -m http.server 8090 --bind 127.0.0.1      # from the repo root
    python3 tests/postcard/overflow.py [base_url]

Viewports 360x640, 390x844, 1440x900 x languages en, sv, th, ur. Each text line's box (Range client rects,
so the real glyph runs, not the block) must have all four corners inside the arch path (hit-tested with
SVGGeometryElement.isPointInFill on the frame) and above the top of the couple. Exit code 1 on failure.
"""
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8090').rstrip('/')
VIEWPORTS = [(360, 640, True), (390, 844, True), (1440, 900, False)]
LANGS = ['en', 'sv', 'th', 'ur']

CHECK = r"""
() => {
  const sheet = document.querySelector('.postcard__sheet');
  const arch = document.querySelector('.postcard__arch-line');
  const couple = document.querySelector('.postcard__couple');
  const s = sheet.getBoundingClientRect();
  const coupleTop = couple.getBoundingClientRect().top - s.top;
  const sel = ['.postcard__invited', '.postcard__nikah', '.postcard__of', '.postcard__name--1', '.postcard__name--2',
               '.postcard__rings', '.postcard__laurel', '.postcard__date', '.postcard__time:not([hidden])', '.postcard__venue-line--1',
               '.postcard__venue-line--2'];
  const problems = [];
  const PAD = 2;   // px of tolerance for glyph side-bearings
  for (const q of sel) {
    for (const el of document.querySelectorAll(q)) {
      let rects;
      if (el.matches('.postcard__rings, .postcard__laurel')) rects = [el.getBoundingClientRect()];
      else { const r = document.createRange(); r.selectNodeContents(el); rects = [...r.getClientRects()]; }
      for (const rc of rects) {
        if (rc.width < 1 || rc.height < 1) continue;
        const x0 = rc.left - s.left + PAD, x1 = rc.right - s.left - PAD;
        // ink sits inside the line box; test the middle 70% of its height
        const y0 = rc.top - s.top + rc.height * 0.15, y1 = rc.bottom - s.top - rc.height * 0.15;
        const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
        const out = pts.filter(([x, y]) => !arch.isPointInFill(new DOMPoint(x, y)));
        if (out.length) problems.push(`${q} outside arch at ${out.map(p => p.map(Math.round).join(',')).join(' ')}`);
        if (q !== '.postcard__venue-line--2' && y1 > coupleTop + 4 && !q.includes('venue')) problems.push(`${q} overlaps couple`);
      }
    }
  }
  const lastLine = document.querySelector('.postcard__venue-line--2').getBoundingClientRect();
  if (lastLine.bottom - s.top > coupleTop + 6) problems.push(`address overlaps couple (${Math.round(lastLine.bottom - s.top)} > ${Math.round(coupleTop)})`);
  if (document.documentElement.scrollWidth > innerWidth + 1) problems.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`);
  const c = document.querySelector('.postcard__content').getBoundingClientRect();
  for (const el of document.querySelectorAll('.postcard__laurel')) {
    const r = el.getBoundingClientRect();
    if (r.left < c.left - 1 || r.right > c.right + 1) problems.push('names line wider than the text column');
  }
  // the card must fit in the first screen on phones
  if (s.bottom > innerHeight + 1 && innerWidth < 1000) problems.push(`card taller than the screen (${Math.round(s.bottom)} > ${innerHeight})`);
  return problems;
}
"""


def main():
    failed = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, h, mobile in VIEWPORTS:
            ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile,
                                device_scale_factor=2 if mobile else 1, reduced_motion='reduce')
            pg = ctx.new_page()
            for lang in LANGS:
                pg.goto(f'{BASE}/?open=1&lang={lang}', wait_until='networkidle')
                pg.evaluate('document.fonts.ready')
                pg.wait_for_timeout(600)
                problems = pg.evaluate(CHECK)
                tag = f'{w}x{h} {lang}'
                if problems:
                    failed += 1
                    print(f'FAIL {tag}:', *problems, sep='\n   ')
                else:
                    print(f'ok   {tag}')
            ctx.close()
        b.close()
    print('\n' + ('all passed' if not failed else f'{failed} failing case(s)'))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
