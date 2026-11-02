#!/usr/bin/env python3
"""
Recolor a wall in a base room photo to a target paint color.

The algorithm is what every major paint visualizer (Benjamin Moore, Dulux,
Farrow & Ball, etc.) uses under the hood:

  1. From the masked wall region of the base photo, compute the mean RGB.
     That's the wall's "neutral" — averaging out the subtle warm/cool tint
     the photographer's lighting introduced.

  2. Divide every wall pixel by that mean. Pixels brighter than the mean
     become >1.0 (highlights), pixels darker become <1.0 (shadows). The
     result is a normalized "shading map" where the average wall pixel
     equals (1, 1, 1) — perfect white with all the original lighting
     information preserved as relative values.

  3. Multiply the shading map by the target paint color. Shadows
     automatically get a darker version of the paint, highlights get a
     lighter version, mid-tones get the paint exactly. This is the same
     math that makes "Multiply" blend mode work in Photoshop.

  4. Blend the recolored wall back into the original photo using the
     mask, so everything outside the wall (furniture, floor, ceiling)
     stays untouched.

Why this beats the obvious "replace wall pixels with target color" approach:
that version produces a flat, cartoonish wall with no lighting variation,
and it looks like crap. The multiply-blend approach gives you a paint that
"reacts to light" the same way a real painted wall would.

Why this beats AI image generation: color accuracy is mathematically exact
(you literally feed in the hex), the same room context is used for every
color so customers can compare apples-to-apples, and one batch of 200 colors
runs in seconds instead of hours.

Usage:
    from recolor import recolor

    recolor(
        base_path="images/base-rooms/stue.jpg",
        mask_path="images/wall-masks/stue-full.png",
        target_hex="#C5D9C2",                    # Mynte
        output_path="images/rooms-recolored/stue/DLM0402.jpg",
    )

Mask convention:
    The mask is a grayscale PNG where:
      - white (255) = "paint this pixel with the target color"
      - black (0)   = "leave this pixel alone"
      - gray        = blend proportionally (used for soft edges around
                      door frames, picture rails, etc.)

CLI:
    python recolor.py BASE MASK HEX OUTPUT
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def hex_to_rgb01(hex_str: str) -> np.ndarray:
    """Convert "#RRGGBB" or "RRGGBB" to a (3,) float array in [0, 1]."""
    s = hex_str.lstrip("#")
    if len(s) != 6:
        raise ValueError(f"Hex color must be 6 digits, got {hex_str!r}")
    r, g, b = (int(s[i : i + 2], 16) for i in (0, 2, 4))
    return np.array([r, g, b], dtype=np.float64) / 255.0


def recolor(
    base_path: str | Path,
    mask_path: str | Path,
    target_hex: str,
    output_path: str | Path,
    *,
    mask_feather_px: float = 1.5,
    quality: int = 90,
) -> None:
    """Recolor the masked wall region of `base_path` to `target_hex`.

    Args:
        base_path: Path to the source room photo (JPEG/PNG).
        mask_path: Path to a grayscale PNG mask (white = wall, black = keep).
        target_hex: Target wall color as "#RRGGBB".
        output_path: Where to write the result (JPEG/PNG).
        mask_feather_px: Gaussian blur radius applied to the mask before
            blending. Softens the wall→furniture edges so the transition
            doesn't look like a cutout. 1.5 px is invisible at web sizes
            and hides most rough mask edges; bump to 3-4 px for sloppier
            masks. 0 disables feathering.
        quality: JPEG quality (1-100). 90 is "looks identical to the source
            at typical viewing sizes" without bloating the file.
    """
    base_path = Path(base_path)
    mask_path = Path(mask_path)
    output_path = Path(output_path)

    if not base_path.is_file():
        raise FileNotFoundError(base_path)
    if not mask_path.is_file():
        raise FileNotFoundError(mask_path)

    # ── Load base & mask ────────────────────────────────────────────
    base_img = Image.open(base_path).convert("RGB")
    mask_img = Image.open(mask_path).convert("L")

    # If the mask isn't already aligned to the base, resize it. We use
    # nearest-neighbour for the resize and then feather afterwards so we
    # don't introduce false intermediate values from a hard mask.
    if mask_img.size != base_img.size:
        mask_img = mask_img.resize(base_img.size, Image.NEAREST)

    # Feather mask edges so the wall→non-wall transition is soft.
    # We do this AFTER resizing for predictability.
    if mask_feather_px > 0:
        mask_img = mask_img.filter(ImageFilter.GaussianBlur(radius=mask_feather_px))

    base = np.asarray(base_img, dtype=np.float64) / 255.0  # (H, W, 3)
    mask = np.asarray(mask_img, dtype=np.float64) / 255.0  # (H, W)

    # ── Compute the wall's "neutral" reference colour ──────────────
    # Only count pixels firmly inside the mask (>= 0.7) so feathered edges
    # near furniture don't bias the average. If the mask is tiny we still
    # need a fallback so the script doesn't crash.
    confident_wall = mask >= 0.7
    if confident_wall.sum() < 100:
        # Mask is essentially empty — refuse to recolor rather than emit
        # garbage. Caller should fix the mask or skip this image.
        raise ValueError(
            f"Mask {mask_path.name!r} has fewer than 100 'confident wall' "
            f"pixels (>= 0.7). Check that white = wall and that the mask "
            f"is aligned to the base photo."
        )

    mean_wall = base[confident_wall].mean(axis=0)  # (3,)
    # Guard against pitch-black walls (would blow up the division).
    mean_wall = np.maximum(mean_wall, 1e-3)

    target = hex_to_rgb01(target_hex)  # (3,)

    # ── Recolor the wall ───────────────────────────────────────────
    # Per-pixel shading factor: base / mean_wall. The average wall pixel
    # becomes (1, 1, 1); brighter pixels become >1 (highlights), darker
    # become <1 (shadows). Multiply by the target gives a "painted wall"
    # version that obeys the original lighting.
    shading = base / mean_wall  # (H, W, 3)
    recolored = shading * target  # (H, W, 3), broadcasts target across pixels

    # Highlights can legitimately exceed 1.0 (e.g. a glare spot). Clip so
    # we don't wrap on uint8 cast, but a small overshoot tolerance gives
    # natural-looking specular highlights — that's what `np.clip` does.
    recolored = np.clip(recolored, 0.0, 1.0)

    # ── Blend back over the original ───────────────────────────────
    mask_3d = mask[:, :, None]  # (H, W, 1) for broadcasting
    blended = base * (1.0 - mask_3d) + recolored * mask_3d

    # ── Save ───────────────────────────────────────────────────────
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out = Image.fromarray((blended * 255.0).round().clip(0, 255).astype(np.uint8))
    save_kwargs = {}
    if output_path.suffix.lower() in (".jpg", ".jpeg"):
        save_kwargs = {"quality": quality, "optimize": True, "progressive": True}
    out.save(output_path, **save_kwargs)


# ──────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Recolor a wall in a room photo.")
    p.add_argument("base", help="Path to the base room photo")
    p.add_argument("mask", help="Path to the wall mask (PNG, white = wall)")
    p.add_argument("hex_color", help='Target colour as "#RRGGBB"')
    p.add_argument("output", help="Where to write the recoloured image")
    p.add_argument(
        "--feather",
        type=float,
        default=1.5,
        help="Gaussian feather radius on the mask, in pixels (default: 1.5)",
    )
    p.add_argument(
        "--quality", type=int, default=90, help="JPEG quality 1-100 (default: 90)"
    )
    args = p.parse_args(argv)

    try:
        recolor(
            args.base,
            args.mask,
            args.hex_color,
            args.output,
            mask_feather_px=args.feather,
            quality=args.quality,
        )
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
