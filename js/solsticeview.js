// Left pane, second view ("Solstice drift"): a didactic scroll panel.
// A static Canvas-2D schematic (geometry after Berger 1978) explains why
// axial precession moves the June solstice along the orbit; below it a live
// Three.js animation shows the Earth locked at the NH June solstice (axis
// always toward the Sun), so the solstice point's slow migration relative
// to perihelion is visible.
//
// The animation reuses the orbit view's sign conventions (locked by
// tools/check_orbit_signs.mjs): the mirrored ellipsePoint, w = pi0 +
// APSIDAL_SHARE·Δϖ, axis azimuth π − AXIAL_SHARE·Δϖ, solstice at
// θ_sol = 270° − ϖ (check 4 guarantees the axis points at the Sun there).

import * as THREE from 'three';
import { ellipsePoint, makeGlowTexture, makeStars } from './scene.js';
import { APSIDAL_SHARE, AXIAL_SHARE, solsticeAnomaly } from './insolation.js';

const ELLIPSE_SEGS = 256;
const TRAIL_LEN = 240;   // ≈24 kyr of solstice-point history at DT = 0.1 kyr
const ECC_GAIN = 3;      // same visual exaggeration as the orbit view
const TWO_PI = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* live animation: Earth locked at the NH June solstice                */
/* ------------------------------------------------------------------ */

export class SolsticeView {
  constructor(canvas, data) {
    this.data = data;
    this.pi0 = data.pi[0]; // reference ϖ for the precession split
    this.hudEl = document.getElementById('solsticeHud');

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.add(makeStars(400, 120, 1.2));

    // fixed camera (the panel scrolls, so no OrbitControls)
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    this.camera.position.set(0, 15, 26);
    this.camera.lookAt(0, 0, 0);

    this._buildSun();
    this._buildOrbitLine();
    this._buildEarth();
    this._buildTrail();

    // amber dot: perihelion
    this.periDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b })
    );
    this.scene.add(this.periDot);

    this._lastIdx = -1;
    this._dirty = false;
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
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
    }));
    glow.scale.set(8, 8, 1);
    this.scene.add(glow);
  }

  _buildOrbitLine() {
    this.orbitPos = new Float32Array(ELLIPSE_SEGS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.orbitPos, 3));
    this.orbitLine = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({
      color: 0x38bdf8, transparent: true, opacity: 0.9,
    }));
    this.scene.add(this.orbitLine);
  }

  _buildEarth() {
    this.earthGroup = new THREE.Group();
    this.earthGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
    ));
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

    // axis + equator ring (rotation order YXZ, as in the orbit view)
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
  }

  // trail of past solstice points (θ_sol history), reprojected onto the
  // CURRENT ellipse every render — same approach as the orbit view's trail
  _buildTrail() {
    this.trailVals = new Float32Array(TRAIL_LEN);
    this.trailVals.fill(solsticeAnomaly(this.data.pi[0]));
    this.trailPos = new Float32Array(TRAIL_LEN * 3);
    const trailColors = new Float32Array(TRAIL_LEN * 3);
    for (let i = 0; i < TRAIL_LEN; i++) {
      const f = (i / (TRAIL_LEN - 1)) ** 2;
      trailColors[i * 3] = 0.14 + 0.82 * f;     // R (amber fade)
      trailColors[i * 3 + 1] = 0.08 + 0.57 * f; // G
      trailColors[i * 3 + 2] = 0.02 + 0.09 * f; // B
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    this.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    this.scene.add(this.trail);
  }

  _resize() {
    const el = this.renderer.domElement.parentElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._dirty = true;
  }

  // after a slider scrub, collapse the trail onto the current solstice point
  resetTrail(index) {
    this.trailVals.fill(solsticeAnomaly(this.data.pi[index]));
    this._dirty = true;
  }

  // renders only when the data row changed or a resize dirtied the frame
  // (paused = frozen; the camera is fixed)
  update(index) {
    if (index === this._lastIdx && !this._dirty) return;

    const pi = this.data.pi[index];
    const thSol = solsticeAnomaly(pi);
    if (index !== this._lastIdx) {
      this.trailVals.copyWithin(0, 1);
      this.trailVals[TRAIL_LEN - 1] = thSol;
    }

    const e = Math.min(this.data.ecc[index] * ECC_GAIN, 0.9);
    const dw = pi - this.pi0;
    const w = this.pi0 + APSIDAL_SHARE * dw;
    const p = new THREE.Vector3();

    for (let i = 0; i < ELLIPSE_SEGS; i++) {
      ellipsePoint((i / ELLIPSE_SEGS) * TWO_PI, e, w, p);
      this.orbitPos[i * 3] = p.x;
      this.orbitPos[i * 3 + 1] = p.y;
      this.orbitPos[i * 3 + 2] = p.z;
    }
    this.orbitLine.geometry.attributes.position.needsUpdate = true;

    // Earth locked at the June solstice: θ = θ_sol with the axis azimuth
    // π − AXIAL_SHARE·Δϖ makes the axis point at the Sun (check 4)
    ellipsePoint(thSol, e, w, p);
    this.earthGroup.position.copy(p);
    this.axisGroup.rotation.y = Math.PI - AXIAL_SHARE * dw;
    this.axisGroup.rotation.x = this.data.obl[index];

    ellipsePoint(0, e, w, p); // perihelion
    this.periDot.position.copy(p);

    for (let i = 0; i < TRAIL_LEN; i++) {
      ellipsePoint(this.trailVals[i], e, w, p);
      this.trailPos[i * 3] = p.x;
      this.trailPos[i * 3 + 1] = p.y;
      this.trailPos[i * 3 + 2] = p.z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;

    if (this.hudEl) {
      const deg = (((thSol * 180 / Math.PI) % 360) + 360) % 360;
      this.hudEl.textContent = `June solstice: ${deg.toFixed(0)}° past perihelion`;
    }

    this.renderer.render(this.scene, this.camera);
    this._lastIdx = index;
    this._dirty = false;
  }
}

/* ------------------------------------------------------------------ */
/* static didactic diagram (Canvas 2D, fixed 1200×860, CSS scales)     */
/*                                                                     */
/* June-solstice geometry after Berger (1978): the orbit plane drawn   */
/* as a level tilted disc (depth squashed vertically, no shear). The   */
/* geometry is real — λ measured from the vernal equinox γ,            */
/* θ = λ − ϖ, r = a(1−e²)/(1+e·cosθ) — with the eccentricity           */
/* exaggerated for legibility. A ghost Earth shows where the solstice  */
/* point drifts to as the axis precesses.                              */
/* ------------------------------------------------------------------ */

const DW = 1200;
const DH = 860;
const DEG = Math.PI / 180;

const SQUASH = 0.42;             // vertical squash of the orbit plane (level disc)

const A_SEMI = 330;              // semi-major axis a (px)
const ECC_DRAW = 0.35;           // exaggerated eccentricity (today's real e ≈ 0.017)
const PI0 = 102.9 * DEG;         // today's longitude of perihelion ϖ
const PHI0 = Math.PI / 2;        // drawing azimuth: γ points straight "back"
const TILT = 23.44 * DEG;        // today's obliquity ε
const LAM_SOL = 1.5 * Math.PI;   // NH June solstice: heliocentric longitude 270°
const DRIFT = 24 * DEG;          // schematic solstice drift for the ghost Earth
const SUN_R = 40;
const E_R = 23;                  // schematic Earth radius
const AXIS_L = 150;              // Earth axis length (exaggerated for clarity)

const C2 = {
  dim: 'rgba(148, 163, 184, 0.95)',
  faint: 'rgba(148, 163, 184, 0.5)',
  blue: '#38bdf8',
  paleBlue: 'rgba(147, 197, 253, 0.95)',
  amber: '#fbbf24',
  violet: '#a78bfa',
  coral: '#fb7185',
};

let SUNC = { x: 600, y: 430 };   // canvas position of the Sun (set by centerScene)
let BBOX = { x0: 0, x1: 1200, y0: 0, y1: 860 };

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

// project in-plane coords (u, v) plus height h onto the canvas:
// u horizontal, depth v squashed vertically, heights drawn true
function P(u, v, h = 0) {
  return { x: SUNC.x + u, y: SUNC.y - (v * SQUASH + h) };
}

function le(lam) {              // ecliptic longitude -> drawing azimuth
  return lam + PHI0;
}

function orbitR(lam) {          // heliocentric distance at longitude λ
  const th = lam - PI0;         // true anomaly
  return A_SEMI * (1 - ECC_DRAW * ECC_DRAW) / (1 + ECC_DRAW * Math.cos(th));
}

function orbitUV(lam) {         // in-plane coords of the orbit point
  const r = orbitR(lam);
  return { u: r * Math.cos(le(lam)), v: r * Math.sin(le(lam)) };
}

function orbitP(lam, h = 0) {   // canvas point of the orbit at longitude λ
  const p = orbitUV(lam);
  return P(p.u, p.v, h);
}

// in-plane unit vector from the orbit point (λ) toward the Sun
function sunward(lam) {
  return { u: -Math.cos(le(lam)), v: -Math.sin(le(lam)) };
}

// place the projected orbit nicely inside the canvas (its bbox, plus room at
// the bottom for captions, centred at (600, 430))
function centerScene() {
  const save = SUNC;
  SUNC = { x: 0, y: 0 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 360; i++) {
    const p = orbitP(i * DEG);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  SUNC = save;
  // a little left of centre: the Earth + its captions sit on the right
  SUNC = { x: 556 - (x0 + x1) / 2, y: 448 - (y0 + y1 + 58) / 2 };
  BBOX = { x0: x0 + SUNC.x, x1: x1 + SUNC.x, y0: y0 + SUNC.y, y1: y1 + SUNC.y };
}

function label(ctx, text, x, y, color, size, opts = {}) {
  const { bold = false, align = 'center', baseline = 'alphabetic', bg = false } = opts;
  ctx.font = `${bold ? '600 ' : ''}${size}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const w = ctx.measureText(text).width;
  // keep every label inside the canvas (nothing may be clipped at the rim)
  let left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  if (left + w > DW - 18) left = DW - 18 - w;
  if (left < 18) left = 18;
  if (bg) {
    // soft backing so a caption stays readable when it crosses a line
    ctx.save();
    ctx.fillStyle = 'rgba(5, 7, 15, 0.74)';
    roundRect(ctx, left - 8, y - size * 0.92, w + 16, size * 1.28, 6);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = color;
  ctx.fillText(text, align === 'left' ? left : align === 'right' ? left + w : left + w / 2, y);
  return { x: left, w };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function arrowHead(ctx, tip, d, size, color) {
  const bx = tip.x - d.x * size;
  const by = tip.y - d.y * size;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(bx - d.y * size * 0.5, by + d.x * size * 0.5);
  ctx.lineTo(bx + d.y * size * 0.5, by - d.x * size * 0.5);
  ctx.closePath();
  ctx.fill();
}

// curved arrow running along the orbit from longitude lam0 to lam1
// (increasing λ = the direction of Earth's prograde orbital motion)
function orbitArrow(ctx, lam0, lam1, color, width, headSize = 15) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const p = orbitP(lam0 + (lam1 - lam0) * i / steps);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  // head direction taken along the travel direction (lam0 -> lam1)
  const s = Math.sign(lam1 - lam0) || 1;
  const end = orbitP(lam1);
  const prev = orbitP(lam1 - s * 1.5 * DEG);
  arrowHead(ctx, end, norm(end.x - prev.x, end.y - prev.y), headSize, color);
}

function orbitPath(ctx, close = false) {
  ctx.beginPath();
  for (let i = 0; i <= 240; i++) {
    const p = orbitP((i / 240) * TWO_PI);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  if (close) ctx.closePath();
}

// tip of the Earth's axis: tilted ε from the orbit normal, its horizontal
// component pointing at the Sun (the June-solstice configuration)
function axisTipPt(lam, phiOffset = 0, len = AXIS_L) {
  const p = orbitUV(lam);
  const w = sunward(lam);
  const s = Math.sin(TILT) * len;
  const c = Math.cos(TILT) * len;
  const ca = Math.cos(phiOffset), sa = Math.sin(phiOffset);
  // rotate the (toward-Sun, in-plane-perpendicular) pair by phiOffset
  const du = w.u * ca - w.v * sa;
  const dv = w.u * sa + w.v * ca;
  return P(p.u + s * du, p.v + s * dv, c);
}

// the small circle the axis tip traces around the orbit normal (the way a
// precessing top's spin axis circles the vertical). phi is measured CCW seen
// from the north ecliptic pole, so the RETROGRADE axial precession runs
// clockwise = decreasing phi.
function precessionCirclePath(ctx, lam, from = 0, to = TWO_PI) {
  ctx.beginPath();
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const phi = from + (to - from) * i / steps;
    const p = axisTipPt(lam, phi);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function drawSunDisk(ctx) {
  const g = ctx.createRadialGradient(SUNC.x, SUNC.y, 0, SUNC.x, SUNC.y, SUN_R * 3);
  g.addColorStop(0, 'rgba(253, 210, 110, 0.9)');
  g.addColorStop(0.35, 'rgba(253, 196, 90, 0.25)');
  g.addColorStop(1, 'rgba(253, 190, 80, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(SUNC.x, SUNC.y, SUN_R * 3, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = C2.amber;
  ctx.beginPath();
  ctx.arc(SUNC.x, SUNC.y, SUN_R, 0, TWO_PI);
  ctx.fill();
}

// orbit plane seen as a level tilted disc (soft fill) + rim
function drawOrbitPlane(ctx) {
  ctx.save();
  orbitPath(ctx, true);
  const g = ctx.createLinearGradient(0, BBOX.y0, 0, BBOX.y1);
  g.addColorStop(0, 'rgba(56, 189, 248, 0.07)');
  g.addColorStop(1, 'rgba(56, 189, 248, 0.012)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// γ / vernal equinox: marker on the orbit + the reference direction from the Sun
function drawEquinox(ctx) {
  const p = orbitP(0);
  ctx.save();
  ctx.strokeStyle = C2.faint;
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(SUNC.x, SUNC.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = C2.dim;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, TWO_PI);
  ctx.fill();
  label(ctx, 'vernal equinox γ (First Point of Aries)', p.x - 16, p.y + 5, C2.dim, 14.5,
    { align: 'right' });
  return p;
}

// ϖ: the angle at the Sun from γ to the perihelion direction, plus the
// perihelion marker itself (amber, as everywhere else in the project)
function drawPerihelion(ctx) {
  const rArc = 155;
  const peri = orbitP(PI0);   // perihelion sits at longitude ϖ, a(1−e) from the Sun
  ctx.save();
  ctx.strokeStyle = C2.faint;
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(SUNC.x, SUNC.y);
  ctx.lineTo(peri.x, peri.y);
  ctx.stroke();
  ctx.restore();

  // angle ϖ swept from γ to perihelion (both directions in the orbit plane)
  ctx.strokeStyle = C2.amber;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const lam = (PI0 * i) / steps;
    const p = P(rArc * Math.cos(le(lam)), rArc * Math.sin(le(lam)));
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  const mid = P(rArc * 1.42 * Math.cos(le(PI0 / 2)), rArc * 1.42 * Math.sin(le(PI0 / 2)));
  label(ctx, 'ϖ', mid.x, mid.y, C2.amber, 22, { bold: true });

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(peri.x, peri.y, 7, 0, TWO_PI);
  ctx.fill();
  label(ctx, 'perihelion', peri.x, peri.y - 20, C2.amber, 17, { bold: true });
  return peri;
}

// e: shown purely by the Sun sitting off the orbit centre (offset drawn
// exaggerated with the eccentricity) — the centre is the midpoint of
// perihelion and aphelion; no a / c = a·e construction in the figure,
// the definition lives in the key instead
function drawEccentricity(ctx) {
  const peri = orbitUV(PI0);
  const aph = orbitUV(PI0 + Math.PI);
  const cs = P((peri.u + aph.u) / 2, (peri.v + aph.v) / 2);
  ctx.fillStyle = C2.dim;
  ctx.beginPath();
  ctx.arc(cs.x, cs.y, 4, 0, TWO_PI);
  ctx.fill();
  label(ctx, 'orbit centre', cs.x + 14, cs.y + 5, C2.faint, 14, { align: 'left' });
}

// symbol key, top-left
function drawKey(ctx) {
  const x = 34;
  const items = [
    ['γ', '', 'vernal equinox (First Point of Aries)', C2.dim],
    ['ϖ', '', 'longitude of perihelion (angle at the Sun, from γ) — today ≈ 102.9°', C2.amber],
    ['e', '', 'eccentricity — how far the Sun sits off the orbit centre (exaggerated)', C2.dim],
    ['ε', '', 'axial tilt (obliquity) — today 23.44°', C2.violet],
    ['', 'dot', 'perihelion — closest point to the Sun', C2.amber],
  ];
  items.forEach((it, i) => {
    const y = 46 + i * 25;
    if (it[1] === 'dot') {
      ctx.fillStyle = it[3];
      ctx.beginPath();
      ctx.arc(x + 8, y - 5, 6, 0, TWO_PI);
      ctx.fill();
    } else {
      label(ctx, it[0], x + 9, y, it[3], 18, { bold: true });
    }
    label(ctx, it[2], x + 34, y, C2.faint, 14.5, { align: 'left' });
  });
}

// the Earth at the June solstice: blue globe + amber axis whose north end
// points at the Sun, with the axis tip's precession circle around the orbit
// normal in front of it
function drawEarth(ctx, lam, alpha, withArrow, cone = true) {
  const pos = orbitP(lam);
  const tip = axisTipPt(lam);
  const p = orbitUV(lam);
  const w = sunward(lam);
  const tail = P(p.u - AXIS_L * 0.5 * Math.sin(TILT) * w.u,
    p.v - AXIS_L * 0.5 * Math.sin(TILT) * w.v,
    -AXIS_L * 0.5 * Math.cos(TILT));

  ctx.save();
  ctx.globalAlpha = alpha;

  // precession circle (the cone the axis sweeps) + retrograde arc arrow
  if (cone) {
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.55)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5;
    precessionCirclePath(ctx, lam);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (withArrow) {
    // the axis tip runs clockwise on screen (retrograde seen from the
    // north): a short arc lifts off just above the tip and sweeps over the
    // top of the precession circle, its head tangent to the circle and
    // well clear of the axis
    ctx.strokeStyle = C2.violet;
    ctx.lineWidth = 2.5;
    precessionCirclePath(ctx, lam, -16 * DEG, -106 * DEG);
    ctx.stroke();
    const end = axisTipPt(lam, -106 * DEG);
    const prev = axisTipPt(lam, -104.5 * DEG); // just behind the head (larger phi)
    arrowHead(ctx, end, norm(end.x - prev.x, end.y - prev.y), 12, C2.violet);
  }

  // orbit normal (the axis circles around it)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  const nTop = axisTipPt(lam, 0, AXIS_L * 1.12);
  ctx.lineTo(nTop.x, nTop.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // axis
  ctx.strokeStyle = C2.amber;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  // globe
  const g = ctx.createRadialGradient(pos.x - 8, pos.y - 10, 3, pos.x, pos.y, E_R);
  g.addColorStop(0, '#7fb3f7');
  g.addColorStop(1, '#1d4ed8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, E_R, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
  return pos;
}

function drawDiagram(canvas) {
  canvas.width = DW;
  canvas.height = DH;
  const ctx = canvas.getContext('2d');
  centerScene();

  drawOrbitPlane(ctx);
  drawEccentricity(ctx);
  drawEquinox(ctx);
  drawPerihelion(ctx);
  drawKey(ctx);
  drawSunDisk(ctx);
  label(ctx, 'Sun', SUNC.x, SUNC.y + SUN_R * 1.5 + 16, C2.dim, 17);

  // ghost: the June solstice a few millennia from now — axial precession
  // has carried it backward (decreasing λ) along the orbit
  const lamGhost = LAM_SOL - DRIFT;
  const ghost = drawEarth(ctx, lamGhost, 0.3, false, false);

  // solid Earth: today's June solstice (axis north end pointing at the Sun)
  const pos = drawEarth(ctx, LAM_SOL, 1, true);

  // drift arrow along the orbit, from the solid Earth toward the ghost
  orbitArrow(ctx, LAM_SOL - 5 * DEG, lamGhost + 6 * DEG, C2.coral, 3.5, 17);

  // shared captions
  orbitArrow(ctx, 150 * DEG, 200 * DEG, C2.paleBlue, 2.5);
  label(ctx, 'Earth’s orbital motion', 240, 586, C2.paleBlue, 17,
    { bold: true, align: 'left' });
  label(ctx, '(counterclockwise seen from the north ecliptic pole)',
    240, 608, C2.dim, 14.5, { align: 'left' });

  const tip = axisTipPt(LAM_SOL);
  label(ctx, 'axial precession: the axis tip circles backward', tip.x + 64, tip.y - 70,
    C2.violet, 16);
  label(ctx, '(retrograde, one turn ≈ 25.7 kyr)', tip.x + 64, tip.y - 48,
    C2.violet, 16);

  label(ctx, 'NH June solstice', pos.x + 72, pos.y - 56, C2.amber, 19,
    { bold: true, align: 'left' });
  label(ctx, 'the north end of the axis', pos.x + 72, pos.y - 34, C2.dim, 14.5,
    { align: 'left' });
  label(ctx, 'points at the Sun', pos.x + 72, pos.y - 14, C2.dim, 14.5,
    { align: 'left' });

  label(ctx, 'a few millennia from now (ghost)', ghost.x, ghost.y + 96, C2.faint, 14,
    { bg: true });
  label(ctx, 'the June solstice point drifts backward along the orbit',
    620, 632, C2.coral, 16.5, { bold: true, align: 'left', bg: true });
}

export function drawSolsticeDiagram(c1) {
  if (c1) drawDiagram(c1);
}
