#!/usr/bin/env python3
"""Regenerate the Postcard's cropped art layers from the reference PNG.

    python3 tools/crop-art.py [path/to/invite_postcard.png]

Default source: ../requirements/references/invite_postcard.png (relative to the repo root).
Writes transparent WebP layers to assets/art/ (see assets/art/README.md for the file contract).

How the cut-out works (the art sits on cream paper in the PNG, and the site's paper is a slightly
different cream, so a plain crop would show a pale rectangle / halo):
  1. Erase the gold arch line where it runs behind the art (inpaint along its exact rows/columns).
  2. Estimate the local paper colour (normalised Gaussian blur of the pixels that look like paper).
  3. Soft key: alpha = smoothstep of the CIE-Lab distance to the local paper colour.
  4. Solid interior: threshold → close → fill holes → keep the components that touch the subject,
     so white rose petals / the white veil (which are close to the paper colour) stay opaque.
  5. Un-mix the colour: F = B + (I − B) / α, so semi-transparent edges carry the subject's colour
     instead of cream (no halo on any ground). Contact shadows survive as faint dark alpha.
Requires: numpy, opencv-python (cv2), Pillow with WebP.
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'requirements', 'references', 'invite_postcard.png')
OUT = os.path.join(ROOT, 'assets', 'art')

# Reference geometry (px in the 1024×1536 PNG) — the gold frame's straight runs and bottom notches.
ARCH_X = (66, 953)       # centre of the vertical sides
ARCH_BASE_Y = 1450.5     # centre of the base line
NOTCH_R = 24             # concave corner radius (centre at the outer corner)
CLOSE = 13               # closing kernel that seals white petals' outlines before hole filling
BIG_HOLE = 700           # enclosed paper-coloured areas at least this big (px²) are part of the subject

# name: (box x0, y0, x1, y1), bleed edges (alpha may touch these), seed box (in crop coords) for the subject
# seeds: boxes in PNG px; connected groups touching a seed are the subject, everything else is dropped
LAYERS = {
    'roses-top-left':     dict(box=(0, 0, 336, 476), bleed='tl', q=84,
                               seeds=[(0, 0, 280, 300), (0, 300, 110, 440)]),
    'roses-bottom-right': dict(box=(716, 1088, 1024, 1536), bleed='br', q=84,
                               seeds=[(860, 1120, 1024, 1536), (740, 1300, 1024, 1536)]),
    'lantern-1':          dict(box=(788, 0, 892, 300), bleed='t', q=86, seeds=[(830, 0, 860, 270)]),
    'lantern-2':          dict(box=(884, 0, 984, 380), bleed='t', q=86, seeds=[(920, 0, 945, 350)]),
    'couple':             dict(box=(356, 1004, 694, 1464), bleed='', q=86, seeds=[(420, 1040, 640, 1440)]),
}

ARCH_TIP = (509.5, 75)   # archPath(887, …) placed at x=66, y=75
ARCH_W = 887
SIDE = 0.465


def _bez(p0, p1, p2, p3, n=80):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def arch_dome_points():
    """Polyline of the dome (same control points as src/art/arch.js)."""
    x0, y0, w = ARCH_X[0], ARCH_TIP[1], ARCH_W
    L = lambda fx, fy: np.array([x0 + fx * w, y0 + fy * w])
    R = lambda fx, fy: np.array([x0 + (1 - fx) * w, y0 + fy * w])
    segs = [(L(0, SIDE), L(0, .39), L(.06, .33), L(.123, .308)), (L(.123, .308), L(.13, .26), L(.17, .2), L(.251, .176)),
            (L(.251, .176), L(.27, .12), L(.36, .075), L(.43, .045)), (L(.43, .045), L(.46, .032), L(.49, .015), L(.5, 0))]
    left = np.concatenate([_bez(*sg) for sg in segs])
    right = left.copy(); right[:, 0] = 2 * (x0 + w / 2) - right[:, 0]
    return [left, right]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def to_lab(rgb01):
    return cv2.cvtColor(rgb01.astype(np.float32), cv2.COLOR_RGB2Lab)


def arch_line_mask(shape, x0, y0):
    """Pixels of the frame's straight sides, base line and corner notches inside this crop."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    X, Y = xx + x0, yy + y0
    m = np.zeros((h, w), bool)
    for ax in ARCH_X:
        m |= (np.abs(X - ax) <= 3.2) & (Y > 420) & (Y < ARCH_BASE_Y - NOTCH_R + 2)
        d = np.hypot(X - ax, Y - ARCH_BASE_Y)
        inside = (X >= ax) if ax == ARCH_X[0] else (X <= ax)
        m |= (np.abs(d - NOTCH_R) <= 3.2) & inside & (Y <= ARCH_BASE_Y + 1)
    m |= (np.abs(Y - ARCH_BASE_Y) <= 3.2) & (X > ARCH_X[0] + NOTCH_R - 3) & (X < ARCH_X[1] - NOTCH_R + 3)
    # the dome: traced geometry is within ~6 px of the drawn line, so use a wider band (gold test applied by caller)
    band = np.zeros((h, w), np.uint8)
    for pts in arch_dome_points():
        q = np.round((pts - [x0, y0]) * 4).astype(np.int32)
        cv2.polylines(band, [q], False, 1, 15, cv2.LINE_8, shift=2)
    return m | (band > 0)


def fill_holes(mask):
    h, w = mask.shape
    ff = np.zeros((h + 2, w + 2), np.uint8)
    ff[1:-1, 1:-1] = mask.astype(np.uint8)
    inv = (1 - ff).astype(np.uint8)
    flood = inv.copy()
    cv2.floodFill(flood, None, (0, 0), 0)  # outside region → 0; remaining 1s are holes
    return (ff[1:-1, 1:-1] > 0) | (flood[1:-1, 1:-1] > 0)


def cut(img_u8, box, bleed, seeds):
    x0, y0, x1, y1 = box
    I8 = img_u8[y0:y1, x0:x1].copy()

    # 1. erase the arch line behind the art (only gold-ish pixels in the exact band)
    lm = arch_line_mask(I8.shape[:2], x0, y0)
    r, g, b = [I8[..., i].astype(int) for i in range(3)]
    goldish = (r - b > 28) & (r > 120)
    lm = lm & goldish
    if lm.any():
        lm = cv2.dilate(lm.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        I8 = cv2.inpaint(I8, lm.astype(np.uint8), 4, cv2.INPAINT_TELEA)

    I = I8.astype(np.float32) / 255.0
    lab = to_lab(I)

    # 2. local paper colour
    border = np.concatenate([lab[:6].reshape(-1, 3), lab[-6:].reshape(-1, 3), lab[:, :6].reshape(-1, 3), lab[:, -6:].reshape(-1, 3)])
    paper0 = np.median(border, axis=0)
    d0 = np.linalg.norm(lab - paper0, axis=2)
    bg = (d0 < 4.5).astype(np.float32)
    bg = cv2.erode(bg, np.ones((5, 5), np.uint8))
    sig = 28
    num = cv2.GaussianBlur(I * bg[..., None], (0, 0), sig)
    den = cv2.GaussianBlur(bg, (0, 0), sig)[..., None]
    paper_rgb0 = np.median(I.reshape(-1, 3)[(d0 < 4.5).ravel()], axis=0)
    B = np.where(den > 0.02, num / np.maximum(den, 1e-6), paper_rgb0)
    # blend toward the global paper where we have little evidence
    wgt = np.clip(den / 0.25, 0, 1)
    B = B * wgt + paper_rgb0 * (1 - wgt)
    Blab = to_lab(B)

    # 3. soft key — lightness differences (white petals) are weighted up, chroma as is
    dL = lab[..., 0] - Blab[..., 0]
    da = lab[..., 1] - Blab[..., 1]
    db = lab[..., 2] - Blab[..., 2]
    dist = np.sqrt((dL * 1.15) ** 2 + da ** 2 + db ** 2)
    noise = np.median(dist[d0 < 4.5]) if (d0 < 4.5).any() else 1.0
    lo, hi = max(2.2, noise * 2.4), 11.0
    soft = smoothstep(lo, hi, dist)

    # 4. solid interior + subject components
    hard = (dist > 6.0).astype(np.uint8)
    hard = cv2.morphologyEx(hard, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    ell = lambda k: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    # small closing for the general silhouette (keeps the gaps between sprigs open) …
    closed = cv2.morphologyEx(hard, cv2.MORPH_CLOSE, ell(5))
    filled = fill_holes(closed > 0).astype(np.uint8)
    # … plus the large enclosed areas only a wide closing can seal (white rose heads, the veil)
    wide = cv2.morphologyEx(hard, cv2.MORPH_CLOSE, ell(CLOSE))
    holes = (fill_holes(wide > 0) & ~(wide > 0)).astype(np.uint8)
    nh, hl, hs, _ = cv2.connectedComponentsWithStats(holes, 8)
    for i in range(1, nh):
        if hs[i, cv2.CC_STAT_AREA] >= BIG_HOLE:
            filled |= cv2.dilate((hl == i).astype(np.uint8), ell(CLOSE))
    # group nearby bits (sprigs, buds) and keep the groups that touch the subject's seed boxes
    grouped = cv2.dilate(filled, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, lab_cc, stats, _ = cv2.connectedComponentsWithStats(grouped, 8)
    seedm = np.zeros_like(filled)
    for sx0, sy0, sx1, sy1 in seeds:
        seedm[max(0, sy0 - y0):max(0, sy1 - y0), max(0, sx0 - x0):max(0, sx1 - x0)] = 1
    keep = np.zeros_like(filled)
    for i in range(1, n):
        comp = lab_cc == i
        if (comp & (seedm > 0)).any() and stats[i, cv2.CC_STAT_AREA] > 60:
            keep[comp] = 1
    filled = filled & keep
    interior = cv2.erode(filled & keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))).astype(np.float32)
    interior = cv2.GaussianBlur(interior, (0, 0), 1.0)
    keep_soft = cv2.GaussianBlur(cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))).astype(np.float32), (0, 0), 3)
    alpha = np.maximum(soft, interior) * keep_soft

    # fade non-bleed crop edges to zero so nothing ends in a hard cut
    h, w = alpha.shape
    ramp = 6
    edge = np.ones_like(alpha)
    ys = np.arange(h)[:, None].astype(np.float32)
    xs = np.arange(w)[None, :].astype(np.float32)
    if 't' not in bleed: edge = np.minimum(edge, np.clip(ys / ramp, 0, 1))
    if 'b' not in bleed: edge = np.minimum(edge, np.clip((h - 1 - ys) / ramp, 0, 1))
    if 'l' not in bleed: edge = np.minimum(edge, np.clip(xs / ramp, 0, 1))
    if 'r' not in bleed: edge = np.minimum(edge, np.clip((w - 1 - xs) / ramp, 0, 1))
    alpha = alpha * edge
    alpha[alpha < 0.02] = 0

    # 5. un-mix colour from the paper
    a3 = np.maximum(alpha, 0.04)[..., None]
    F = B + (I - B) / a3
    F = np.clip(F, 0, 1)
    # where alpha is tiny the un-mixed colour is noise — use a blurred confident colour instead
    conf = (alpha > 0.5).astype(np.float32)
    Fc = cv2.GaussianBlur(F * conf[..., None], (0, 0), 3) / np.maximum(cv2.GaussianBlur(conf, (0, 0), 3), 1e-4)[..., None]
    t = smoothstep(0.04, 0.3, alpha)[..., None]
    has_conf = (cv2.GaussianBlur(conf, (0, 0), 3) > 0.01)[..., None]
    F = np.where(has_conf, F * t + Fc * (1 - t), F)

    rgba = np.dstack([np.clip(F, 0, 1), alpha])
    return (rgba * 255 + 0.5).astype(np.uint8)


def main():
    os.makedirs(OUT, exist_ok=True)
    src = np.asarray(Image.open(SRC).convert('RGB'))
    assert src.shape[:2] == (1536, 1024), 'expected the 1024×1536 reference PNG'
    total = 0
    for name, spec in LAYERS.items():
        rgba = cut(src, spec['box'], spec['bleed'], spec['seeds'])
        im = Image.fromarray(rgba, 'RGBA')
        path = os.path.join(OUT, f'{name}.webp')
        im.save(path, 'WEBP', quality=spec['q'], alpha_quality=90, method=6, exact=False)
        size = os.path.getsize(path)
        total += size
        print(f'{name:20s} {im.size[0]}×{im.size[1]}  {size / 1024:6.1f} KB')
    print(f'{"total":20s} {"":9s}  {total / 1024:6.1f} KB')


if __name__ == '__main__':
    main()
