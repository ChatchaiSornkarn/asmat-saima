# Postcard art layers

Cut from `requirements/references/invite_postcard.png` (1024×1536) by `tools/crop-art.py`.
Regenerate with `python3 tools/crop-art.py` (needs numpy, opencv-python, Pillow with WebP).

Filenames are a contract: `src/postcard.js` loads them by these exact names.

| File | Source box in the PNG (x0, y0, x1, y1) | Size | Placement on the card |
|---|---|---|---|
| `roses-top-left.webp` | 0, 0, 336, 476 | 336×476 | top-left corner, bleeds off both edges |
| `roses-bottom-right.webp` | 716, 1088, 1024, 1536 | 308×448 | bottom-right corner, bleeds off both edges |
| `lantern-1.webp` | 788, 0, 892, 300 | 104×300 | left lantern; chain top at the card's top edge (sway pivot) |
| `lantern-2.webp` | 884, 0, 984, 380 | 100×380 | right lantern; chain top at the card's top edge (sway pivot) |
| `couple.webp` | 356, 1004, 694, 1464 | 338×460 | centred on the arch's base line |

All are WebP with a soft alpha matte (colour-distance keying against locally sampled paper, feathered,
colour un-mixed so edges carry no cream halo). The gold arch line behind the art was erased before cutting;
the arch is redrawn as SVG. Sizes are 1:1 with the reference PNG (the only source), which is ≈2× display
size on a desktop card and ≈1× on 3× phones.

Other assets here: `../favicon.svg` (rosette mark), `../apple-touch-icon.png` (180×180),
`../og-image.jpg` (1200×630 link preview, rendered by `tests/postcard/render-assets.py`).
