// 季节几何与日照量的纯函数（不依赖 three.js，node 可直接测试）
//
// 记号：ϖ = 近日点经度（相对移动春分点，data.pi），ε = 地轴倾角 obl，
// θ = 真近点角（年相位），Δ = θ − θ_sol。
//
// 岁差分解（与 scene.js 共用同一组常量）：气候岁差 ϖ（~21 kyr）拆成
//   拱线进动（~112 kyr，转动椭圆）+ 赤道进动（~25.7 kyr，转动地轴），
// 两份之和为 1，相对几何严格保持 e·sinϖ。
export const APSIDAL_SHARE = 25.7 / (25.7 + 112); // ≈ 0.187
export const AXIAL_SHARE = 1 - APSIDAL_SHARE;     // ≈ 0.813（逆行）

export const S0 = 1361;              // 太阳常数 W/m²
export const REF_LAT = 65 * Math.PI / 180; // 冰期关键纬线 65°N

const TWO_PI = Math.PI * 2;

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

// 北半球夏至点的真近点角：夏至时地球日心黄经 = 270°（相对春分点）
export function solsticeAnomaly(pi) {
  return 1.5 * Math.PI - pi;
}

// 太阳赤纬 δ：sinδ = sinε·cosΔ（夏至 Δ=0 时 δ=+ε，冬至 δ=−ε）
export function declination(theta, thetaSol, obl) {
  return Math.asin(clamp(Math.sin(obl) * Math.cos(theta - thetaSol), -1, 1));
}

// 太阳仰角 β = δ − ε（夏至 β=0 水平，冬至 β=−2ε）。
// 与"地轴倒向阳光子午线"的几何关系 â·ŝ = sinδ 的纯函数形式（test 锁定）。
export function sunElevation(delta, obl) {
  return Math.asin(clamp(Math.sin(obl) * Math.cos(delta), -1, 1)) - obl;
}

// 季节标签：Δ 归一化到 [0, 2π)，至/分点 ±22.5° 窗口，其间为北半球四季
export function seasonLabel(delta) {
  const d = ((delta % TWO_PI) + TWO_PI) % TWO_PI;
  const seg = Math.floor((d + Math.PI / 8) / (Math.PI / 4)) % 8;
  return [
    'June solstice', 'NH summer', 'September equinox', 'NH autumn',
    'December solstice', 'NH winter', 'March equinox', 'NH spring',
  ][seg];
}

// 65°N 北半球夏至日的日均日照量 W/m²（Berger 公式的日均形式）
// e：偏心率；obl：地轴倾角 rad；thetaSol：夏至点真近点角（决定日地距离）
export function insolationJune65(e, obl, thetaSol) {
  const phi = REF_LAT;
  // 夏至日 (a/r)²：r = a(1−e²)/(1+e·cosθ)
  const ar2 = ((1 + e * Math.cos(thetaSol)) / (1 - e * e)) ** 2;
  // 日出时角 H0（极地极昼/极夜时 |tanφ·tanε|>1，clamp 处理）
  const H0 = Math.acos(clamp(-Math.tan(phi) * Math.tan(obl), -1, 1));
  return (S0 / Math.PI) * ar2 *
    (H0 * Math.sin(phi) * Math.sin(obl) + Math.cos(phi) * Math.cos(obl) * Math.sin(H0));
}
