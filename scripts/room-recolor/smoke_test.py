#!/usr/bin/env python3
"""
Synthetic smoke test for the recolor algorithm.

Builds a fake "room photo" with:
  • Bottom third = wood floor (a warm gradient)
  • Top two-thirds = wall, painted neutral off-white BUT with a soft
    radial darkening on one side (simulates light from a window) and a
    soft horizontal highlight band (simulates a light fixture). This
    gives the recolor algorithm something to preserve.
  • A "vase" rectangle in the foreground — the only object outside the
    mask, so we can verify it stays untouched.

Then runs the recolor against several colors from the real DLM palette
and writes the outputs into scripts/room-recolor/_smoke/. Open them in
order to confirm the shading is preserved across paint colors.

Run:
    python scripts/room-recolor/smoke_test.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from recolor import recolor


HERE       = Path(__file__).resolve().parent
REPO_ROOT  = HERE.parents[1]
OUT_DIR    = HERE / "_smoke"
COLOR_DATA = REPO_ROOT / "docs" / "colors" / "dlm-colors-with-ncs.json"

W, H = 1600, 900


def build_synthetic_room() -> tuple[Path, Path]:
    """Create a synthetic room photo + matching wall mask. Returns
    (photo_path, mask_path)."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Wall (top 2/3) ─────────────────────────────────────────────
    wall_h = int(H * 0.7)
    # Start with a uniform warm off-white
    wall = np.full((wall_h, W, 3), [243, 237, 226], dtype=np.float64)

    # Add a soft radial darkening from a virtual window on the left
    yy, xx = np.mgrid[0:wall_h, 0:W]
    cx, cy = W * 0.15, wall_h * 0.4
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / np.sqrt(W**2 + wall_h**2)
    # Pixels far from the "light source" get darker
    falloff = 1.0 - 0.35 * np.clip(dist * 1.8, 0, 1)
    wall *= falloff[:, :, None]

    # Subtle horizontal highlight near the top (simulating an off-screen
    # pendant lamp's bounce light).
    highlight = np.exp(-((yy - wall_h * 0.18) ** 2) / (2 * (wall_h * 0.08) ** 2))
    wall += highlight[:, :, None] * 8.0

    wall = np.clip(wall, 0, 255)

    # ── Floor (bottom 1/3) ─────────────────────────────────────────
    floor_h = H - wall_h
    yy_f = np.arange(floor_h, dtype=np.float64) / floor_h
    # Warm wood: dark at bottom, lighter near the wall
    floor_color_top    = np.array([180, 144, 96],  dtype=np.float64)
    floor_color_bottom = np.array([130, 96,  56],  dtype=np.float64)
    floor = (1 - yy_f[:, None]) * floor_color_top + yy_f[:, None] * floor_color_bottom
    floor = np.tile(floor[:, None, :], (1, W, 1))

    # ── Stitch wall + floor ────────────────────────────────────────
    photo = np.concatenate([wall, floor], axis=0).astype(np.uint8)
    photo_img = Image.fromarray(photo)

    # ── Vase / object that should NOT be recolored ─────────────────
    draw = ImageDraw.Draw(photo_img)
    vase_box = (W * 0.55, wall_h * 0.55, W * 0.62, wall_h)
    draw.ellipse(vase_box, fill=(70, 56, 42))
    # Plus a darker line on the floor where the vase meets ground (a
    # bit of grounding shadow).
    draw.ellipse(
        (W * 0.53, wall_h - 6, W * 0.64, wall_h + 6),
        fill=(45, 36, 28),
    )

    photo_path = OUT_DIR / "synthetic_base.jpg"
    photo_img.save(photo_path, quality=92)

    # ── Mask: white over the entire wall area, black on floor + vase ──
    mask_arr = np.zeros((H, W), dtype=np.uint8)
    mask_arr[:wall_h, :] = 255
    mask_img = Image.fromarray(mask_arr)
    # Punch the vase out of the mask (don't recolor the vase)
    draw = ImageDraw.Draw(mask_img)
    draw.ellipse(vase_box, fill=0)

    mask_path = OUT_DIR / "synthetic_mask.png"
    mask_img.save(mask_path)

    return photo_path, mask_path


def run() -> None:
    photo_path, mask_path = build_synthetic_room()
    print(f"Built synthetic base   → {photo_path.relative_to(REPO_ROOT)}")
    print(f"Built synthetic mask   → {mask_path.relative_to(REPO_ROOT)}")

    # Pick a handful of representative colors across the palette
    colors = json.loads(COLOR_DATA.read_text(encoding="utf-8"))
    by_id = {c["dlm_id"]: c for c in colors}
    sample_ids = [
        "DLM0101",  # Snehvid     — verifies near-white doesn't drift
        "DLM0402",  # Mynte       — light cool green, mid-tones
        "DLM0406",  # Pistacie    — yellower green
        "DLM0204",  # Dybhav      — saturated blue, hardest test (no green channel info to spare)
        "DLM0801",  # Rødler      — warm red, tests highlight rolloff
        "DLM0804",  # Mørk Jord   — very dark, tests shadow detail preservation
    ]
    sample_ids = [cid for cid in sample_ids if cid in by_id]

    for cid in sample_ids:
        c = by_id[cid]
        out = OUT_DIR / f"{cid}_{c['name_da'].replace(' ', '_')}.jpg"
        recolor(photo_path, mask_path, c["display_hex"], out)
        print(f"  recolored → {out.name}  ({c['name_da']}, {c['display_hex']})")

    print(f"\nOpen {OUT_DIR.relative_to(REPO_ROOT)}/ to compare. The vase + floor "
          f"should be identical across all outputs; only the wall should change.")


if __name__ == "__main__":
    run()
