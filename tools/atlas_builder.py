"""Build the sprite atlases for frcp.net from data.json and the individual icon files.

Run from the project folder after adding or changing icons:
    python tools/atlas_builder.py
Needs Pillow (pip install pillow). Writes:
    images/civ/civicon_atlas.webp          civ icons shrunk to 30 px for the Log and Civ Pool tabs, cell index = civ
                                           id, "random" after the last civ (the Draw Civ tab shows the icon files)
    images/dlc/dlc_atlas.webp              edition icons (normal, hover, pressed), then DLC icons
    images/dlc/edition_banners_atlas.webp  edition banners stacked vertically, in data.json order

Cell order in dlc_atlas.webp (script.js computes the same indexes, so no map file is needed):
    edition i (data.json order): 3*i normal, 3*i + 1 hover, 3*i + 2 pressed
    then each DLC that has an "icon", in data.json order: 3*editions + k
DLC_COLS is a multiple of 3 so each edition's three states share a row.
Bump the ?v= on the atlas URLs in style.css after rebuilding, or visitors may get the old file.
"""
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CIV_COLS, CIV_CELL, CIV_ATLAS_CELL = 8, 104, 30
DLC_COLS, DLC_CELL = 6, 128
QUALITY = 90


# Lays out icons of cell px square in rows of cols, each shrunk to out_cell px if that's given
def build_grid(paths, cols, cell, out, out_cell=None):
    out_cell = out_cell or cell
    rows = math.ceil(len(paths) / cols)
    atlas = Image.new("RGBA", (cols * out_cell, rows * out_cell))
    for i, p in enumerate(paths):
        img = Image.open(p).convert("RGBA")
        if img.size != (cell, cell):
            raise SystemExit(f"{p.name} is {img.size[0]}x{img.size[1]}, expected {cell}x{cell}")
        if out_cell != cell:
            img = img.resize((out_cell, out_cell), Image.LANCZOS)
        atlas.paste(img, ((i % cols) * out_cell, (i // cols) * out_cell))
    atlas.save(out, quality=QUALITY, method=6)
    print(f"{out.relative_to(ROOT)}: {len(paths)} icons, {cols} cols x {rows} rows, "
          f"{out.stat().st_size // 1024} KB  ->  CSS: --cols: {cols}; --rows: {rows};")


def main():
    data = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))

    civs = sorted(data["civs"], key=lambda c: c["id"])
    ids = [c["id"] for c in civs]
    if ids != list(range(len(ids))):
        raise SystemExit("civ ids in data.json must run 0..n-1 with no gaps")
    civ_paths = [ROOT / "images/civ" / f"{c['name'].lower()}.webp" for c in civs]
    civ_paths.append(ROOT / "images/civ/random.webp")
    build_grid(civ_paths, CIV_COLS, CIV_CELL, ROOT / "images/civ/civicon_atlas.webp", CIV_ATLAS_CELL)

    dlc_dir = ROOT / "images/dlc"
    dlc_paths = []
    for ed in data["editions"]:
        for suffix in ("", "_hover", "_pressed"):
            dlc_paths.append(dlc_dir / f"{ed['icon']}{suffix}.webp")
    for dlc in data["dlcs"].values():
        if dlc.get("icon"):
            dlc_paths.append(dlc_dir / f"{dlc['icon']}.webp")
    build_grid(dlc_paths, DLC_COLS, DLC_CELL, ROOT / "images/dlc/dlc_atlas.webp")

    banners = [Image.open(dlc_dir / f"{ed['banner']}.webp").convert("RGBA") for ed in data["editions"]]
    w, h = banners[0].size
    strip = Image.new("RGBA", (w, h * len(banners)))
    for i, b in enumerate(banners):
        if b.size != (w, h):
            raise SystemExit("all edition banners must be the same size")
        strip.paste(b, (0, i * h))
    out = ROOT / "images/dlc/edition_banners_atlas.webp"
    strip.save(out, quality=QUALITY, method=6)
    print(f"{out.relative_to(ROOT)}: {len(banners)} banners, {out.stat().st_size // 1024} KB  ->  CSS: --rows: {len(banners)};")


if __name__ == "__main__":
    main()
