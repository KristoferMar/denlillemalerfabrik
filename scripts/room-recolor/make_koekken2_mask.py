#!/usr/bin/env python3
"""
Build the wall mask for koekken2.png.

koekken2 can't use auto_mask.py alone: the curtains, countertop and
ceiling are nearly the same greige tone as the wall, so pure LAB
thresholding grabs everything (66% coverage). This script combines:

  1. A hand-measured polygon for the wall plane (ends at the shadowed
     corner x=700; the dark corner band + curtains stay unpainted).
  2. A loose LAB wall test inside the polygon.
  3. Per-object boxes (faucet, glass jar + small boards, big cutting
     boards, flowers + vase) where a stricter test keeps the object
     silhouettes out of the mask while still painting the wall
     behind/around them.

Re-run after changing the base photo:
    python scripts/room-recolor/make_koekken2_mask.py
Writes: images/wall-masks/koekken2-full.png
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from auto_mask import rgb_to_lab, morph_close, largest_connected_component

REPO = Path(__file__).resolve().parents[2]
BASE = REPO / "images" / "base-rooms" / "koekken2.png"
OUT  = REPO / "images" / "wall-masks" / "koekken2-full.png"


def main() -> None:
    img = np.asarray(Image.open(BASE).convert("RGB"))
    H, W = img.shape[:2]
    lab = rgb_to_lab(img)
    L, ch = lab[..., 0], np.hypot(lab[..., 1], lab[..., 2])

    # Wall plane: top-left corner of frame to the ceiling line
    # (495,0)->(700,82), right edge at the shadowed corner x=700,
    # bottom edge along the backsplash (0,705)->(700,652).
    poly = [(0, 0), (495, 0), (700, 82), (700, 652), (0, 705)]
    pm = Image.new("L", (W, H), 0)
    ImageDraw.Draw(pm).polygon(poly, fill=255)
    inpoly = np.asarray(pm) > 127

    # Loose wall test — catches the shadowed wedge near the curtain.
    cand = inpoly & (L >= 55) & (L <= 91) & (ch <= 16.5)

    yy, xx = np.mgrid[0:H, 0:W]

    def box(x0, y0, x1, y1):
        return (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)

    # Object boxes: stricter wall test so silhouettes stay unpainted.
    # Note: the faucet's bright brushed metal is colorimetrically
    # identical to the wall (L~86, ch~4) — its brightest pixels do get
    # painted. Invisible with muted colors, slight tint with saturated.
    regions = [
        (box(155, 535, 295, 720), (ch <= 8.5) & (L >= 76)),   # faucet
        (box(420, 540, 575, 710), (ch <= 8.5) & (L >= 76)),   # jar + small boards
        (box(585, 455, 700, 710), (ch <= 13.5) & (L >= 56)),  # big boards + shadowed wall
        (box(0, 470, 170, 745),   (ch <= 9.5) & (L >= 72)),   # flowers + vase
    ]
    for reg, strict in regions:
        cand = np.where(reg, inpoly & strict, cand)

    cand = morph_close(cand.astype(bool), 2)
    cand = largest_connected_component(cand)

    m = Image.fromarray((cand * 255).astype("uint8"))
    m = m.filter(ImageFilter.GaussianBlur(1.5))
    m.save(OUT)
    cov = (np.asarray(m) > 100).mean()
    print(f"wrote {OUT} (coverage {cov:.1%})")


if __name__ == "__main__":
    main()
