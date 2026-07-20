#!/usr/bin/env python3
"""Convert the Natural Earth 10m coastline (public domain) into the compact
JSON the front end draws as a vector overlay on the right-pane globes.

The 10m coastline is far denser than any globe view can resolve, so points
are decimated to ~0.04 deg steps and quantized to 2 decimals (~1 km) — both
far below the visible threshold at globe scale, and the JSON compresses well
under the CDN's brotli.

Output: lib/textures/coastlines.json  {"lines": [[[lon, lat], ...], ...]}

Run from the project root:

    python3 tools/make_coastlines.py
"""

import json
import math
import sys
import urllib.request
from pathlib import Path

COAST_URL = (
    "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/"
    "geojson/ne_10m_coastline.geojson"
)
CACHE = Path("/tmp/ne_data/ne_10m_coastline.geojson")
OUT_PATH = Path(__file__).resolve().parent.parent / "lib" / "textures" / "coastlines.json"

MIN_STEP = 0.04   # deg; drop points closer than this to the previous kept one
QUANT = 2         # decimals kept on lon/lat (~1 km)


def fetch_coast() -> dict:
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, 7):
        if CACHE.exists():
            try:
                return json.loads(CACHE.read_text())
            except json.JSONDecodeError:
                print(f"cached file truncated, re-downloading (attempt {attempt})")
                CACHE.unlink()
        print(f"downloading {COAST_URL}")
        try:
            with urllib.request.urlopen(COAST_URL, timeout=180) as resp:
                CACHE.write_bytes(resp.read())
        except OSError as err:
            print(f"download failed: {err}")
    sys.exit("could not obtain a complete copy of the Natural Earth coastline GeoJSON")


def decimate(line):
    out = [line[0]]
    lx, ly = line[0]
    for x, y in line[1:-1]:
        if math.hypot(x - lx, y - ly) >= MIN_STEP:
            out.append((x, y))
            lx, ly = x, y
    out.append(line[-1])
    return out


def main() -> None:
    geo = fetch_coast()
    lines = []
    n_in = n_out = 0
    for feat in geo["features"]:
        geom = feat["geometry"]
        segs = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        for seg in segs:
            pts = decimate([(round(p[0], QUANT), round(p[1], QUANT)) for p in seg])
            n_in += len(seg)
            n_out += len(pts)
            if len(pts) >= 2:
                lines.append([[x, y] for x, y in pts])
    payload = json.dumps({"lines": lines}, separators=(",", ":"))
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(payload)
    print(f"{len(lines)} lines, {n_in} -> {n_out} points")
    print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
