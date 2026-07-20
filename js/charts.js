// Canvas time series: progressive reveal, playhead, current value, grid & ticks

import { T_START, T_END } from './data.js';

const PAD = { left: 58, right: 16, top: 24, bottom: 22 };
const X_TICKS = [-1000, -800, -600, -400, -200, 0, 60];

// dark-theme palette
const C = {
  grid: 'rgba(148, 163, 184, 0.12)',
  tickText: 'rgba(148, 163, 184, 0.9)',
  future: 'rgba(148, 163, 184, 0.06)',
  zero: 'rgba(226, 232, 240, 0.28)',
  present: 'rgba(251, 191, 36, 0.55)',
  presentText: 'rgba(251, 191, 36, 0.85)',
  playhead: 'rgba(226, 232, 240, 0.35)',
  title: 'rgba(226, 232, 240, 0.92)',
};

export class TimeChart {
  /**
   * opts: { title, color, getValues(data)->Float64Array, fmt(v)->string,
   *         zeroLine?: bool, showXAxis?: bool }
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts;
    this.ctx = canvas.getContext('2d');

    this._resize = this._resize.bind(this);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(canvas);
    this._resize();
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = w;
    this._h = h;
    // UI scale: shrink fonts/lines on narrow (e.g. phone) canvases
    this._ui = Math.max(0.72, Math.min(1, w / 900));
    this.dirty = true; // canvas content was cleared by the resize
  }

  _x(t) {
    return PAD.left + ((t - T_START) / (T_END - T_START)) * (this._w - PAD.left - PAD.right);
  }

  _y(v) {
    const { ymin, ymax } = this;
    return PAD.top + (1 - (v - ymin) / (ymax - ymin)) * (this._h - PAD.top - PAD.bottom);
  }

  draw(data, index) {
    const { ctx, opts } = this;
    if (!this._w) return;
    const values = opts.getValues(data);

    // y range: data min/max + 6% padding (cached on first draw)
    if (!this._rangeReady) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < values.length; i++) {
        if (values[i] < lo) lo = values[i];
        if (values[i] > hi) hi = values[i];
      }
      const pad = (hi - lo) * 0.06 || 1;
      this.ymin = lo - pad;
      this.ymax = hi + pad;
      this._rangeReady = true;
    }

    const w = this._w, h = this._h;
    const ui = this._ui || 1;
    const px = (n) => `${Math.round(n * ui * 10) / 10}px -apple-system, "Segoe UI", sans-serif`;
    ctx.clearRect(0, 0, w, h);

    // future region (0 ~ +60 kyr) shading
    const x0 = this._x(0);
    ctx.fillStyle = C.future;
    ctx.fillRect(x0, PAD.top, w - PAD.right - x0, h - PAD.top - PAD.bottom);

    // vertical grid lines and x tick labels
    ctx.strokeStyle = C.grid;
    ctx.fillStyle = C.tickText;
    ctx.lineWidth = 1;
    ctx.font = px(10);
    ctx.textAlign = 'center';
    for (const t of X_TICKS) {
      const x = this._x(t);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, h - PAD.bottom);
      ctx.stroke();
      if (opts.showXAxis) {
        ctx.fillText(t === 0 ? '0' : String(t), x, h - 8);
      }
    }

    // y axis min/max labels
    ctx.textAlign = 'right';
    ctx.fillText(opts.fmt(this.ymax), PAD.left - 6, PAD.top + 9);
    ctx.fillText(opts.fmt(this.ymin), PAD.left - 6, h - PAD.bottom);

    // zero line (precession chart)
    if (opts.zeroLine) {
      const y = this._y(0);
      ctx.strokeStyle = C.zero;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(w - PAD.right, y);
      ctx.stroke();
    }

    // t = 0 "Present" dashed line
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = C.present;
    ctx.beginPath();
    ctx.moveTo(x0, PAD.top);
    ctx.lineTo(x0, h - PAD.bottom);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.presentText;
    ctx.textAlign = 'left';
    ctx.fillText('Present', x0 + 4, PAD.top + 10);

    // progressively revealed curve (0 .. index): wide soft underlay, then main line
    const plotBottom = h - PAD.bottom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, w - PAD.left - PAD.right, plotBottom - PAD.top);
    ctx.clip();

    ctx.beginPath();
    const stepT = (T_END - T_START) / (data.n - 1);
    for (let i = 0; i <= index; i++) {
      const x = this._x(T_START + i * stepT);
      const y = this._y(values[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = opts.color;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 5 * ui;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.6 * ui;
    ctx.stroke();

    // playhead and current point
    const headX = this._x(T_START + index * stepT);
    const headY = this._y(values[index]);
    ctx.strokeStyle = C.playhead;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headX, PAD.top);
    ctx.lineTo(headX, plotBottom);
    ctx.stroke();

    ctx.fillStyle = opts.color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(headX, headY, 7 * ui, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(headX, headY, 3 * ui, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // title and current value
    ctx.textAlign = 'left';
    ctx.font = px(12);
    ctx.fillStyle = C.title;
    ctx.fillText(opts.title, PAD.left, 15);
    ctx.textAlign = 'right';
    ctx.fillStyle = opts.color;
    ctx.font = 'bold ' + px(13);
    ctx.fillText(opts.fmt(values[index]), w - PAD.right, 15);
  }
}
