#!/usr/bin/env python3
"""Frame-accurate stills of the opening: one fresh page per time-point; taps the seal, waits t ms (measured in-page),
then pauses every Web Animation and screenshots. Tiles into a labelled contact sheet.

  python3 tests/opening/freeze.py --out /tmp/op --name desk --w 1440 --h 900 --times 0,300,600,...
  options: --mobile --lang ur --cols 6 --thumb 320 --base http://127.0.0.1:8090/"""
import argparse, os
os.environ.setdefault('LD_LIBRARY_PATH', '/sessions/upbeat-gifted-pascal/libs/root/usr/lib/x86_64-linux-gnu')
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='/tmp/op'); ap.add_argument('--name', default='frz')
ap.add_argument('--w', type=int, default=390); ap.add_argument('--h', type=int, default=844)
ap.add_argument('--mobile', action='store_true'); ap.add_argument('--lang', default='')
ap.add_argument('--times', default='0,250,500,750,1000,1250,1500,1750,2000,2250,2500,2750,3000,3250,3500,3750,4000,4500')
ap.add_argument('--cols', type=int, default=6); ap.add_argument('--thumb', type=int, default=0)
ap.add_argument('--base', default='http://127.0.0.1:8090/')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
url = a.base + (f'?lang={a.lang}' if a.lang else '')
times = [int(x) for x in a.times.split(',')]
tw = a.thumb or (240 if a.w < 700 else 360)
shots = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': a.w, 'height': a.h}, device_scale_factor=1, is_mobile=a.mobile, has_touch=a.mobile)
    for t in times:
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: print(f'[pageerror] {e}'))
        pg.goto(url, wait_until='networkidle'); pg.wait_for_timeout(1600)
        pg.evaluate("""(t) => new Promise((res) => {
          const s = document.querySelector('.op-seal'); s.click(); const t0 = performance.now();
          const tick = () => { if (performance.now() - t0 >= t) { document.getAnimations().forEach((x) => x.pause());
            requestAnimationFrame(() => res()); } else requestAnimationFrame(tick); };
          if (t === 0) { document.getAnimations().forEach((x) => x.pause()); res(); } else requestAnimationFrame(tick); })""", t)
        f = f'/tmp/_frz_{a.name}_{t}.png'; pg.screenshot(path=f); shots.append((t, f)); pg.close()
    b.close()
ims = [(t, Image.open(f).resize((tw, round(tw * a.h / a.w)))) for t, f in shots]
w, h = ims[0][1].size; rows = (len(ims) + a.cols - 1) // a.cols
S = Image.new('RGB', (w * a.cols, h * rows), 'black'); d = ImageDraw.Draw(S)
for i, (t, im) in enumerate(ims):
    x, y = (i % a.cols) * w, (i // a.cols) * h
    S.paste(im, (x, y)); d.rectangle([x, y, x + 52, y + 14], fill='black'); d.text((x + 3, y + 2), f'{t}ms', fill='white')
out = os.path.join(a.out, f'{a.name}_frz.png'); S.save(out); print('saved', out, S.size)
