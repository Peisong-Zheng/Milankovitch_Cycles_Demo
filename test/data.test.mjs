// 数据解析与 ϖ 重建的 node 自检（非浏览器代码）
import { readFileSync } from 'node:fs';
import { buildOrbitalData, DT } from '../js/data.js';

const ecc = readFileSync('orb_data/ecc_1000_60_inter100.txt', 'utf8');
const obl = readFileSync('orb_data/obl_1000_60_inter100.txt', 'utf8');
const pre = readFileSync('orb_data/pre_1000_60_inter100.txt', 'utf8');
const insol = readFileSync('orb_data/insolation_65N_solstice_1000_60_inter100.txt', 'utf8');

const d = buildOrbitalData(ecc, obl, pre, insol);

const minmax = (a) => [Math.min(...a), Math.max(...a)];
console.log('行数 n =', d.n, '| 时间范围:', d.times[0], '->', d.times[d.n - 1]);
console.log('ecc 范围:', minmax(d.ecc).map((x) => x.toFixed(6)).join(' ~ '));
console.log('obl 范围:', minmax(d.oblDeg).map((x) => x.toFixed(3)).join(' ~ '), 'deg');
const [qLo, qHi] = minmax(d.insol65);
console.log('insol65 范围:', qLo.toFixed(1), '~', qHi.toFixed(1), 'W/m²');
if (qLo < 380 || qHi > 580) throw new Error('insol65 超出 65°N 夏至日照合理范围');

// ϖ 重建质量：每步增量应小而平滑（预期 ~0.03 rad/step）
const dw = [];
for (let i = 1; i < d.n; i++) dw.push(d.pi[i] - d.pi[i - 1]);
const [lo, hi] = minmax(dw);
const mean = dw.reduce((a, b) => a + b, 0) / dw.length;
console.log('dϖ/step: min %.4f max %.4f mean %.4f rad（期望 |dϖ| 远小于 π）', lo, hi, mean);
console.log('ϖ 总跨度: %.1f rad = %.1f 圈', d.pi[d.n - 1] - d.pi[0], (d.pi[d.n - 1] - d.pi[0]) / (2 * Math.PI));

// 重建精度：sin(ϖ)·e 应还原 pre 列
let maxErr = 0;
for (let i = 0; i < d.n; i++) {
  maxErr = Math.max(maxErr, Math.abs(d.ecc[i] * Math.sin(d.pi[i]) - d.pre[i]));
}
console.log('还原 pre 的最大误差:', maxErr.toExponential(2), '（应接近 1e-6 量级）');

// indexAt 边界
console.log('indexAt(-1000) =', d.indexAt(-1000), '| indexAt(0) =', d.indexAt(0), '| indexAt(60) =', d.indexAt(60), '| indexAt(999) =', d.indexAt(999));
if (d.indexAt(0) !== Math.round(1000 / DT)) throw new Error('indexAt(0) 不正确');

if (Math.max(Math.abs(lo), Math.abs(hi)) > 0.5) throw new Error('dϖ 步进过大，展开可能有跳支');
console.log('OK: 数据解析与 ϖ 重建自检通过');
