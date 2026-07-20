// 轨道视图符号约定自检（非浏览器代码，node 直接运行）
//
// 锁定 js/scene.js 与 js/earthview.js 的四个约定（2026-07 修复"镜像太阳系"问题）：
//   1. 公转：从北极上空（相机侧）看为逆时针 CCW（顺行）
//   2. 拱线进动：近日点沿轨道 CCW（顺行，与公转同向）
//   3. 赤道进动：地轴方位 CW（逆行，与公转反向）
//   4. 夏至约束：北半球夏至（地轴倒向太阳）落在真近点角 θ = 270° − ϖ
//      （与右屏 "NH summer solstice" 读数一致）
//
// 约定内容：ellipsePoint 的 z0 取负号（镜像椭圆）、w = pi0 + APSIDAL_SHARE·Δϖ、
// 地轴方位 α_ax = π − AXIAL_SHARE·Δϖ、右屏 γ = −AXIAL_SHARE·Δϖ。
// 方向判别必须用小步长（≤10 kyr），否则岁差长周期会在角度回绕中产生混叠假象。
//
// 跨屏同步说明（约束 5）：左屏地轴方位 α_ax 与右屏地轴 γ 由同一量 −AXIAL_SHARE·Δϖ
// 驱动（只差各自视角的常数相位 π 与 ALPHA_S），且左屏夏至点的惯性方位
// L_sol = θ_sol + w + π/2 = 2π − AXIAL_SHARE·Δϖ 的漂移率与之完全相同。
// 所以两屏岁差严格同步；看起来"不同步"只是因为左屏还叠加了 30 s 的年相位公转。
//
// 运行：node tools/check_orbit_signs.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildOrbitalData } from '../js/data.js';
import { APSIDAL_SHARE, AXIAL_SHARE, solsticeAnomaly } from '../js/insolation.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = buildOrbitalData(
  readFileSync(join(root, 'orb_data/ecc_1000_60_inter100.txt'), 'utf8'),
  readFileSync(join(root, 'orb_data/obl_1000_60_inter100.txt'), 'utf8'),
  readFileSync(join(root, 'orb_data/pre_1000_60_inter100.txt'), 'utf8'),
);

const DEG = 180 / Math.PI;
const ECC_GAIN = 3; // 与 scene.js 一致

// —— 与 scene.js 相同的场景数学 ——
function ellipsePoint(theta, e, w) {
  const r = 10 * (1 - e * e) / (1 + e * Math.cos(theta));
  const x0 = r * Math.cos(theta), z0 = -r * Math.sin(theta); // 镜像
  const cw = Math.cos(w), sw = Math.sin(w);
  return [x0 * cw + z0 * sw, 0, -x0 * sw + z0 * cw];
}
const orbW = (idx) => data.pi[0] + APSIDAL_SHARE * (data.pi[idx] - data.pi[0]);
const orbE = (idx) => Math.min(data.ecc[idx] * ECC_GAIN, 0.9);
const axisAz = (idx) => Math.PI - AXIAL_SHARE * (data.pi[idx] - data.pi[0]);

// —— 相机 (0,22,32) 看向原点的屏幕投影：sx = x，sy = 0.8242·y − 0.5666·z ——
const projAng = (p) => Math.atan2(0.8242 * p[1] - 0.5666 * p[2], p[0]);
const wrapPi = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

function fail(msg) { throw new Error(msg); }

// 1. 公转方向：θ 小步前进，屏幕方位角应增加（CCW）
{
  const i = 5000, e = orbE(i), w = orbW(i);
  const d = wrapPi(projAng(ellipsePoint(1.05, e, w)) - projAng(ellipsePoint(1.0, e, w)));
  console.log('公转(0.05 rad):', (d * DEG).toFixed(2), '°');
  if (d <= 0) fail('公转方向应为 CCW（屏幕角增加）');
}

// 2. 拱线进动：10 kyr 步长（远小于 112 kyr 周期），近日点屏幕角应增加（CCW 顺行）
{
  const d = wrapPi(projAng(ellipsePoint(0, orbE(5100), orbW(5100)))
    - projAng(ellipsePoint(0, orbE(5000), orbW(5000))));
  console.log('拱线进动(10 kyr):', (d * DEG).toFixed(2), '°');
  if (d <= 0) fail('拱线进动应为顺行 CCW');
}

// 3. 赤道进动：1 kyr 步长（远小于 25.7 kyr 周期），地轴方位屏幕角应减小（CW 逆行）
{
  const dir = (a) => [Math.sin(a), 0, Math.cos(a)];
  const d = wrapPi(projAng(dir(axisAz(5010))) - projAng(dir(axisAz(5000))));
  console.log('赤道进动(1 kyr):', (d * DEG).toFixed(2), '°');
  if (d >= 0) fail('赤道进动应为逆行 CW');
}

// 4. 夏至约束：θ_sol = 270°−ϖ 处 â·(−p̂) = +sin(obl)（轴倒向太阳）
{
  for (const t of [-998.4, -700, -500, -250, -100, 0]) {
    const idx = data.indexAt(t);
    const obl = data.obl[idx];
    const aa = axisAz(idx);
    const ax = Math.sin(obl) * Math.sin(aa), az = Math.sin(obl) * Math.cos(aa);
    const p = ellipsePoint(solsticeAnomaly(data.pi[idx]), orbE(idx), orbW(idx));
    const pn = Math.hypot(p[0], p[2]);
    const dot = -(ax * p[0] + az * p[2]) / pn;
    if (Math.abs(dot - Math.sin(obl)) > 1e-9) {
      fail(`夏至约束失败 @t=${t}: â·(−p̂)=${dot.toFixed(6)} ≠ sin(obl)=${Math.sin(obl).toFixed(6)}`);
    }
  }
  console.log('夏至约束: â·(−p̂) = sin(obl) @ θ = 270°−ϖ（6 个采样时刻）');
}

// 5. 跨屏岁差同步：左屏夏至点的惯性方位漂移 == 左屏地轴方位漂移
//    == 右屏 γ 漂移 == −AXIAL_SHARE·Δϖ（1 kyr 小步长，xz 平面方位角）
{
  const solAz = (idx) => {
    const p = ellipsePoint(solsticeAnomaly(data.pi[idx]), orbE(idx), orbW(idx));
    return Math.atan2(p[0], p[2]);
  };
  const gamma = (idx) => -AXIAL_SHARE * (data.pi[idx] - data.pi[0]); // 右屏地轴角
  for (const t of [-998.4, -700, -500, -250, -100, 0]) {
    const i0 = data.indexAt(t), i1 = i0 + 10; // 1 kyr 步长
    const dSol = wrapPi(solAz(i1) - solAz(i0));
    const dAxis = wrapPi(axisAz(i1) - axisAz(i0));
    const dGamma = wrapPi(gamma(i1) - gamma(i0));
    if (Math.abs(dSol - dAxis) > 1e-9 || Math.abs(dGamma - dAxis) > 1e-9) {
      fail(`跨屏同步失败 @t=${t}: 夏至点漂移 ${dSol} / 左轴 ${dAxis} / 右屏γ ${dGamma}`);
    }
  }
  console.log('跨屏同步: 夏至点惯性漂移 = 左屏地轴 = 右屏γ = −AXIAL_SHARE·Δϖ（6 个采样）');
}

// 6. 夏季距离自检（summerview.js 同源公式）：r_sol = a(1−e²)/(1+e·cosθ_sol)
//    现代（t=0）夏至在远日点附近 → r_sol ≈ 1.016a；全序列范围 ⊂ [1−e_max, 1+e_max]
{
  let rMin = Infinity, rMax = -Infinity, eMax = 0;
  for (let i = 0; i < data.n; i++) {
    const e = data.ecc[i];
    const r = (1 - e * e) / (1 + e * Math.cos(solsticeAnomaly(data.pi[i])));
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (e > eMax) eMax = e;
  }
  const i0 = data.indexAt(0);
  const e0 = data.ecc[i0];
  const r0 = (1 - e0 * e0) / (1 + e0 * Math.cos(solsticeAnomaly(data.pi[i0])));
  console.log('夏季距离: r_sol(0) =', r0.toFixed(4) + 'a，范围', rMin.toFixed(4) + ' ~', rMax.toFixed(4));
  if (Math.abs(r0 - 1.0163) > 0.002) {
    fail(`现代夏至日地距离应 ≈1.016a（远日点附近），实测 ${r0.toFixed(4)}`);
  }
  if (rMin < 1 - eMax - 1e-9 || rMax > 1 + eMax + 1e-9) {
    fail(`r_sol 超出 [1−e_max, 1+e_max] 物理范围: ${rMin} ~ ${rMax}, eMax=${eMax}`);
  }
}

console.log('OK: 轨道符号约定全部成立（公转CCW / 拱线顺行 / 赤道逆行 / 夏至位置 / 跨屏同步 / 夏季距离）');
