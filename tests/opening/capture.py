#!/usr/bin/env python3
"""Opening-animation capture: records a video of tap → reveal and tiles frames into a contact sheet.

  python3 tests/opening/capture.py --out /tmp/op --name phone --w 390 --h 844 --mobile
  python3 tests/opening/capture.py --out /tmp/op --name desk --w 1440 --h 900
  options: --reduced  --lang ur  --fps 8  --cols 8  --base http://127.0.0.1:8090/  --cpu 4 (CDP throttle)

Outputs <out>/<name>_closed.png, <name>_sheet.png, <name>.webm and prints console errors + timing marks.
Needs LD_LIBRARY_PATH for the sandboxed Chromium (set below)."""
import argparse, os, subprocess, time, glob, shutil
os.environ.setdefault('LD_LIBRARY_PATH', '/sessions/upbeat-gifted-pascal/libs/root/usr/lib/x86_64-linux-gnu')
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='/tmp/op'); ap.add_argument('--name', default='cap')
ap.add_argument('--w', type=int, default=390); ap.add_argument('--h', type=int, default=844)
ap.add_argument('--mobile', action='store_true'); ap.add_argument('--reduced', action='store_true')
ap.add_argument('--lang', default=''); ap.add_argument('--fps', type=float, default=8)
ap.add_argument('--cols', type=int, default=8); ap.add_argument('--dur', type=float, default=5.2)
ap.add_argument('--base', default='http://127.0.0.1:8090/'); ap.add_argument('--cpu', type=float, default=0)
ap.add_argument('--thumb', type=int, default=0, help='thumbnail width in sheet (default auto)')
ap.add_argument('--start', type=float, default=0.0, help='sheet starts this many s after the tap')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
vid_dir = f'/tmp/_opcap_vid_{a.name}'
shutil.rmtree(vid_dir, ignore_errors=True)

url = a.base + (f'?lang={a.lang}' if a.lang else '')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': a.w, 'height': a.h}, device_scale_factor=1,
                        is_mobile=a.mobile, has_touch=a.mobile,
                        reduced_motion='reduce' if a.reduced else 'no-preference',
                        record_video_dir=vid_dir, record_video_size={'width': a.w, 'height': a.h})
    pg = ctx.new_page()
    t_page = time.monotonic()
    pg.on('console', lambda m: m.type in ('error', 'warning') and print(f'[console.{m.type}] {m.text}'))
    pg.on('pageerror', lambda e: print(f'[pageerror] {e}'))
    if a.cpu:
        cdp = ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': a.cpu})
    pg.goto(url, wait_until='networkidle')
    pg.wait_for_timeout(2200)
    pg.screenshot(path=os.path.join(a.out, f'{a.name}_closed.png'))
    pg.evaluate("""() => { window.__marks = []; const t0 = performance.now();
      document.addEventListener('invite:opened', () => window.__marks.push(['opened', Math.round(performance.now() - t0)]));
      new MutationObserver(() => { if (!document.getElementById('opening')) window.__marks.push(['removed', Math.round(performance.now() - t0)]); })
        .observe(document.body, { childList: true }); }""")
    seal = pg.locator('.op-seal')
    t_click = time.monotonic()
    if a.mobile: seal.tap()
    else: seal.click()
    pg.wait_for_timeout(int(a.dur * 1000) + 600)
    print('[marks]', pg.evaluate('window.__marks'))
    pg.screenshot(path=os.path.join(a.out, f'{a.name}_end.png'))
    vpath = pg.video.path()
    ctx.close(); b.close()

offset = t_click - t_page
final = f'/tmp/_opcap_{a.name}.webm'
shutil.move(vpath, final); shutil.rmtree(vid_dir, ignore_errors=True)
fr = f'/tmp/_opcap_fr_{a.name}'; shutil.rmtree(fr, ignore_errors=True); os.makedirs(fr)
tw = a.thumb or (240 if a.w < 700 else 360)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', f'{offset + a.start:.3f}', '-i', final, '-t', f'{a.dur:.2f}',
                '-vf', f'fps={a.fps},scale={tw}:-1', os.path.join(fr, 'f%03d.png')], check=True)
fs = sorted(glob.glob(os.path.join(fr, 'f*.png')))
im = Image.open(fs[0]); w, h = im.size; cols = a.cols; rows = (len(fs) + cols - 1) // cols
S = Image.new('RGB', (w * cols, h * rows), 'black'); d = ImageDraw.Draw(S)
for i, f in enumerate(fs):
    x, y = (i % cols) * w, (i // cols) * h
    S.paste(Image.open(f), (x, y))
    d.rectangle([x, y, x + 52, y + 14], fill='black'); d.text((x + 3, y + 2), f'{int((a.start + i / a.fps) * 1000)}ms', fill='white')
sheet = os.path.join(a.out, f'{a.name}_sheet.png'); S.save(sheet); shutil.rmtree(fr)
print('saved', sheet, S.size, 'click offset', round(offset, 2))
