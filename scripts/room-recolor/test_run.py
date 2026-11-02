#!/usr/bin/env python3
"""
Test-run wrapper for new base-room photos before they go live.

Scans `images/base-rooms/` for any `<room>-test.{png,jpg,jpeg}`, generates
a fresh wall mask at `images/wall-masks/<room>-test-full.png`, then runs
recolor.py against 5 stress-test paint colors and writes the results to
`scripts/room-recolor/_test_runs/<room>/`.

The production `images/base-rooms/<room>.png` and per-color outputs are
never touched. Once a test passes the eyeball check, promote it:

    mv images/base-rooms/<room>-test.png       images/base-rooms/<room>.png
    mv images/wall-masks/<room>-test-full.png  images/wall-masks/<room>-full.png
    python3 scripts/room-recolor/batch.py --room <room> --force

Usage:
    python3 scripts/room-recolor/test_run.py            # all -test images
    python3 scripts/room-recolor/test_run.py --clean    # wipe _test_runs/ first
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from recolor import recolor


REPO_ROOT = Path(__file__).resolve().parents[2]
BASE_DIR  = REPO_ROOT / "images" / "base-rooms"
MASK_DIR  = REPO_ROOT / "images" / "wall-masks"
OUT_ROOT  = Path(__file__).parent / "_test_runs"
AUTO_MASK = Path(__file__).parent / "auto_mask.py"

# Stress-test colors — each one pokes a different part of the algorithm.
# Tuple: (DLM code, ASCII-safe label for the filename, target hex).
#   • near-white  — should look almost identical to the base photo
#   • very dark   — tests shadow preservation under low-value paint
#   • saturated   — tests color fidelity on bright mid-value paint
#   • muted grey  — typical Scandi-neutral case, no chroma to defend
#   • soft green  — most common Danish nordic shade in the catalogue
TEST_COLORS = [
    ("DLM0101", "Snehvid",     "#FAFAFA"),
    ("DLM1101", "SoftBlack",   "#2B2B2B"),
    ("DLM1003", "KlarOrange",  "#E96A1F"),
    ("DLM0308", "Tinngraa",    "#9E9E9C"),
    ("DLM0414", "Lyngblad",    "#A8B59A"),
]

IMAGE_EXTS = (".png", ".jpg", ".jpeg")


# ── Per-room mask refinement ───────────────────────────────────────────
# auto_mask.py uses a LAB threshold ("light AND neutral = wall") that
# nails the easy cases but has two predictable failure modes:
#
#   1. Blown-out window glass passes the threshold trivially (it's the
#      lightest, most neutral region in the whole frame) and gets
#      painted as wall — which looks broken since the glass should
#      show whatever's outside, not the new wall color.
#
#   2. White skirting / baseboard above the floor sits in tonal limbo
#      between wall and floor; the threshold cuts it off, leaving a
#      visible white stripe between the painted wall and the floor.
#
# Both failures are room-layout-dependent, not algorithm-tuning
# problems, so we fix them per room here with a small declarative
# config + two reusable refinement primitives.
#
# Coordinates are stored as fractions of width/height so the config
# survives the test image being resized or re-cropped.

ROOM_REFINEMENTS = {
    "badevaerelse": {
        # Window casing + 6 glass panes, left edge of the frame.
        "exclude_rects_rel": [
            (0.000, 0.000, 0.158, 0.711),
        ],
        # Walk each wall column downward from its current bottom; pixels
        # brighter than `brightness_min` get added to the mask, dark
        # wood floor stops the walk. Caps total extension so a column
        # that opens onto floor never paints arbitrarily deep.
        "extend_to_baseboard": {
            "max_extend_frac": 0.10,
            "brightness_min": 140,
            # Light oak floor pixels are brighter than `brightness_min`, so
            # the per-pixel walk alone doesn't stop at the floor — this
            # hard ceiling does. Sits just past the baseboard top so the
            # full skirting gets painted without bleeding onto the floor.
            "floor_y_frac": 0.865,
        },
    },
}


def _exclude_rect_rel(mask_arr: np.ndarray, rect_rel: tuple) -> None:
    """Set the rectangle (x1, y1, x2, y2) in [0,1] coords to black (not-wall)."""
    H, W = mask_arr.shape
    x1, y1, x2, y2 = rect_rel
    mask_arr[
        int(y1 * H): int(y2 * H),
        int(x1 * W): int(x2 * W),
    ] = 0


def _extend_to_baseboard(mask_arr: np.ndarray, img_arr: np.ndarray,
                         max_extend_frac: float, brightness_min: int,
                         floor_y_frac: float = 1.0) -> None:
    """For each column with wall pixels, walk down from the lowest wall pixel
    extending the mask through bright pixels (the baseboard) and stopping
    at the first dark pixel (the wood floor).

    Three independent stops; the walk halts whichever comes first:
      • brightness_min  — local stop, halts at the first dark pixel
      • max_extend_frac — distance stop, prevents arbitrary deep walks
                          in columns that happen to be all-bright
                          (eg. floor reflections under a window)
      • floor_y_frac    — absolute stop, hard floor-line ceiling for
                          rooms with light-oak floors where the floor
                          itself is bright enough to pass brightness_min
    """
    H, W = mask_arr.shape
    max_extend = int(max_extend_frac * H)
    floor_y = int(floor_y_frac * H)
    brightness = img_arr.mean(axis=2)  # (H, W) grayscale-ish
    for x in range(W):
        col = mask_arr[:, x] > 128
        if not col.any():
            continue
        bottom = int(np.where(col)[0].max())
        # Three caps: distance, hard floor line, image bounds.
        cap = min(bottom + 1 + max_extend, floor_y, H)
        for y in range(bottom + 1, cap):
            if brightness[y, x] >= brightness_min:
                mask_arr[y, x] = 255
            else:
                break  # hit floor / other dark surface


def refine_mask(room: str, mask_path: Path, image_path: Path) -> bool:
    """Apply ROOM_REFINEMENTS[room] in place to mask_path. Returns True if
    refinements ran (False if no config exists for this room)."""
    cfg = ROOM_REFINEMENTS.get(room)
    if not cfg:
        return False

    mask_img = Image.open(mask_path).convert("L")
    img_arr  = np.array(Image.open(image_path).convert("RGB"))
    mask_arr = np.array(mask_img)
    if mask_arr.shape[:2] != img_arr.shape[:2]:
        sys.stderr.write(
            f"  WARN: mask {mask_arr.shape[:2]} != image {img_arr.shape[:2]} — skipping refine\n"
        )
        return False

    for rect_rel in cfg.get("exclude_rects_rel", []):
        _exclude_rect_rel(mask_arr, rect_rel)
    extend_cfg = cfg.get("extend_to_baseboard")
    if extend_cfg:
        _extend_to_baseboard(
            mask_arr, img_arr,
            max_extend_frac=extend_cfg.get("max_extend_frac", 0.08),
            brightness_min=extend_cfg.get("brightness_min", 140),
            floor_y_frac=extend_cfg.get("floor_y_frac", 1.0),
        )

    Image.fromarray(mask_arr, mode="L").save(mask_path)
    return True


def discover_test_images() -> list[Path]:
    """Return every base-room photo whose stem ends with `-test`."""
    if not BASE_DIR.is_dir():
        return []
    return sorted(
        p for p in BASE_DIR.iterdir()
        if p.is_file()
        and p.stem.endswith("-test")
        and p.suffix.lower() in IMAGE_EXTS
    )


def process(image: Path, keep_mask: bool = False) -> bool:
    """Run mask + 5 recolors for one test image. Returns True on success.

    When `keep_mask` is True, the auto_mask + refinement steps are
    skipped and whatever mask already exists at the expected path is
    reused — the workflow for hand-editing in Photopea between runs.
    """
    slug = image.stem                # e.g. "badevaerelse-test"
    room = slug[: -len("-test")]     # "badevaerelse"
    mask = MASK_DIR / f"{slug}-full.png"
    outdir = OUT_ROOT / room
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"\n── {room} ─────────────────────────────────────────")
    print(f"  source: {image.relative_to(REPO_ROOT)}")

    if keep_mask:
        if not mask.is_file():
            sys.stderr.write(
                f"  ERROR: --keep-mask set but {mask.relative_to(REPO_ROOT)} "
                f"does not exist. Run without --keep-mask first to generate it.\n"
            )
            return False
        print(f"  mask:   {mask.relative_to(REPO_ROOT)} (kept as-is)")
    else:
        # auto_mask.py exits non-zero on failure; surface its stderr if so.
        print(f"  mask:   {mask.relative_to(REPO_ROOT)}")
        res = subprocess.run(
            [sys.executable, str(AUTO_MASK), str(image), str(mask)],
            capture_output=True, text=True,
        )
        if res.returncode != 0:
            sys.stderr.write(
                f"  ERROR: auto_mask failed ({res.returncode})\n{res.stderr}\n"
            )
            return False

        if refine_mask(room, mask, image):
            print(f"  refine: applied {room}-specific cleanup")

    for code, label, hex_color in TEST_COLORS:
        out_path = outdir / f"{code}-{label}.jpg"
        try:
            recolor(str(image), str(mask), hex_color, str(out_path))
        except Exception as e:
            sys.stderr.write(f"  ERROR: {code} {label} {hex_color}: {e}\n")
            return False
        print(f"    wrote {out_path.name}  ({hex_color})")
    return True


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--clean", action="store_true",
                   help="Wipe scripts/room-recolor/_test_runs/ before running.")
    p.add_argument("--keep-mask", action="store_true",
                   help="Skip auto_mask + refine, reuse the existing "
                        "<room>-test-full.png as-is. Use after hand-editing.")
    args = p.parse_args(argv)

    if args.clean and OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
        print(f"removed {OUT_ROOT.relative_to(REPO_ROOT)}/")

    tests = discover_test_images()
    if not tests:
        print(f"No <room>-test.{{png,jpg,jpeg}} files in "
              f"{BASE_DIR.relative_to(REPO_ROOT)}/.")
        print("Drop a test image in there (e.g. badevaerelse-test.png) and re-run.")
        return 0

    print(f"Found {len(tests)} test image(s):")
    for t in tests:
        print(f"  • {t.name}")

    failed = 0
    for image in tests:
        if not process(image, keep_mask=args.keep_mask):
            failed += 1

    OUT_ROOT.mkdir(exist_ok=True)
    print(f"\nResults at: {OUT_ROOT.relative_to(REPO_ROOT)}/")
    print(f"Open with:  open {OUT_ROOT.relative_to(REPO_ROOT)}/")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
