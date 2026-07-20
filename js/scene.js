// Three.js orbital scene: Sun, Earth, ellipse that deforms with the data.
// Flat unlit materials + soft glow sprites ("2D-styled 3D"), dark starfield theme.

import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { APSIDAL_SHARE, AXIAL_SHARE, solsticeAnomaly } from './insolation.js';

const SEMI_MAJOR = 10;     // orbit semi-major axis (scene units)
const ELLIPSE_SEGS = 256;
const TRAIL_LEN = 90;
const ECC_GAIN = 3;        // visual exaggeration of eccentricity (real values are tiny)
const TWO_PI = Math.PI * 2;

// Radial-gradient glow texture (shared with earthview.js)
export function makeGlowTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Random starfield inside a spherical shell (shared with earthview.js)
export function makeStars(count, radius, size = 1.6) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;         // uniform in cos(latitude)
    const a = Math.random() * TWO_PI;
    const s = Math.sqrt(1 - u * u);
    const r = radius * (0.55 + 0.45 * Math.random());
    pos[i * 3] = r * s * Math.cos(a);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * s * Math.sin(a);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xcbd5e1, size, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false,
  }));
}

// Point on the ellipse: Sun at the focus (origin), perihelion longitude w.
// θ: true anomaly; e: eccentricity; w: perihelion direction (rad)
// NOTE on conventions (locked by tools/check_orbit_signs.mjs):
//   z0 carries a MINUS sign — mirrored so the Earth revolves counterclockwise
//   seen from the north ecliptic pole (camera side), matching reality;
//   w and the axis azimuth signs below are chosen together with this mirror so
//   that apsidal precession is prograde, axial precession retrograde, and the
//   NH June solstice (axis pointing at the Sun) falls at θ = 270° − ϖ.
function ellipsePoint(θ, e, w, out) {
  const r = (SEMI_MAJOR * (1 - e * e)) / (1 + e * Math.cos(θ));
  const x0 = r * Math.cos(θ);
  const z0 = -r * Math.sin(θ);
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  out.set(x0 * cw + z0 * sw, 0, -x0 * sw + z0 * cw);
  return out;
}

export class OrbitScene {
  constructor(canvas, data) {
    this.data = data;
    this.pi0 = data.pi[0]; // reference ϖ for the precession split
    this.elapsed = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.add(makeStars(900, 220));

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    this.camera.position.set(0, 22, 32);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 120;
    this.controls.maxPolarAngle = 1.45;

    this._buildSun();
    this._buildOrbitLine();
    this._buildEarth();
    this._buildPerihelionMarker();

    this._resize = this._resize.bind(this);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(canvas.parentElement);
    this._resize();
  }

  _buildSun() {
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 48, 24),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    this.scene.add(sun);

    const tex = makeGlowTexture([
      [0, 'rgba(253, 210, 110, 0.85)'],
      [0.35, 'rgba(253, 196, 90, 0.28)'],
      [1, 'rgba(253, 190, 80, 0)'],
    ]);
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
    }));
    this.sunGlow.scale.set(8, 8, 1);
    this.scene.add(this.sunGlow);
  }

  _buildOrbitLine() {
    this.orbitPos = new Float32Array(ELLIPSE_SEGS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.orbitPos, 3));
    this.orbitLine = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({
      color: 0x38bdf8, transparent: true, opacity: 0.9,
    }));
    this.scene.add(this.orbitLine);

    // soft wider underlay approximating a glow on the dark background
    this.orbitGlow = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({
      color: 0x0ea5e9, transparent: true, opacity: 0.3, depthWrite: false,
    }));
    this.scene.add(this.orbitGlow);
  }

  _buildEarth() {
    this.earthGroup = new THREE.Group();

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
    );
    this.earthGroup.add(globe);

    const atmTex = makeGlowTexture([
      [0, 'rgba(147, 197, 253, 0.5)'],
      [0.4, 'rgba(147, 197, 253, 0.16)'],
      [1, 'rgba(147, 197, 253, 0)'],
    ]);
    const atm = new THREE.Sprite(new THREE.SpriteMaterial({
      map: atmTex, transparent: true, depthWrite: false,
    }));
    atm.scale.set(2.3, 2.3, 1);
    this.earthGroup.add(atm);

    // Axis + equator ring inside axisGroup; rotation order YXZ:
    // first tilt by obliquity from the orbit normal, then swing azimuth (precession).
    // Axis line is deliberately long so the tilt reads at orbit scale.
    this.axisGroup = new THREE.Group();
    this.axisGroup.rotation.order = 'YXZ';
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -2.0, 0),
      new THREE.Vector3(0, 2.0, 0),
    ]);
    this.axisGroup.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0xfbbf24 })));

    const ringPts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TWO_PI;
      ringPts.push(new THREE.Vector3(Math.cos(a) * 0.74, 0, Math.sin(a) * 0.74));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    this.axisGroup.add(new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({
      color: 0x93c5fd, transparent: true, opacity: 0.6,
    })));
    this.earthGroup.add(this.axisGroup);

    this.scene.add(this.earthGroup);

    // Earth trail: history of true anomalies, reprojected onto the CURRENT ellipse
    // every frame — the trail is always an arc of the displayed orbit, so it can
    // never detach when the ellipse rotates/deforms or the clock wraps.
    this.trailAnoms = new Float32Array(TRAIL_LEN);
    this._trailInit = false;
    this.trailPos = new Float32Array(TRAIL_LEN * 3);
    const trailColors = new Float32Array(TRAIL_LEN * 3);
    for (let i = 0; i < TRAIL_LEN; i++) {
      const f = (i / (TRAIL_LEN - 1)) ** 2;
      trailColors[i * 3] = 0.04 + 0.54 * f;     // R
      trailColors[i * 3 + 1] = 0.06 + 0.71 * f; // G
      trailColors[i * 3 + 2] = 0.12 + 0.86 * f; // B
    }
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    this.trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    this.scene.add(this.trail);
  }

  _buildPerihelionMarker() {
    // amber dot: perihelion — the point of the orbit closest to the Sun
    this.periDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    this.scene.add(this.periDot);

    // coral dot: NH June solstice — where northern summer falls on the orbit;
    // it creeps along the ellipse with climatic precession (~21 kyr cycle)
    this.juneDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xfb7185 })
    );
    this.scene.add(this.juneDot);
  }

  _resize() {
    const el = this.renderer.domElement.parentElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Effective orbital elements at data row index (eccentricity visually exaggerated).
  // Sign convention (with the mirrored ellipsePoint, see above): w keeps the
  // apsidal precession prograde; the axis azimuth is π − AXIAL_SHARE·dw so that
  // axial precession is retrograde AND the NH June solstice (axis pointing at
  // the Sun) falls at true anomaly θ = 270° − ϖ, matching the right pane's
  // "NH summer solstice" readout.
  _orbital(index) {
    const e = Math.min(this.data.ecc[index] * ECC_GAIN, 0.9);
    const dw = this.data.pi[index] - this.pi0;
    return { e, w: this.pi0 + APSIDAL_SHARE * dw, dw };
  }

  // After a big time jump (slider scrub), collapse the trail onto the current position
  resetTrail(anomaly) {
    this.trailAnoms.fill(anomaly);
  }

  // Per-frame update. `anomaly` (year phase) is owned and advanced by main.js.
  // When `playing` is false the frame freezes: no trail advance, no sun pulse
  // (camera interaction still works).
  update(index, anomaly, dtSec, playing) {
    this._idx = index;
    const { e, w, dw } = this._orbital(index);
    const obl = this.data.obl[index];

    if (!this._trailInit) {
      this.trailAnoms.fill(anomaly);
      this._trailInit = true;
    }

    const p = new THREE.Vector3();
    for (let i = 0; i < ELLIPSE_SEGS; i++) {
      ellipsePoint((i / ELLIPSE_SEGS) * TWO_PI, e, w, p);
      this.orbitPos[i * 3] = p.x;
      this.orbitPos[i * 3 + 1] = p.y;
      this.orbitPos[i * 3 + 2] = p.z;
    }
    this.orbitLine.geometry.attributes.position.needsUpdate = true;

    // axial precession: axis azimuth regresses around the orbit normal
    // (sign convention locked with the mirrored ellipse — see _orbital)
    this.axisGroup.rotation.y = Math.PI - AXIAL_SHARE * dw;
    this.axisGroup.rotation.x = obl;

    if (playing) {
      this.elapsed += dtSec;
      const s = 8 * (1 + 0.03 * Math.sin(this.elapsed * 1.4));
      this.sunGlow.scale.set(s, s, 1);

      this.trailAnoms.copyWithin(0, 1);
      this.trailAnoms[TRAIL_LEN - 1] = anomaly;
    }

    // reproject the trail onto the current ellipse (always, even when paused)
    for (let i = 0; i < TRAIL_LEN; i++) {
      ellipsePoint(this.trailAnoms[i], e, w, p);
      this.trailPos[i * 3] = p.x;
      this.trailPos[i * 3 + 1] = p.y;
      this.trailPos[i * 3 + 2] = p.z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;

    // Earth stays glued to the ellipse even while paused (anomaly unchanged)
    ellipsePoint(anomaly, e, w, p);
    this.earthGroup.position.copy(p);

    ellipsePoint(0, e, w, p); // perihelion
    this.periDot.position.copy(p);

    ellipsePoint(solsticeAnomaly(this.data.pi[index]), e, w, p); // NH June solstice
    this.juneDot.position.copy(p);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
