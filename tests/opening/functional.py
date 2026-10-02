#!/usr/bin/env python3
"""Opening behaviour checks: keyboard open + focus, language switch while closed, Skip, reduced motion, ?open=1, CPU 4x frame times.
   python3 tests/opening/functional.py [base-url]   (default http://127.0.0.1:8090/)"""
import sys
import os
os.environ.setdefault('LD_LIBRARY_PATH', '/sessions/upbeat-gifted-pascal/libs/root/usr/lib/x86_64-linux-gnu')
from playwright.sync_api import sync_playwright
B=sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8090/'
O='/tmp/'
def marks(pg): return pg.evaluate("""() => { window.__m=[]; const t0=performance.now();
  document.addEventListener('invite:opened',()=>__m.push(['opened',Math.round(performance.now()-t0)]));
  new MutationObserver(()=>{ if(!document.getElementById('opening') && !__m.some(x=>x[0]=='removed')) __m.push(['removed',Math.round(performance.now()-t0)]);}).observe(document.body,{childList:true}); }""")
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1 keyboard: Enter on focused seal
    pg=b.new_page(viewport={'width':1440,'height':900}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    pg.goto(B,wait_until='networkidle'); pg.wait_for_timeout(1500)
    print('focused:', pg.evaluate("document.activeElement.className"), '| dialog label:', pg.evaluate("document.getElementById('opening-title').textContent.trim()"))
    print('seal aria:', pg.evaluate("document.querySelector('.op-seal').getAttribute('aria-label')"))
    marks(pg); pg.keyboard.press('Enter'); pg.wait_for_timeout(7200)
    print('kbd marks', pg.evaluate('__m'), 'focus after:', pg.evaluate("document.activeElement.id"), 'overflow:', pg.evaluate("document.documentElement.style.overflow"), 'inert:', pg.evaluate("document.getElementById('site').inert"), errs)
    pg.close()
    # 2 language change while closed
    pg=b.new_page(viewport={'width':390,'height':844})
    pg.goto(B,wait_until='networkidle'); pg.wait_for_timeout(1200)
    btn=pg.locator('#lang-switcher button, #lang-switcher a').filter(has_text='SV').first
    btn.click(); pg.wait_for_timeout(800)
    print('after sv:', pg.evaluate("[document.querySelector('.op-line').textContent, document.querySelector('.op-prompt').textContent.trim(), document.querySelector('.op-seal').getAttribute('aria-label'), document.querySelector('.op-skip').textContent]"))
    print('still closed:', pg.evaluate("!!document.querySelector('#opening .op-stage:not([hidden])')"))
    # 3 skip
    pg.click('.op-stage', position={'x':100,'y':700}); pg.wait_for_timeout(900)
    marks(pg); pg.click('.op-skip'); pg.wait_for_timeout(1000)
    print('skip marks', pg.evaluate('__m'), 'opening exists', pg.evaluate("!!document.getElementById('opening')"))
    pg.close()
    # 4 reduced motion
    ctx=b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce'); pg=ctx.new_page()
    pg.goto(B,wait_until='networkidle'); pg.wait_for_timeout(1200); marks(pg)
    pg.click('.op-seal'); pg.wait_for_timeout(200); pg.screenshot(path=O+'r6_reduced_mid.png'); pg.wait_for_timeout(800)
    print('reduced marks', pg.evaluate('__m')); ctx.close()
    # 5 ?open=1
    pg=b.new_page(); pg.goto(B+'?open=1',wait_until='networkidle'); print('open=1 overlay:', pg.evaluate("!!document.getElementById('opening')"), pg.evaluate("document.documentElement.classList.contains('is-open')"))
    # 6 CPU 4x
    ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); pg=ctx.new_page()
    cdp=ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
    pg.goto(B,wait_until='networkidle'); pg.wait_for_timeout(2500); marks(pg)
    pg.evaluate("""() => { window.__fr=[]; let last=performance.now(); const f=()=>{const n=performance.now(); __fr.push(n-last); last=n; if(__fr.length<400) requestAnimationFrame(f)}; requestAnimationFrame(f); }""")
    pg.tap('.op-seal'); pg.wait_for_timeout(7500)
    print('cpu4 marks', pg.evaluate('__m'), 'frames: n/avg/p95/max', pg.evaluate("(()=>{const a=__fr.slice(1).sort((x,y)=>x-y);return [a.length,(a.reduce((s,x)=>s+x,0)/a.length).toFixed(1),a[Math.floor(a.length*.95)].toFixed(1),a[a.length-1].toFixed(1)]})()"))
    b.close()
