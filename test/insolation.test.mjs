// 季节几何与日照量公式的 node 自检（非浏览器代码）
import {
  APSIDAL_SHARE, AXIAL_SHARE,
  solsticeAnomaly, declination, seasonLabel, sunElevation, insolationJune65,
} from '../js/insolation.js';

const DEG = Math.PI / 180;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 0. 岁差分解份额之和为 1
if (!near(APSIDAL_SHARE + AXIAL_SHARE, 1, 1e-12)) throw new Error('岁差份额之和 != 1');

// 1. δ 在夏至点 = +ε，半年后 = −ε
const eps = 23.44 * DEG;
const pi = 102.9 * DEG; // 现代近日点经度
const thSol = solsticeAnomaly(pi);
console.log('θ_sol =', (thSol / DEG).toFixed(1), '°（现代近日点 ϖ = 102.9°）');
if (!near(declination(thSol, thSol, eps), eps, 1e-12)) throw new Error('δ(夏至) != +ε');
if (!near(declination(thSol + Math.PI, thSol, eps), -eps, 1e-12)) throw new Error('δ(冬至) != −ε');
console.log('OK: δ(夏至) = +ε, δ(冬至) = −ε');

// 2. δ 几何关系锁定：地轴倒向阳光子午线（方位角 α_s 任意）、
//    太阳仰角 β = sunElevation(Δ, ε) 时 â·ŝ = sinδ 严格成立。
//    （纯函数关系；v3/v4 右屏光照模型曾用此约定，现右屏为固定光照方案）
for (const alphaS of [0, -1.0, 2.3]) {
  for (const delta of [0, 0.9, 2.4, 4.0]) {
    const beta = sunElevation(delta, eps);
    const ax = Math.sin(eps) * Math.sin(alphaS);
    const ay = Math.cos(eps);
    const az = Math.sin(eps) * Math.cos(alphaS);
    const sx = Math.cos(beta) * Math.sin(alphaS);
    const sy = Math.sin(beta);
    const sz = Math.cos(beta) * Math.cos(alphaS);
    const dot = ax * sx + ay * sy + az * sz; // â·ŝ
    const expect = Math.sin(declination(delta, 0, eps)); // sinδ（θ_sol=0 时 Δ=θ−θ_sol）
    if (!near(dot, expect, 1e-12)) throw new Error(`â·ŝ != sinδ (α_s=${alphaS}, Δ=${delta})`);
  }
}
// β 的端点：夏至 0（阳光水平）、冬至 −2ε
if (!near(sunElevation(0, eps), 0, 1e-12)) throw new Error('β(夏至) != 0');
if (!near(sunElevation(Math.PI, eps), -2 * eps, 1e-12)) throw new Error('β(冬至) != −2ε');
console.log('OK: â·ŝ = sinδ 几何关系成立（固定轴 + 太阳仰角摆动）');

// 3. 现代参数下 65°N 夏至日均日照在合理范围
const q = insolationJune65(0.0167, eps, thSol);
console.log('现代 65°N 夏至日照 Q =', q.toFixed(1), 'W/m²（期望 400 ~ 600）');
if (q < 400 || q > 600) throw new Error('Q 超出合理范围');

// 4. 同一 ε 下，夏至在近日点的 Q 应大于在远日点的 Q
const qPeri = insolationJune65(0.05, eps, 0);
const qAp = insolationJune65(0.05, eps, Math.PI);
console.log('夏至@近日点:', qPeri.toFixed(1), 'W/m² | 夏至@远日点:', qAp.toFixed(1), 'W/m²');
if (qPeri <= qAp) throw new Error('近日点夏至的日照应大于远日点');

// 5. 季节标签
const cases = [
  [0, 'June solstice'], [Math.PI / 4, 'NH summer'],
  [Math.PI / 2, 'September equinox'], [(3 * Math.PI) / 4, 'NH autumn'],
  [Math.PI, 'December solstice'], [(5 * Math.PI) / 4, 'NH winter'],
  [(3 * Math.PI) / 2, 'March equinox'], [(7 * Math.PI) / 4, 'NH spring'],
  [-0.1, 'June solstice'],
];
for (const [d, want] of cases) {
  const got = seasonLabel(d);
  if (got !== want) throw new Error(`seasonLabel(${d}) = ${got}，期望 ${want}`);
}
console.log('OK: 季节标签窗口正确');

console.log('OK: 季节几何与日照量自检通过');
