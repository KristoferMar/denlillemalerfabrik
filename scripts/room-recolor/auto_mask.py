#!/usr/bin/env python3
"""
Pure-Python auto-masking for room photos.

The pipeline assumes the kind of photo we're feeding it: a Scandinavian
interior shot with a uniform off-white wall and darker / more saturated
foreground objects (furniture, floor, decor). For that pattern, you can
get a usable mask without any ML:

  1. Convert RGB → LAB
       • L  ≈ perceived lightness (0…100)
       • a, b ≈ chromaticity; near zero means "neutral grey/white"
  2. Wall pixels are the ones that are both light (high L) AND nearly
     neutral (low |a| + |b|). A 2-D threshold pulls them out.
  3. Clean up the binary blob:
       • morphological close fills small holes (pixels of dust, a
         vase rim, the seam between two wall planes)
       • keep only the largest connected component so floor patches
         that happen to be light don't pollute the mask
       • soft Gaussian feather softens edges so the recolor blend
         doesn't show a hard cutout
  4. Save as PNG (8-bit grayscale; white = wall).

When this works it's faster than Photopea by an order of magnitude.
When it doesn't, the user can either (a) tweak the thresholds via CLI
flags for that room, or (b) fall back to a manual mask — recolor.py
doesn't care where the mask came from.

Usage:
    python auto_mask.py images/base-rooms/stue.png \\
                        images/wall-masks/stue-full.png

    # tweak when the auto-mask grabs too much / too little
    python auto_mask.py stue.png stue-full.png --min-L 70 --max-chroma 12

Run on every base photo (one full-wall mask each):
    python auto_mask.py --all
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[2]
BASE_DIR  = REPO_ROOT / "images" / "base-rooms"
MASK_DIR  = REPO_ROOT / "images" / "wall-masks"

ROOMS = ["stue", "sovevaerelse", "badevaerelse", "koekken", "entre"]


# ── Colour-space conversion ──────────────────────────────────────────
# We could pull skimage for this, but Pillow has zero dependencies and
# the conversion is straightforward. Using the standard sRGB → CIELAB
# conversion via the D65 white point.

def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    """sRGB gamma → linear RGB. Both in [0, 1]."""
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """rgb: (H, W, 3) uint8 → lab: (H, W, 3) float64
    L in [0, 100], a/b roughly in [-128, 127]."""
    rgb01 = rgb.astype(np.float64) / 255.0
    lin   = srgb_to_linear(rgb01)

    # Linear-RGB to XYZ (D65)
    M = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ])
    xyz = lin @ M.T

    # Normalize by D65 white point
    wp = np.array([0.95047, 1.0, 1.08883])
    xyz /= wp

    # f(t) per CIELAB
    eps  = 216 / 24389
    kappa = 24389 / 27
    fxyz = np.where(xyz > eps, np.cbrt(xyz), (kappa * xyz + 16) / 116)

    L = 116 * fxyz[..., 1] - 16
    a = 500 * (fxyz[..., 0] - fxyz[..., 1])
    b = 200 * (fxyz[..., 1] - fxyz[..., 2])

    return np.stack([L, a, b], axis=-1)


# ── Connected-components (no scipy dep) ──────────────────────────────
# A flood-fill-based labeling. Slow on huge images but fine at 1920×1080.

def largest_connected_component(mask: np.ndarray) -> np.ndarray:
    """mask: bool (H, W). Returns: bool (H, W) with only the largest
    4-connected blob kept."""
    H, W = mask.shape
    seen  = np.zeros_like(mask, dtype=np.int32)
    label = 0
    best_label, best_size = 0, 0
    # 4-connectivity neighbours
    nbrs = ((-1, 0), (1, 0), (0, -1), (0, 1))

    for y in range(H):
        for x in range(W):
            if not mask[y, x] or seen[y, x]:
                continue
            label += 1
            # iterative flood fill
            stack = [(y, x)]
            size  = 0
            while stack:
                cy, cx = stack.pop()
                if seen[cy, cx]:
                    continue
                seen[cy, cx] = label
                size += 1
                for dy, dx in nbrs:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                        stack.append((ny, nx))
            if size > best_size:
                best_size = size
                best_label = label

    return seen == best_label


# ── Morphological close (binary dilate then erode) ──────────────────
# Done by Pillow filters on a tiny binary image, with the right radius
# inferred from the source image dimensions.

def morph_close(mask: np.ndarray, radius: int) -> np.ndarray:
    img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    img = img.filter(ImageFilter.MaxFilter(size=radius * 2 + 1))  # dilate
    img = img.filter(ImageFilter.MinFilter(size=radius * 2 + 1))  # erode
    return np.asarray(img) > 127


# ── Main ─────────────────────────────────────────────────────────────

def auto_mask(
    src_path: Path,
    out_path: Path,
    *,
    min_L: float = 35.0,
    max_L: float = 95.0,
    max_chroma: float = 14.0,
    max_wall_y_frac: float = 0.80,
    close_radius_pct: float = 0.4,
    feather_px: float = 2.0,
    verbose: bool = False,
) -> None:
    """
    Args:
        src_path: room photo
        out_path: where the mask PNG goes
        min_L: minimum LAB-L for a wall pixel. Lower = catches walls in
            deep shadow but risks pulling in dark floor / furniture.
            35 lets the shadow side of a typical MJ wall through.
        max_L: maximum LAB-L for a wall pixel. Direct sunlight on
            floors / window panes has L close to 100 and trips the
            "low chroma" filter (sunlight is white = neutral). 95 cuts
            that off without rejecting reasonable wall highlights.
        max_chroma: maximum |a|+|b| chroma for a wall pixel. Lower =
            stricter, only near-grey/neutral admitted. 14 fits the
            typical warm off-white wall paint without letting in oak
            floors (chroma ≈ 25-30).
        max_wall_y_frac: geometric prior — pixels whose y-coordinate
            is past this fraction of the image height are assumed to
            be floor and excluded. Walls are essentially always in the
            top 80% of these MJ-generated interiors. 0.80 is generous;
            0.65 if you want to be aggressive about excluding floor.
        close_radius_pct: morphological-close radius as a fraction of
            the image's shorter dimension. Fills small holes (vase rim,
            pendant cable) without bridging across furniture.
        feather_px: Gaussian feather radius on the final mask. Soft
            edges hide rough mask outlines in the recolor blend.
    """
    img_pil = Image.open(src_path).convert("RGB")
    H, W = img_pil.height, img_pil.width
    img = np.asarray(img_pil)

    lab = rgb_to_lab(img)
    L  = lab[..., 0]
    a  = lab[..., 1]
    b  = lab[..., 2]
    chroma = np.sqrt(a * a + b * b)

    # Wall candidate = neutral chromaticity AND lightness within a band
    # that captures both shadowed walls and reasonable highlights, but
    # NOT direct sunlight (which is white, low-chroma, and would pass
    # the chroma filter otherwise).
    candidate = (L >= min_L) & (L <= max_L) & (chroma <= max_chroma)

    # Geometric prior — drop pixels in the bottom of the frame so the
    # floor (which can also be light + low-chroma at the edge of the
    # mask region) gets excluded.
    if max_wall_y_frac < 1.0:
        cutoff_y = int(round(H * max_wall_y_frac))
        candidate[cutoff_y:, :] = False

    if verbose:
        pct = candidate.mean() * 100
        print(f"  {src_path.name}: {pct:.1f}% pixels match "
              f"L∈[{min_L},{max_L}] chroma≤{max_chroma} y<{max_wall_y_frac:.2f}H")

    if not candidate.any():
        raise ValueError(
            f"No pixels matched the wall threshold "
            f"(L∈[{min_L},{max_L}], chroma≤{max_chroma}). "
            f"The image may be unusually lit — try lowering --min-L."
        )

    # Fill small holes — e.g. a vase rim, a pendant cable.
    radius = max(1, int(round(min(H, W) * close_radius_pct / 100)))
    closed = morph_close(candidate, radius)

    # Keep only the biggest blob — drops any "wall-ish" pixels on the
    # floor or on furniture surfaces.
    wall = largest_connected_component(closed)

    # Feather the binary mask so the recolor blend is soft.
    mask_u8 = (wall.astype(np.uint8) * 255)
    mask_pil = Image.fromarray(mask_u8, mode="L")
    if feather_px > 0:
        mask_pil = mask_pil.filter(ImageFilter.GaussianBlur(radius=feather_px))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    mask_pil.save(out_path)
    if verbose:
        wall_pct = wall.mean() * 100
        try:
            shown = out_path.resolve().relative_to(REPO_ROOT)
        except ValueError:
            shown = out_path
        print(f"  → {shown}  ({wall_pct:.1f}% of frame is wall)")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Auto-mask the wall in a room photo.")
    p.add_argument("src", nargs="?", help="Source photo path")
    p.add_argument("dst", nargs="?", help="Output PNG path")
    p.add_argument("--all", action="store_true",
                   help="Process every base photo in images/base-rooms/. "
                        "Writes images/wall-masks/{room}-full.png for each.")
    p.add_argument("--min-L", type=float, default=35.0,
                   help="Min LAB-L for a wall pixel (default: 35)")
    p.add_argument("--max-L", type=float, default=95.0,
                   help="Max LAB-L for a wall pixel — caps direct sunlight (default: 95)")
    p.add_argument("--max-chroma", type=float, default=14.0,
                   help="Max LAB chroma for a wall pixel (default: 14)")
    p.add_argument("--max-y", type=float, default=0.80,
                   help="Drop pixels past this fraction of the frame height "
                        "(0.80 = bottom 20%% is assumed to be floor)")
    p.add_argument("--close-pct", type=float, default=0.4,
                   help="Morphological close radius as %% of min(H,W) (default: 0.4)")
    p.add_argument("--feather", type=float, default=2.0,
                   help="Gaussian feather radius in pixels (default: 2)")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    if args.all:
        for room in ROOMS:
            # Find the base photo (jpg/jpeg/png)
            for ext in (".jpg", ".jpeg", ".png"):
                src = BASE_DIR / f"{room}{ext}"
                if src.is_file():
                    break
            else:
                print(f"  skip {room}: no base photo in {BASE_DIR.relative_to(REPO_ROOT)}")
                continue
            dst = MASK_DIR / f"{room}-full.png"
            try:
                auto_mask(src, dst,
                          min_L=args.min_L, max_L=args.max_L,
                          max_chroma=args.max_chroma,
                          max_wall_y_frac=args.max_y,
                          close_radius_pct=args.close_pct,
                          feather_px=args.feather,
                          verbose=True)
            except Exception as e:
                print(f"  ERROR on {room}: {e}")
        return 0

    if not args.src or not args.dst:
        p.error("either --all, or both src and dst paths")

    auto_mask(
        Path(args.src), Path(args.dst),
        min_L=args.min_L, max_L=args.max_L,
        max_chroma=args.max_chroma,
        max_wall_y_frac=args.max_y,
        close_radius_pct=args.close_pct, feather_px=args.feather,
        verbose=args.verbose,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
