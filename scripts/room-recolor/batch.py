#!/usr/bin/env python3
"""
Batch-recolor every base room photo × every paint color × every variation.

Reads:
  • docs/colors/dlm-colors-with-ncs.json — the 200-color palette
  • images/base-rooms/{stue,sovevaerelse,...}.jpg — base photos
  • images/wall-masks/{stue-full,stue-accent,...}.png — per-room masks

Writes:
  • images/rooms-recolored/{stue,...}/{full|accent}/DLM0101.jpg
    (one JPEG per color × room × variation)

Skip rules — re-running is cheap and safe:
  • If a base photo is missing, that room is skipped with a warning.
  • If a mask is missing, that variation is skipped with a warning.
  • If the output already exists and is newer than the inputs, it's
    reused. Pass --force to regenerate everything.

Usage:
    python batch.py                     # do everything, incrementally
    python batch.py --force             # regenerate every output
    python batch.py --room stue         # only one room
    python batch.py --variation full    # only one variation
    python batch.py --limit 5           # first 5 colours (dev / smoke test)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Iterable

from recolor import recolor


# ── Paths ──────────────────────────────────────────────────────────────
REPO_ROOT     = Path(__file__).resolve().parents[2]
COLOR_DATA    = REPO_ROOT / "docs" / "colors" / "dlm-colors-with-ncs.json"
BASE_DIR      = REPO_ROOT / "images" / "base-rooms"
MASK_DIR      = REPO_ROOT / "images" / "wall-masks"
OUTPUT_DIR    = REPO_ROOT / "images" / "rooms-recolored"


# ── Room + variation definitions ──────────────────────────────────────
# Each room key is the slug used in filenames; the human Danish label is
# only for log output. Add or remove rooms by changing this dict — the
# script will auto-skip rooms whose base photo / masks don't exist yet,
# so you can build out the matrix incrementally.
ROOMS = {
    "stue":         "Stue",
    "sovevaerelse": "Soveværelse",
    "badevaerelse": "Badeværelse",
    "koekken":      "Køkken",
    "entre":        "Entré",
}

# Each room has two recolor variations:
#   "full"   = the entire visible wall, all paintable surfaces
#   "accent" = a single accent wall (the others stay neutral)
# The mask file naming convention is "{room}-{variation}.png".
VARIATIONS = ("full", "accent")


def load_colors() -> list[dict]:
    """Read the 200-color palette JSON. Each entry has dlm_id, name_da, display_hex."""
    return json.loads(COLOR_DATA.read_text(encoding="utf-8"))


def output_is_fresh(output_path: Path, *inputs: Path) -> bool:
    """Return True if the output exists AND is newer than every input."""
    if not output_path.is_file():
        return False
    out_mtime = output_path.stat().st_mtime
    return all(out_mtime >= inp.stat().st_mtime for inp in inputs)


def iter_jobs(
    colors: list[dict],
    rooms: dict[str, str],
    variations: Iterable[str],
):
    """Yield (color, room_key, room_label, variation, base, mask, output) tuples
    for every (color, room, variation) combo where the base photo + mask exist.

    Rooms / variations without their input files are skipped with a single
    warning so the run keeps going. Returns nothing for combos we can't process.
    """
    for room_key, room_label in rooms.items():
        base_path = BASE_DIR / f"{room_key}.jpg"
        if not base_path.is_file():
            # Try .jpeg / .png as a courtesy
            for ext in (".jpeg", ".png"):
                alt = BASE_DIR / f"{room_key}{ext}"
                if alt.is_file():
                    base_path = alt
                    break
            else:
                print(f"  skip {room_label}: no base photo at {base_path.relative_to(REPO_ROOT)}")
                continue

        for variation in variations:
            mask_path = MASK_DIR / f"{room_key}-{variation}.png"
            if not mask_path.is_file():
                print(f"  skip {room_label}/{variation}: no mask at {mask_path.relative_to(REPO_ROOT)}")
                continue

            for color in colors:
                output_path = (
                    OUTPUT_DIR / room_key / variation / f"{color['dlm_id']}.jpg"
                )
                yield (
                    color, room_key, room_label, variation,
                    base_path, mask_path, output_path,
                )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--force", action="store_true", help="Regenerate even if output is fresh")
    p.add_argument("--room", action="append", default=None,
                   help="Only process this room (slug). Repeatable.")
    p.add_argument("--variation", choices=VARIATIONS, default=None,
                   help='Only "full" or only "accent" (default: both)')
    p.add_argument("--limit", type=int, default=None,
                   help="Process only the first N colors (smoke test).")
    args = p.parse_args(argv)

    # Filter rooms / variations
    rooms = ROOMS
    if args.room:
        rooms = {k: v for k, v in ROOMS.items() if k in args.room}
        unknown = set(args.room) - set(ROOMS)
        if unknown:
            print(f"error: unknown room(s): {sorted(unknown)}", file=sys.stderr)
            return 1
    variations = (args.variation,) if args.variation else VARIATIONS

    # Load palette
    colors = load_colors()
    if args.limit:
        colors = colors[: args.limit]
    print(f"Palette: {len(colors)} colors")
    print(f"Rooms:   {', '.join(rooms.values()) or '(none)'}")
    print(f"Variants: {', '.join(variations)}")
    print()

    jobs = list(iter_jobs(colors, rooms, variations))
    if not jobs:
        print("Nothing to do — no (room × variation) had both a base photo and a mask.")
        return 0

    # Process
    done = skipped = errored = 0
    started = time.time()
    last_room_label = None

    for color, room_key, room_label, variation, base, mask, output in jobs:
        if last_room_label != f"{room_label}/{variation}":
            print(f"\n── {room_label} / {variation} ─────────────────────────")
            last_room_label = f"{room_label}/{variation}"

        if not args.force and output_is_fresh(output, base, mask):
            skipped += 1
            continue

        try:
            recolor(base, mask, color["display_hex"], output)
            done += 1
            if done % 25 == 0:
                rate = done / max(time.time() - started, 1e-6)
                print(f"    {done} done ({rate:.1f}/s)")
        except Exception as e:
            errored += 1
            print(f"  ERROR {color['dlm_id']} {color['name_da']!r} on "
                  f"{room_label}/{variation}: {e}")

    elapsed = time.time() - started
    print()
    print(f"Done in {elapsed:.1f}s — {done} created, {skipped} skipped (fresh), {errored} errored.")
    if errored:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
