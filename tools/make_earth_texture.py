#!/usr/bin/env python3
"""Generate the flat cartoon Earth texture used by the right-pane globes.

Source: Natural Earth 10m land polygons (public domain,
https://www.naturalearthdata.com) rasterized at vector precision — much
crisper than the old three.js specular-mask repaint, especially along
coastlines. Style is the same flat cartoon palette: solid ocean blue
(darkened toward the poles), shallow coastal water, green land with a thin
dark coastline rim, and ice-colored land above |lat| >= 70 deg.

Output: lib/textures/earth_cartoon_4096.png  (equirectangular, 4096x2048)

Run from the project root (downloads the source GeoJSON on first run):

    python3 tools/make_earth_texture.py
"""

import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

LAND_URL = (
    "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/"
    "geojson/ne_10m_land.geojson"
)
CACHE = Path("/tmp/ne_data/ne_10m_land.geojson")
OUT_PATH = Path(__file__).resolve().parent.parent / "lib" / "textures" / "earth_cartoon_4096.png"

W, H = 4096, 2048  # equirectangular canvas

OCEAN = np.array([37, 99, 235], dtype=np.float64)       # deep ocean blue
SHALLOW = np.array([96, 165, 250], dtype=np.float64)    # coastal water
LAND = np.array([106, 168, 79], dtype=np.float64)       # flat green
COAST = np.array([47, 82, 51], dtype=np.float64)        # coastline rim
ICE = np.array([223, 233, 245], dtype=np.float64)       # high-latitude ice

ICE_LAT = 70.0       # |latitude| where land turns to ice
POLE_DARKEN = 0.28   # ocean darkening factor at the poles


def fetch_land() -> dict:
    """Download the land GeoJSON (retrying truncated transfers) and parse it."""
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, 7):
        if CACHE.exists():
            try:
                return json.loads(CACHE.read_text())
            except json.JSONDecodeError:
                print(f"cached file truncated, re-downloading (attempt {attempt})")
                CACHE.unlink()
        print(f"downloading {LAND_URL}")
        try:
            with urllib.request.urlopen(LAND_URL, timeout=180) as resp:
                CACHE.write_bytes(resp.read())
        except OSError as err:
            print(f"download failed: {err}")
    sys.exit("could not obtain a complete copy of the Natural Earth land GeoJSON")


def project(lon: float, lat: float) -> tuple[float, float]:
    return ((lon + 180.0) / 360.0 * W, (90.0 - lat) / 180.0 * H)


def simplify_to_pixels(ring) -> list[tuple[float, float]]:
    """Drop points that land on the same raster pixel as the previous kept one.

    Natural Earth 10m rings carry far more vertices than the raster can
    resolve (consecutive points sub-pixel apart). Besides being redundant,
    that density breaks PIL's scanline fill (even-odd parity glitches that
    leave 1-px unfilled slivers — e.g. across the Sahara). Pixel-level dedup
    keeps every vertex the raster can actually see.
    """
    out: list[tuple[float, float]] = []
    last_px: tuple[int, int] | None = None
    for lon, lat, *_ in ring:
        x, y = project(lon, lat)
        px = (round(x), round(y))
        if px != last_px:
            out.append((x, y))
            last_px = px
    return out


def rasterize_land(geo: dict) -> np.ndarray:
    """Fill land polygons (exteriors 1, holes 0) on a W x H mask."""
    mask = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(mask)
    n_rings = n_in = n_out = 0
    for feat in geo["features"]:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            for j, ring in enumerate(poly):
                pts = simplify_to_pixels(ring)
                n_in += len(ring)
                n_out += len(pts)
                if len(pts) >= 2:
                    draw.polygon(pts, fill=255 if j == 0 else 0)
                n_rings += 1
    print(f"rasterized {n_rings} rings ({n_in} -> {n_out} points after pixel dedup)")
    return (np.asarray(mask) > 0).astype(np.uint8) * 255


def fill_thin_cracks(land: np.ndarray, max_thick: int = 3) -> np.ndarray:
    """Fill ocean components thinner than `max_thick` pixels as land.

    PIL's scanline fill can leave 1-px ocean slivers inside continents
    (even-odd parity glitches on ultra-dense rings). Real lakes and seas are
    far thicker than 3 px at this resolution, so only hairline cracks qualify.
    """
    ocean = land == 0
    labels, n = ndimage.label(ocean)
    if n == 0:
        return land
    slices = ndimage.find_objects(labels)
    filled = land.copy()
    n_fixed = 0
    for i, sl in enumerate(slices, start=1):
        thick = min(sl[0].stop - sl[0].start, sl[1].stop - sl[1].start)
        if thick <= max_thick:
            filled[labels == i] = 255
            n_fixed += 1
    print(f"crack repair: {n_fixed} thin ocean slivers filled")
    return filled


def assert_land_fraction(land: np.ndarray) -> None:
    frac = float((land > 0).mean())
    print(f"land pixel fraction: {frac:.3f}")
    if not 0.15 < frac < 0.35:
        sys.exit("implausible land fraction — rasterization polarity wrong?")


def main() -> None:
    geo = fetch_land()
    land = rasterize_land(geo)
    land = fill_thin_cracks(land)
    assert_land_fraction(land)
    land_img = Image.fromarray(land)

    # coastline rim: land pixels that touch ocean (binary erosion via MinFilter)
    eroded = np.asarray(land_img.filter(ImageFilter.MinFilter(3)))
    coast = (land > 0) & (eroded == 0)

    # shallow water: ocean within ~4 px of land (binary dilation via MaxFilter)
    dilated = np.asarray(land_img.filter(ImageFilter.MaxFilter(9)))
    shallow = (land == 0) & (dilated > 0)

    # per-row latitude shading for the ocean
    y = np.arange(H, dtype=np.float64)
    lat = 90.0 - (y + 0.5) / H * 180.0
    shade = (1.0 - POLE_DARKEN * np.abs(np.sin(np.radians(lat))))[:, None]
    ice_row = (np.abs(lat) >= ICE_LAT)[:, None]

    img = np.empty((H, W, 3), dtype=np.float64)
    img[:] = (OCEAN * shade)[:, None, :]
    img[shallow] = SHALLOW
    land_px = land > 0
    img[land_px] = np.where(np.broadcast_to(ice_row, (H, W))[land_px][:, None], ICE, LAND)
    img[coast] = COAST

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img.astype(np.uint8)).save(OUT_PATH, optimize=True)
    print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
