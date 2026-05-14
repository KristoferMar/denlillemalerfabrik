#!/usr/bin/env python3
"""
generate-colors.py — DLM palette expansion 32 → 200.

For each of the 8 existing color families, the 4 hand-curated anchor
colors (codes FF01–FF04) are kept exactly as-is. This script computes
21 additional shades per family (codes FF05–FF25) by interpolating
hue and saturation between the anchors in HSL space along a lightness
ramp that slightly extends past the anchor range.

The 21 friendly names per family are hand-curated; the script pairs
them in order (lightest → darkest) to the generated lightness ramp.

Output: prints the full 200-row palette as markdown to stdout.

Run: python3 scripts/generate-colors.py > docs/colors.md
"""

import colorsys

# Each family: 4 anchors (code, name, hex), then 21 new names sorted
# lightest → darkest, paired in order to the generated lightness ramp.

FAMILIES = [
    {
        "id": "01",
        "label": "Whites",
        "anchors": [
            ("DLM0101", "Snehvid",   "#FAFAFA"),
            ("DLM0102", "Porcelæn",  "#F5F0EB"),
            ("DLM0103", "Kalkhvid",  "#EDE8E0"),
            ("DLM0104", "Cremehvid", "#F5EDD6"),
        ],
        "new_names": [
            "Frost", "Skumhvid", "Mælkehvid", "Pudderhvid", "Bomuld",
            "Lilje", "Hørvid", "Måneskin", "Perlemor", "Lærred",
            "Linned", "Champagne", "Pergament", "Fløde", "Antikhvid",
            "Vanilje", "Marsipan", "Mandel", "Tåge", "Daggry",
            "Magnolia",
        ],
    },
    {
        "id": "02",
        "label": "Blues",
        "anchors": [
            ("DLM0201", "Isklar",    "#E4EEF2"),
            ("DLM0202", "Himmellys", "#C8DBE4"),
            ("DLM0203", "Havbrise",  "#A3C1CE"),
            ("DLM0204", "Dybhav",    "#5B8FA3"),
        ],
        "new_names": [
            "Frostblå", "Polarlys", "Morgentåge", "Pudderblå", "Sommerhimmel",
            "Skyblå", "Akvamarin", "Lagune", "Søblå", "Vandblå",
            "Tidevand", "Aftenhav", "Skumring", "Stjerneblå", "Nordlys",
            "Saphir", "Petroleum", "Marineblå", "Indigo", "Midnatsblå",
            "Klippeblå",
        ],
    },
    {
        "id": "03",
        "label": "Greys",
        "anchors": [
            ("DLM0301", "Sølvtåge",  "#D6D8D6"),
            ("DLM0302", "Drivsten",  "#B8B5AE"),
            ("DLM0303", "Granitgrå", "#908D86"),
            ("DLM0304", "Skifergrå", "#6B6B6B"),
        ],
        "new_names": [
            "Perlegrå", "Asketåge", "Duegrå", "Tinngrå", "Måneaske",
            "Stensand", "Cementgrå", "Flintegrå", "Mosgrå", "Tinplade",
            "Bly", "Stormvejr", "Skygge", "Røggrå", "Klippe",
            "Tordensky", "Skorstensgrå", "Jerngrå", "Antrasit", "Vulkangrå",
            "Kullgrå",
        ],
    },
    {
        "id": "04",
        "label": "Greens",
        "anchors": [
            ("DLM0401", "Morgendug", "#E2EBE0"),
            ("DLM0402", "Mynte",     "#C5D9C2"),
            ("DLM0403", "Salvie",    "#A3B5A0"),
            ("DLM0404", "Skovdybde", "#6B7F68"),
        ],
        "new_names": [
            "Eng", "Pistacie", "Linde", "Bambusgrøn", "Birkeløv",
            "Kløver", "Eukalyptus", "Selleri", "Æbleskind", "Lyngblad",
            "Bregne", "Oliven", "Tang", "Mosgrøn", "Cypres",
            "Fyrretræ", "Skovsø", "Granskygge", "Mørkmos", "Tundra",
            "Mørkbregne",
        ],
    },
    {
        "id": "05",
        "label": "Warm Neutrals",
        "anchors": [
            ("DLM0501", "Elfenben", "#F2EBE0"),
            ("DLM0502", "Havremel", "#E8DCC8"),
            ("DLM0503", "Nougat",   "#CDBA9E"),
            ("DLM0504", "Valnød",   "#8B7355"),
        ],
        "new_names": [
            "Hvedemel", "Vaniljecreme", "Rugmel", "Mandelmel", "Halm",
            "Hessian", "Hampegul", "Lærke", "Birk", "Honning",
            "Honningkage", "Kaffefløde", "Sahara", "Skind", "Kanel",
            "Muskat", "Mocca", "Tørv", "Mørkkanel", "Kakaopulver",
            "Espresso",
        ],
    },
    {
        "id": "06",
        "label": "Yellows / Sands",
        "anchors": [
            ("DLM0601", "Strandlys", "#F0E8D8"),
            ("DLM0602", "Klitsand",  "#DDD0B5"),
            ("DLM0603", "Ravgul",    "#C8A84E"),
            ("DLM0604", "Karamel",   "#A67B4B"),
        ],
        "new_names": [
            "Sommersand", "Strandlinje", "Sandklit", "Hvedekorn", "Ørkensand",
            "Smør", "Aksgul", "Æbleguld", "Solskin", "Citron",
            "Solsikke", "Solgul", "Honninggul", "Ravstøv", "Aprikos",
            "Sennep", "Sennepskorn", "Guldokker", "Bronzegul", "Møntguld",
            "Okkerbrun",
        ],
    },
    {
        "id": "07",
        "label": "Pinks / Coppers",
        "anchors": [
            ("DLM0701", "Rosendug",   "#F0DDD8"),
            ("DLM0702", "Solnedgang", "#E0A890"),
            ("DLM0703", "Kobber",     "#B87548"),
            ("DLM0704", "Terracotta", "#C06840"),
        ],
        "new_names": [
            "Skumrosa", "Pudderrosa", "Magnoliarosa", "Kirsebærblomst", "Lyserosa",
            "Antikrosa", "Rosenkind", "Tørket Rose", "Pæonrosa", "Fersken",
            "Lakserosa", "Korall", "Aprikosflamme", "Mandarin", "Kobberglans",
            "Henna", "Klipperose", "Lerokker", "Brændt Kobber", "Rust",
            "Mørkkobber",
        ],
    },
    {
        "id": "08",
        "label": "Reds / Browns",
        "anchors": [
            ("DLM0801", "Rødler",      "#B85C42"),
            ("DLM0802", "Murstensrød", "#9B4332"),
            ("DLM0803", "Kastanje",    "#6E3428"),
            ("DLM0804", "Mørk Jord",   "#4A2820"),
        ],
        "new_names": [
            "Glødende Mursten", "Karminrød", "Tørret Mursten", "Granatæblerød", "Cognac",
            "Bordeaux", "Vinrød", "Burgunder", "Mahogni", "Jordrød",
            "Egetræ", "Brændt Ler", "Whiskeybrun", "Kobberbrun", "Tobaksbrun",
            "Skovjord", "Klippejord", "Lædermørk", "Mørkebrun", "Bækjord",
            "Sortkaffe",
        ],
    },
]


def hex_to_hls(hex_str):
    """#RRGGBB → (h, l, s) tuple, each in [0, 1]."""
    h = hex_str.lstrip("#")
    r = int(h[0:2], 16) / 255
    g = int(h[2:4], 16) / 255
    b = int(h[4:6], 16) / 255
    return colorsys.rgb_to_hls(r, g, b)


def hls_to_hex(h, l, s):
    """(h, l, s) → #RRGGBB string."""
    r, g, b = colorsys.hls_to_rgb(h, max(0.0, min(1.0, l)), max(0.0, min(1.0, s)))
    return "#{:02X}{:02X}{:02X}".format(
        round(r * 255), round(g * 255), round(b * 255)
    )


def interpolate_h(h1, h2, t):
    """Linear interpolation of hue, handling the wraparound at 0/1."""
    if abs(h1 - h2) < 0.5:
        return h1 + t * (h2 - h1)
    # Wraparound: take the shorter path around the hue circle.
    if h1 > h2:
        h2_adj = h2 + 1.0
        result = h1 + t * (h2_adj - h1)
    else:
        h1_adj = h1 + 1.0
        result = h1_adj + t * (h2 - h1_adj)
    return result % 1.0


def generate_family(family):
    """Return a list of 25 (code, name, hex) rows for this family, in code order."""
    fid = family["id"]
    anchors = family["anchors"]
    new_names = family["new_names"]

    assert len(new_names) == 21, f"Family {fid} needs exactly 21 new names, got {len(new_names)}"

    # Anchors in HLS, with metadata.
    anchor_data = []
    for code, name, hex_val in anchors:
        h, l, s = hex_to_hls(hex_val)
        anchor_data.append({"code": code, "name": name, "hex": hex_val, "h": h, "l": l, "s": s})

    # Sort anchors by lightness for interpolation.
    sorted_anchors = sorted(anchor_data, key=lambda a: a["l"])
    L_anchors = [a["l"] for a in sorted_anchors]
    L_min_anchor = min(L_anchors)
    L_max_anchor = max(L_anchors)

    # Target lightness ramp: extend slightly past the anchor range on both ends.
    # Cap extensions so we never overshoot [0.03, 0.97].
    L_top = min(0.97, L_max_anchor + 0.04)
    L_bottom = max(0.04, L_min_anchor - max(0.06, L_min_anchor * 0.20))

    # Build 21 target L values evenly distributed, avoiding L values
    # too close to any existing anchor.
    n_new = 21
    n_total_targets = n_new + len(anchors) + 4  # oversample to give room for skipping
    raw_candidates = [
        L_top - (L_top - L_bottom) * i / (n_total_targets - 1)
        for i in range(n_total_targets)
    ]
    # Filter out candidates within MIN_GAP of any anchor lightness.
    MIN_GAP = (L_top - L_bottom) / (n_total_targets * 2)
    filtered = [
        c for c in raw_candidates
        if all(abs(c - aL) > MIN_GAP for aL in L_anchors)
    ]
    # Now sub-sample evenly to exactly n_new.
    if len(filtered) >= n_new:
        step = (len(filtered) - 1) / (n_new - 1)
        chosen = [filtered[round(i * step)] for i in range(n_new)]
    else:
        chosen = filtered  # shouldn't happen with oversampling

    # Pair each chosen lightness with a name (names are sorted lightest → darkest).
    new_rows = []
    for idx, L_target in enumerate(chosen):
        # Find bracketing anchors for interpolation.
        prev_a = None
        next_a = None
        for a in sorted_anchors:
            if a["l"] <= L_target:
                prev_a = a
        for a in sorted_anchors:
            if a["l"] >= L_target:
                next_a = a
                break

        if prev_a is None:
            # Lighter than any anchor: use lightest anchor's hue and fade saturation.
            ref = sorted_anchors[0]
            t_extrap = (ref["l"] - L_target) / max(0.001, ref["l"])
            H = ref["h"]
            S = max(0.0, ref["s"] * (1.0 - t_extrap * 0.6))
        elif next_a is None:
            # Darker than any anchor: use darkest anchor's hue, maintain saturation.
            ref = sorted_anchors[-1]
            H = ref["h"]
            S = ref["s"]
        elif prev_a is next_a:
            H = prev_a["h"]
            S = prev_a["s"]
        else:
            span = next_a["l"] - prev_a["l"]
            t = (L_target - prev_a["l"]) / span if span > 0 else 0
            H = interpolate_h(prev_a["h"], next_a["h"], t)
            S = prev_a["s"] + t * (next_a["s"] - prev_a["s"])

        new_hex = hls_to_hex(H, L_target, S)
        code = f"DLM{fid}{idx + 5:02d}"
        name = new_names[idx]
        new_rows.append({"code": code, "name": name, "hex": new_hex, "l": L_target})

    # Final rows = anchors (in their existing order) + new (in code order).
    final = []
    for a in anchor_data:
        final.append({"code": a["code"], "name": a["name"], "hex": a["hex"]})
    for r in new_rows:
        final.append({"code": r["code"], "name": r["name"], "hex": r["hex"]})
    return final


def render_markdown():
    out = []
    out.append("# DLM Paint Colors")
    out.append("")
    out.append("Den Lille Malerfabrik's full paint palette: **8 families × 25 shades = 200 colors**.")
    out.append("")
    out.append("Each color has a stable internal DLM code, a friendly Danish name, and a Hex value.")
    out.append("NCS values are pending; they will be backfilled from DLM and the column will be populated then.")
    out.append("")
    out.append("Within each family, codes `FF01`–`FF04` are the original hand-curated anchor shades. Codes `FF05`–`FF25`")
    out.append("are programmatic tonal expansions generated by `scripts/generate-colors.py` (HSL interpolation between the anchors,")
    out.append("with the lightness ramp slightly extended past the anchor range). The anchor entries are frozen exactly as they were;")
    out.append("only the new entries are computed. Re-running the script produces identical output for the anchors.")
    out.append("")

    for family in FAMILIES:
        out.append(f"## {family['id']} — {family['label']}")
        out.append("")
        out.append("| Code     | Name              | NCS | Hex     |")
        out.append("|----------|-------------------|-----|---------|")
        rows = generate_family(family)
        # Column widths: keep name padded for readability.
        for r in rows:
            out.append(
                f"| {r['code']:<8} | {r['name']:<17} | —   | {r['hex']} |"
            )
        out.append("")

    return "\n".join(out).rstrip() + "\n"


if __name__ == "__main__":
    print(render_markdown(), end="")
