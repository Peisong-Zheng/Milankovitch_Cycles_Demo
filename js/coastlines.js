// Vector coastline overlay for the right-pane globes.
//
// Data: Natural Earth 10m coastline (public domain), quantized by
// tools/make_coastlines.py into lib/textures/coastlines.json. Lines are built
// in the globe mesh's LOCAL frame using three.js SphereGeometry's
// equirectangular mapping (texture u = (lon+180)/360), so they must be added
// as a child of the globe mesh — they then stay aligned with the texture
// under any mesh rotation. Being geometry, they stay crisp at all latitudes,
// unlike the raster texture near the poles.

import * as THREE from 'three';

let promise = null;
export function loadCoastlines(url = 'lib/textures/coastlines.json') {
  if (!promise) {
    promise = fetch(url).then((r) => {
      if (!r.ok) throw new Error('coastlines.json: HTTP ' + r.status);
      return r.json();
    });
  }
  return promise;
}

// data -> THREE.LineSegments on a sphere of the given radius
export function buildCoastlines(data, radius, color = 0x2f5233, opacity = 0.75) {
  const pos = [];
  const push = (lon, lat) => {
    const phi = (lon + 180) * Math.PI / 180; // sphere longitude parameter
    const theta = (90 - lat) * Math.PI / 180; // polar angle
    const s = Math.sin(theta);
    pos.push(
      -radius * Math.cos(phi) * s,
      radius * Math.cos(theta),
      radius * Math.sin(phi) * s
    );
  };
  for (const line of data.lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      push(line[i][0], line[i][1]);
      push(line[i + 1][0], line[i + 1][1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 2; // after the globe surface
  return lines;
}

// fetch + build + attach as a child of the globe mesh (silent fallback: the
// baked texture coastline remains if the fetch fails)
export function attachCoastlines(globe, radius, color, opacity) {
  loadCoastlines()
    .then((data) => globe.add(buildCoastlines(data, radius, color, opacity)))
    .catch((err) => console.warn('coastlines unavailable:', err));
}
