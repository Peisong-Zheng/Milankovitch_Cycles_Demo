// Right pane (NH summer view): side view of the orbital plane.
//
// Cartoon Sun fixed on the left; cartoon Earth on the right, pinned at the
// NH June solstice (north up, axis top leaning toward the Sun by the current
// obliquity). Over time the Earth slides left/right: its Sun distance at the
// June solstice, r = a(1−e²)/(1+e·cosθ_sol) with θ_sol = 3π/2 − ϖ, varies
// with eccentricity (amplitude envelope, ~100 kyr) and climatic precession
// (phase, ~21 kyr). The deviation from the data-span mean is amplified by a
// self-calibrating gain — the real range is only a few % of 1 AU (footer
// carries the exaggeration note).
// A narrow strip at the bottom scrolls the full 65°N June-insolation series
// through a ±100 kyr window centered on "now".

import * as THREE from 'three';
import { makeGlowTexture, makeStars } from './scene.js';
import { solsticeAnomaly } from './insolation.js';
import { T_START, T_END, DT } from './data.js';

const SUN_X = -3.6;
const SUN_R = 1.5;
const EARTH_X = 3.6;      // mean-distance baseline (scene units)
const EARTH_R = 0.85;
const SLIDE_MAX = 1.25;   // max horizontal excursion after exaggeration
const OBL_GAIN = 6;       // visual exaggeration of the obliquity swing (real ±1.2°)
const CAM_Z = 15;
const CAM_Y = 1.0;
const WIN_HALF = 100;     // scrolling strip window: ±100 kyr around now
const TWO_PI = Math.PI * 2;

const STRIP_PAD = { left: 44, right: 12, top: 15, bottom: 13 };
// strip palette (kept in sync with charts.js dark theme)
const C = {
  grid: 'rgba(148, 163, 184, 0.12)',
  tickText: 'rgba(148, 163, 184, 0.9)',
  line: '#fbbf24',
  playhead: 'rgba(251, 191, 36, 0.55)',
  title: 'rgba(226, 232, 240, 0.92)',
};

export class SummerView {
  constructor(sceneCanvas, chartCanvas, data) {
    this.data = data;
    this.chart = chartCanvas;
    this.sctx = chartCanvas.getContext('2d');

    this._precompute();

    this.renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.add(makeStars(400, 60, 0.35));

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(0, CAM_Y, CAM_Z);
    this.camera.lookAt(0, 0, 0);

    // key light travels from the Sun (left) toward the Earth (right) — strong
    // for a bright day side; fill + ambient faint so the night side stays dark
    const key = new THREE.DirectionalLight(0xfff7e0, 2.8);
    key.position.set(SUN_X * 3, 0.5, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdbeafe, 0.12);
    fill.position.set(0, CAM_Y, CAM_Z);
    this.scene.add(fill);
    this.scene.add(new THREE.HemisphereLight(0x93c5fd, 0x0b1226, 0.1));

    this._buildSun();
    this._buildEarth();

    // polar tilt inset (bottom-right): close-up globe whose axis swings in
    // sync with the main Earth, against a dashed reference at today's tilt
    this.insetCanvas = document.getElementById('tiltCanvas');
    this.tiltValEl = document.getElementById('tiltVal');
    this.tiltDeltaEl = document.getElementById('tiltDelta');
    if (this.insetCanvas) this._buildInset();

    this._lastIdx = -1;
    this._stripDirty = false;
    this._resize = this._resize.bind(this);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(sceneCanvas.parentElement);
    this._ro.observe(chartCanvas);
    this._resize();
  }

  // Q65 June-insolation series (from data file, insolation package / La2004)
  // and solstice Sun-distance series (units of a), both over the whole data
  // span; gain calibrated so the largest deviation from the mean distance
  // maps to SLIDE_MAX scene units
  _precompute() {
    const d = this.data;
    const n = d.n;
    this.qSeries = d.insol65;
    this.rSeries = new Float64Array(n);
    let qLo = Infinity, qHi = -Infinity, rSum = 0;
    for (let i = 0; i < n; i++) {
      const thSol = solsticeAnomaly(d.pi[i]);
      const e = d.ecc[i];
      this.rSeries[i] = (1 - e * e) / (1 + e * Math.cos(thSol));
      if (this.qSeries[i] < qLo) qLo = this.qSeries[i];
      if (this.qSeries[i] > qHi) qHi = this.qSeries[i];
      rSum += this.rSeries[i];
    }
    this.rMean = rSum / n;
    let maxDev = 0;
    for (let i = 0; i < n; i++) {
      maxDev = Math.max(maxDev, Math.abs(this.rSeries[i] - this.rMean));
    }
    this.gain = maxDev > 0 ? SLIDE_MAX / maxDev : 0;
    const pad = (qHi - qLo) * 0.06 || 1;
    this.qMin = qLo - pad;
    this.qMax = qHi + pad;
    this.q0 = this.qSeries[d.indexAt(0)]; // today, for the Δ readout
    // mean obliquity (rad): the visible tilt oscillates around this value
    let oblSum = 0;
    for (let i = 0; i < n; i++) oblSum += d.obl[i];
    this.oblMean = oblSum / n;
  }

  _buildSun() {
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_R, 48, 24),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
    );
    sun.position.x = SUN_X;
    this.scene.add(sun);

    const tex = makeGlowTexture([
      [0, 'rgba(253, 210, 110, 0.85)'],
      [0.35, 'rgba(253, 196, 90, 0.28)'],
      [1, 'rgba(253, 190, 80, 0)'],
    ]);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
    }));
    glow.scale.set(SUN_R * 5, SUN_R * 5, 1);
    glow.position.x = SUN_X;
    this.scene.add(glow);
  }

  _buildEarth() {
    // mover carries the exaggerated left/right slide; tiltGroup inside leans
    // the axis sunward by the obliquity (rotation.z, side view)
    this.mover = new THREE.Group();
    this.mover.position.x = EARTH_X;
    this.tiltGroup = new THREE.Group();
    this.mover.add(this.tiltGroup);

    // same NASA Blue Marble texture as the precession view
    this.globeMat = new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
    new THREE.TextureLoader().load('lib/textures/earth_atmos_2048.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      this.globeMat.map = t;
      this.globeMat.color.set(0xffffff);
      this.globeMat.needsUpdate = true;
    });
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 48), this.globeMat);
    this.globe.rotation.y = -Math.PI / 2; // texture lon 0 faces the camera (+z)
    this.tiltGroup.add(this.globe);

    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -EARTH_R * 1.5, 0),
      new THREE.Vector3(0, EARTH_R * 1.5, 0),
    ]);
    this.tiltGroup.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0xfbbf24 })));

    const ringPts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TWO_PI;
      ringPts.push(new THREE.Vector3(Math.cos(a) * EARTH_R * 1.006, 0, Math.sin(a) * EARTH_R * 1.006));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    this.tiltGroup.add(new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({
      color: 0x93c5fd, transparent: true, opacity: 0.5,
    })));

    const atmTex = makeGlowTexture([
      [0, 'rgba(147, 197, 253, 0.45)'],
      [0.4, 'rgba(147, 197, 253, 0.14)'],
      [1, 'rgba(147, 197, 253, 0)'],
    ]);
    const atm = new THREE.Sprite(new THREE.SpriteMaterial({
      map: atmTex, transparent: true, depthWrite: false,
    }));
    atm.scale.set(EARTH_R * 2.6, EARTH_R * 2.6, 1);
    this.mover.add(atm);

    this.scene.add(this.mover);
  }

  // exaggerated tilt angle shared by the main Earth and the polar inset
  _tiltZ(obl) {
    return this.oblMean + (obl - this.oblMean) * OBL_GAIN;
  }

  // Bottom-right inset: a close-up of the globe (Arctic side) whose axis
  // swings with the obliquity, against a fixed dashed line at today's tilt
  _buildInset() {
    const r = new THREE.WebGLRenderer({ canvas: this.insetCanvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.insetRenderer = r;
    const scene = (this.insetScene = new THREE.Scene());
    // tight framing on the Arctic cap: pole centred, axis tips in view
    this.insetCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.insetCamera.position.set(0, 1.35, 2.2);
    this.insetCamera.lookAt(0, 0.95, 0);

    const key = new THREE.DirectionalLight(0xfff7e0, 2.8);
    key.position.set(-4, 1.5, 3);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0x93c5fd, 0x0b1226, 0.25));

    const R = 1;
    this.insetTilt = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x3b82f6 });
    new THREE.TextureLoader().load('lib/textures/earth_atmos_2048.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      mat.map = t;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), mat);
    globe.rotation.y = -Math.PI / 2; // lon 0 faces the camera, as the main Earth
    this.insetTilt.add(globe);
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -R * 1.5, 0),
      new THREE.Vector3(0, R * 1.5, 0),
    ]);
    this.insetTilt.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0xfbbf24 })));
    scene.add(this.insetTilt);

    // fixed reference line: today's obliquity under the same exaggeration
    const refGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -R * 1.5, 0),
      new THREE.Vector3(0, R * 1.5, 0),
    ]);
    const ref = new THREE.Line(refGeo, new THREE.LineDashedMaterial({
      color: 0x94a3b8, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.9,
    }));
    ref.computeLineDistances();
    ref.rotation.z = this._tiltZ(this.data.obl[this.data.indexAt(0)]);
    scene.add(ref);
  }

  _resize() {
    const el = this.renderer.domElement.parentElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) {
      this.renderer.setSize(w, h, false);
      const aspect = w / h;
      this.camera.aspect = aspect;
      // keep the horizontal extent constant on tall-narrow panes
      this.camera.position.set(0, CAM_Y, CAM_Z / Math.min(aspect, 1));
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = this.chart.clientWidth;
    const ch = this.chart.clientHeight;
    if (cw > 0 && ch > 0) {
      this.chart.width = Math.round(cw * dpr);
      this.chart.height = Math.round(ch * dpr);
      this.sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._sw = cw;
      this._sh = ch;
      // UI scale: shrink fonts/lines on narrow (e.g. phone) panes
      this._sui = Math.max(0.72, Math.min(1, cw / 700));
      this._stripDirty = true;
    }

    if (this.insetRenderer) {
      const iw = this.insetCanvas.clientWidth;
      const ih = this.insetCanvas.clientHeight;
      if (iw > 0 && ih > 0) {
        this.insetRenderer.setSize(iw, ih, false);
        this.insetCamera.aspect = iw / ih;
        this.insetCamera.updateProjectionMatrix();
        this._stripDirty = true; // force inset + gauge refresh
      }
    }
  }

  update(index) {
    // axis top leans sunward by the obliquity; the real ±1.2° swing is
    // imperceptible, so it is exaggerated around the mean (the polar inset
    // always shows the true value)
    const tiltZ = this._tiltZ(this.data.obl[index]);
    this.tiltGroup.rotation.z = tiltZ;
    this.mover.position.x = EARTH_X + (this.rSeries[index] - this.rMean) * this.gain;

    if (index !== this._lastIdx || this._stripDirty) {
      this._drawStrip(index);
      this._updateInset(index, tiltZ);
      this._stripDirty = false;
      this._lastIdx = index;
    }

    this.renderer.render(this.scene, this.camera);
  }

  // refresh the polar inset: axis swing (exaggerated, in sync with the main
  // Earth) + true value and Δ-vs-today readouts
  _updateInset(index, tiltZ) {
    if (!this.insetRenderer) return;
    this.insetTilt.rotation.z = tiltZ;
    const oblDeg = this.data.oblDeg[index];
    this.tiltValEl.textContent = oblDeg.toFixed(2) + '°';
    const d0 = oblDeg - this.data.oblDeg[this.data.indexAt(0)];
    this.tiltDeltaEl.textContent = 'Δ vs today ' + (d0 >= 0 ? '+' : '−') + Math.abs(d0).toFixed(2) + '°';
    this.insetRenderer.render(this.insetScene, this.insetCamera);
  }

  // Scrolling strip: window of ±WIN_HALF kyr around t, clamped to the data
  // span; the curve scrolls left as time advances
  _drawStrip(index) {
    if (!this._sw) return;
    const ctx = this.sctx;
    const w = this._sw, h = this._sh;
    const ui = this._sui || 1;
    const px = (n) => `${Math.round(n * ui * 10) / 10}px -apple-system, "Segoe UI", sans-serif`;
    const t = T_START + index * DT;

    // clamped sliding window (constant 2·WIN_HALF width)
    let lo = t - WIN_HALF, hi = t + WIN_HALF;
    if (lo < T_START) { lo = T_START; hi = T_START + 2 * WIN_HALF; }
    if (hi > T_END) { hi = T_END; lo = T_END - 2 * WIN_HALF; }

    const x = (tv) => STRIP_PAD.left + ((tv - lo) / (hi - lo)) * (w - STRIP_PAD.left - STRIP_PAD.right);
    const y = (v) => STRIP_PAD.top + (1 - (v - this.qMin) / (this.qMax - this.qMin)) * (h - STRIP_PAD.top - STRIP_PAD.bottom);

    ctx.clearRect(0, 0, w, h);

    // vertical grid + time labels every 50 kyr inside the window
    ctx.strokeStyle = C.grid;
    ctx.fillStyle = C.tickText;
    ctx.lineWidth = 1;
    ctx.font = px(9);
    ctx.textAlign = 'center';
    for (let g = Math.ceil(lo / 50) * 50; g <= hi; g += 50) {
      const gx = x(g);
      ctx.beginPath();
      ctx.moveTo(gx, STRIP_PAD.top);
      ctx.lineTo(gx, h - STRIP_PAD.bottom);
      ctx.stroke();
      ctx.fillText(g === 0 ? '0' : (g < 0 ? '−' : '+') + Math.abs(g), gx, h - 3);
    }

    // y range labels
    ctx.textAlign = 'right';
    ctx.fillText(this.qMax.toFixed(0), STRIP_PAD.left - 4, STRIP_PAD.top + 8);
    ctx.fillText(this.qMin.toFixed(0), STRIP_PAD.left - 4, h - STRIP_PAD.bottom);

    // curve across the window
    const i0 = Math.max(0, Math.round((lo - T_START) / DT));
    const i1 = Math.min(this.data.n - 1, Math.round((hi - T_START) / DT));
    ctx.save();
    ctx.beginPath();
    ctx.rect(STRIP_PAD.left, 0, w - STRIP_PAD.left - STRIP_PAD.right, h);
    ctx.clip();
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const px_ = x(T_START + i * DT);
      const py = y(this.qSeries[i]);
      if (i === i0) ctx.moveTo(px_, py);
      else ctx.lineTo(px_, py);
    }
    ctx.strokeStyle = C.line;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 4 * ui;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5 * ui;
    ctx.stroke();

    // "now" cursor + dot
    const cx = x(t);
    const cy = y(this.qSeries[index]);
    ctx.strokeStyle = C.playhead;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, STRIP_PAD.top);
    ctx.lineTo(cx, h - STRIP_PAD.bottom);
    ctx.stroke();
    ctx.fillStyle = C.line;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6 * ui, 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    // title + current value + Δ vs today
    ctx.textAlign = 'left';
    ctx.font = px(10);
    ctx.fillStyle = C.title;
    ctx.fillText('65°N June insolation (W/m²)', STRIP_PAD.left, 11);
    const qNow = this.qSeries[index];
    const dq = qNow - this.q0;
    ctx.textAlign = 'right';
    ctx.font = 'bold ' + px(11);
    ctx.fillStyle = C.line;
    const valStr = qNow.toFixed(0);
    ctx.fillText(valStr, w - STRIP_PAD.right, 11);
    const valW = ctx.measureText(valStr).width;
    ctx.font = px(10);
    ctx.fillStyle = C.tickText;
    ctx.fillText('Δ vs today ' + (dq >= 0 ? '+' : '') + dq.toFixed(0),
      w - STRIP_PAD.right - valW - 8, 11);
  }
}
