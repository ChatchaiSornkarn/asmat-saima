#!/usr/bin/env python3
"""Render the static share/icon assets with real fonts (Playwright + Chromium).

    python3 -m http.server 8090 --bind 127.0.0.1   # from the repo root, in another shell
    python3 tests/postcard/render-assets.py [base_url]

Writes assets/og-image.jpg (1200x630, < 200 KB) and assets/apple-touch-icon.png (180x180).
assets/favicon.svg is hand-written (arch + 8-point star from src/art/arch.js geometry).
"""
import io
import os
import re
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8090').rstrip('/')
ASSETS = os.path.join(ROOT, 'assets')


def og(page):
    page.set_viewport_size({'width': 1200, 'height': 630})
    page.goto(f'{BASE}/tests/postcard/og-image.html', wait_until='networkidle')
    page.wait_for_selector('body[data-ready="1"]')
    page.wait_for_timeout(400)
    png = page.screenshot(type='png')
    im = Image.open(io.BytesIO(png)).convert('RGB')
    out = os.path.join(ASSETS, 'og-image.jpg')
    for q in (88, 84, 80, 76, 72):
        im.save(out, 'JPEG', quality=q, optimize=True, progressive=True, subsampling='4:2:0')
        if os.path.getsize(out) < 200_000:
            break
    print('og-image.jpg', os.path.getsize(out), 'bytes, q', q)


def touch_icon(page):
    svg = open(os.path.join(ASSETS, 'favicon.svg'), encoding='utf-8').read()
    svg = re.sub(r'<rect[^>]*/>', '<rect width="32" height="32" fill="#f3ead9"/>', svg)  # iOS rounds the corners itself
    svg = svg.replace('viewBox="0 0 32 32"', 'viewBox="-2 -2 36 36" width="180" height="180"')
    page.set_viewport_size({'width': 180, 'height': 180})
    page.set_content(f'<html><body style="margin:0;background:#f3ead9">{svg}</body></html>')
    out = os.path.join(ASSETS, 'apple-touch-icon.png')
    Image.open(io.BytesIO(page.screenshot(type='png'))).convert('RGB').save(out, optimize=True)
    print('apple-touch-icon.png', os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        og(pg)
        touch_icon(pg)
        b.close()
