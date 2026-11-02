# Room recolor pipeline

Generates a photoreal preview of every paint color in every base room
photo, so the configurator can show "Aprikos in your bedroom" without
having to actually generate 1,000+ images in an AI tool. We generate
_one_ great base photo per room, mask the wall, and then math the
target paint color onto that masked area while preserving the
original lighting.

## What's here

```
scripts/room-recolor/
├── recolor.py       # core algorithm — one image at a time
├── batch.py         # loops over the full palette × rooms × variations
├── smoke_test.py    # synthetic scene that proves the algorithm works
└── _smoke/          # output of smoke_test.py — synthetic test images
```

The pipeline reads from:

```
docs/colors/dlm-colors-with-ncs.json    # 200 colors with hex
images/base-rooms/{room}.jpg            # 5 base photos
images/wall-masks/{room}-{variant}.png  # 10 masks
```

and writes to:

```
images/rooms-recolored/{room}/{variant}/DLM####.jpg
```

## Quick start

1. Install dependencies (one-time):
   ```bash
   pip install numpy Pillow
   ```

2. Run the smoke test to see the algorithm working on a synthetic scene:
   ```bash
   python scripts/room-recolor/smoke_test.py
   open scripts/room-recolor/_smoke/
   ```
   You should see one synthetic base photo and six recolored variants.
   The "vase" and "floor" must be identical across all six — only the
   wall changes.

3. Drop your base photos in `images/base-rooms/` (see filename list below).

4. Make the wall masks (see "Masking workflow" below) and drop them in
   `images/wall-masks/`.

5. Run the full batch:
   ```bash
   python scripts/room-recolor/batch.py
   ```
   First run: ~5 minutes for 2,000 images on a modern laptop.
   Re-runs only regenerate stale outputs (touch the base/mask file to
   force a specific room).

## Expected files

### Base photos (`images/base-rooms/`)

| File | Room | Aspect | Min size |
|---|---|---|---|
| `stue.jpg` | Living room | 16:9 | 1920×1080 |
| `sovevaerelse.jpg` | Bedroom | 16:9 | 1920×1080 |
| `badevaerelse.jpg` | Bathroom | 16:9 | 1920×1080 |
| `koekken.jpg` | Kitchen | 16:9 | 1920×1080 |
| `entre.jpg` | Hallway / entry | 16:9 | 1920×1080 |

Wall must be uniform off-white (NOT pure white), even lighting, no wall
art, smooth painted plaster. See the project's main thread for the
Midjourney prompts that produced these requirements.

### Masks (`images/wall-masks/`)

Two masks per room. White = wall pixels to recolor. Black = leave alone.

| File | Description |
|---|---|
| `stue-full.png` | All paintable walls in stue |
| `stue-accent.png` | Just one feature wall in stue |
| `sovevaerelse-full.png` | All paintable walls in sovevælse |
| `sovevaerelse-accent.png` | Just one feature wall |
| ...same pattern for the other 3 rooms | |

Same dimensions as the corresponding base photo. PNG only.

## Masking workflow

You need 10 masks (5 rooms × 2 variations). Three options, pick one:

### Option A — Photoshop / Affinity / GIMP, manual (~5 min/mask)

1. Open the base photo
2. Use the magic-wand or quick-selection tool, click on the wall, expand
   the selection to grab the whole wall
3. Refine the edges with the brush tool around door frames, picture
   rails, the floor line, etc.
4. Fill the selection with pure white on a black background
5. Export as `images/wall-masks/{room}-full.png`
6. Repeat for the accent-wall version (just one wall selected this time)

The `recolor.py` script feathers the mask edges by 1.5 px during the
blend, so you don't need to be obsessive about pixel-perfect edges —
"good enough" is fine.

### Option B — Photopea (free, in-browser, same workflow as A)

[photopea.com](https://www.photopea.com) is a free Photoshop clone in
the browser. Same magic-wand → fill-white-on-black → export PNG flow.
No download required.

### Option C — Segment Anything via Replicate API (one-click per mask)

If you'd rather not manually mask, we can route through Meta's
Segment-Anything Model. You give it the base photo + a click coordinate
("here's a pixel on the wall"), it returns a clean mask. Costs about
$0.001 per call. I haven't built this yet — let me know if you'd rather
go this route and I'll wire it up.

## Coloring conventions

- Color hex values come from `docs/colors/dlm-colors-with-ncs.json`.
  That file is the source of truth for the palette; if you add or
  rename a color there, the next `batch.py` run picks it up.
- Outputs are named by DLM id (`DLM0101.jpg`, `DLM0402.jpg`, …) so they
  remain stable across color renames.
- JPEG quality is 90 by default — looks identical to the source at
  configurator size but keeps file sizes around 150-300 KB.

## When you re-run

- Adding a new color: just re-run `python scripts/room-recolor/batch.py`.
  Existing outputs are skipped if they're newer than their inputs;
  new ones are created.
- Changing a base photo or mask: `batch.py` notices the mtime bump and
  regenerates every output that depends on the changed file.
- Force-regenerating everything: `python scripts/room-recolor/batch.py --force`.
- Testing a single room or just the full-wall variant during development:
  ```bash
  python scripts/room-recolor/batch.py --room stue --variation full --limit 10
  ```

## Quality bar checklist

Before signing off on a batch, eyeball ~5 outputs per room and ask:

- [ ] The wall area is _clearly_ the target color, not a tinted version
      of the original off-white
- [ ] Soft shadows (under shelves, in corners) are still visible
- [ ] Highlights from window light are visible as lighter versions of
      the paint color, not blown-out white spots
- [ ] Furniture, floor, ceiling, doors, and trim look pixel-identical
      to the base photo
- [ ] No hard edges along the wall→furniture boundary (if there are,
      bump `--feather` on the recolor call)

## Algorithm notes (for future maintainers)

The trick is "mean-wall-normalize then multiply":

1. From the masked wall pixels, compute the mean RGB. That's the wall's
   neutral — typically a warm off-white with subtle lighting bias.
2. Divide every wall pixel by that mean. Average wall pixels become
   `(1, 1, 1)`; shadows become `<1`; highlights become `>1`. The result
   is a normalized "shading map" where _all_ the lighting information
   is preserved as relative values and the chromatic bias is gone.
3. Multiply that shading map by the target paint color in normalized
   `[0, 1]` space. Average pixels become exactly the target color;
   shadows become a darker version of the target; highlights become a
   lighter version. This is the same math as Photoshop's "Multiply"
   blend mode.
4. Blend the recolored wall back over the original using the soft mask
   so non-wall pixels are byte-identical to the source.

This is what Benjamin Moore, Dulux, Farrow & Ball, etc. all do
internally for their visualizer products. We didn't invent anything —
we just shipped it.
