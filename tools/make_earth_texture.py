#!/usr/bin/env python3
"""Generate the flat cartoon Earth texture used by the right-pane globe.

Source: the three.js r160 specular map (ocean bright / land dark) is used as a
land-sea mask. We repaint it in a flat cartoon style — solid ocean blue (darkened
toward the poles), shallow coastal water, green land with a darker coastline
outline, and ice-colored land above |lat| >= 70 deg.

Output: lib/textures/earth_cartoon_2048.png  (equirectangular, 2048x1024)

Run from the project root:

    python3 tools/make_earth_texture.py
"""

import io
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

MASK_URL = (
    "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/"
    "examples/textures/planets/earth_specular_2048.jpg"
)
OUT_PATH = Path(__file__).resolve().parent.parent / "lib" / "textures" / "earth_cartoon_2048.png"

OCEAN = np.array([37, 99, 235], dtype=np.float64)       # deep ocean blue
SHALLOW = np.array([96, 165, 250], dtype=np.float64)    # coastal water
LAND = np.array([106, 168, 79], dtype=np.float64)       # flat green
COAST = np.array([47, 82, 51], dtype=np.float64)        # coastline outline
ICE = np.array([223, 233, 245], dtype=np.float64)       # high-latitude ice

OCEAN_THRESH = 128   # mask gray level separating ocean (>=) from land (<)
ICE_LAT = 70.0       # |latitude| where land turns to ice
POLE_DARKEN = 0.28   # ocean darkening factor at the poles


def fetch_mask() -> Image.Image:
    print(f"downloading {MASK_URL}")
    with urllib.request.urlopen(MASK_URL, timeout=60) as resp:
        blob = resp.read()
    im = Image.open(io.BytesIO(blob)).convert("L")
    print(f"mask size: {im.size}")
    return im


def assert_polarity(mask: Image.Image) -> None:
    """Ocean must be bright, land dark — verified on known reference points."""
    w, h = mask.size

    def px(lon, lat):
        x = int((lon + 180) / 360 * w)
        y = int((90 - lat) / 180 * h)
        return mask.getpixel((x, y))

    pacific = px(-150, 0)
    sahara = px(15, 23)
    amazon = px(-60, -10)
    print(f"samples: pacific={pacific} sahara={sahara} amazon={amazon}")
    if not (pacific > OCEAN_THRESH and sahara < OCEAN_THRESH and amazon < OCEAN_THRESH):
        sys.exit("mask polarity check failed (expected bright ocean / dark land)")


def main() -> None:
    mask = fetch_mask()
    assert_polarity(mask)
    w, h = mask.size

    land = (np.asarray(mask) < OCEAN_THRESH).astype(np.uint8) * 255
    land_img = Image.fromarray(land)

    # coastline: land pixels that touch ocean (binary erosion via MinFilter)
    eroded = np.asarray(land_img.filter(ImageFilter.MinFilter(3)))
    coast = (land > 0) & (eroded == 0)

    # shallow water: ocean within ~2 px of land (binary dilation via MaxFilter)
    dilated = np.asarray(land_img.filter(ImageFilter.MaxFilter(5)))
    shallow = (land == 0) & (dilated > 0)

    # per-row latitude shading for the ocean
    y = np.arange(h, dtype=np.float64)
    lat = 90.0 - (y + 0.5) / h * 180.0
    shade = (1.0 - POLE_DARKEN * np.abs(np.sin(np.radians(lat))))[:, None]
    ice_row = (np.abs(lat) >= ICE_LAT)[:, None]

    img = np.empty((h, w, 3), dtype=np.float64)
    img[:] = (OCEAN * shade)[:, None, :]
    img[shallow] = SHALLOW
    land_px = land > 0
    img[land_px] = np.where(np.broadcast_to(ice_row, (h, w))[land_px][:, None], ICE, LAND)
    img[coast] = COAST

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img.astype(np.uint8)).save(OUT_PATH)
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
