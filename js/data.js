// 轨道数据加载与解析：偏心率 e、地轴倾角 obl、岁差指数 pre = e·sinϖ、65°N 夏至日照
// 数据源：orb_data/*.txt，两列（时间 kyr, 数值），范围 -1000 ~ +60 kyr，步长 0.1 kyr

export const T_START = -1000; // kyr
export const T_END = 60;      // kyr
export const DT = 0.1;        // kyr

const TWO_PI = Math.PI * 2;
// 岁差指数主周期约 21 kyr → 每步(0.1 kyr)预期 ϖ 增量，用于连续性展开的初猜
const EXPECTED_DRIFT = TWO_PI / (21 / DT);

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

// 解析单个两列文本 -> { t, v }（Float64Array）
export function parseColumn(text) {
  const lines = text.trim().split(/\r?\n/);
  const t = new Float64Array(lines.length);
  const v = new Float64Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    t[i] = parseFloat(parts[0]);
    v[i] = parseFloat(parts[1]);
  }
  return { t, v };
}

// 由 s = sinϖ 序列按连续性展开 ϖ（弧度，单调累进不取模）
// drift：每步预期增量（rad），作为分支选择的中心
export function unwrapLongitude(s, drift) {
  const n = s.length;
  const out = new Float64Array(n);
  out[0] = Math.asin(clamp(s[0], -1, 1));
  for (let i = 1; i < n; i++) {
    const a = Math.asin(clamp(s[i], -1, 1));
    const target = out[i - 1] + drift;
    let best = 0;
    let bestDist = Infinity;
    // sinϖ = s 的两个分支：a 与 π - a，各自可加 2πk
    for (const base of [a, Math.PI - a]) {
      const k = Math.round((target - base) / TWO_PI);
      const cand = base + k * TWO_PI;
      const dist = Math.abs(cand - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
    out[i] = best;
  }
  return out;
}

// 展开平滑度：相邻步增量的二阶差分平方和（越小越平滑）
function smoothness(pi) {
  let acc = 0;
  for (let i = 2; i < pi.length; i++) {
    const d2 = pi[i] - 2 * pi[i - 1] + pi[i - 2];
    acc += d2 * d2;
  }
  return acc;
}

// 由四个文件文本构造完整数据集
export function buildOrbitalData(eccText, oblText, preText, insolText) {
  const ecc = parseColumn(eccText);
  const obl = parseColumn(oblText);
  const pre = parseColumn(preText);
  const insol = parseColumn(insolText);
  const n = ecc.t.length;
  if (obl.t.length !== n || pre.t.length !== n || insol.t.length !== n) {
    throw new Error('数据文件的行数不一致');
  }

  const times = ecc.t;
  // s = pre / e = sinϖ（数值误差可能略超 ±1，需截断）
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = clamp(pre.v[i] / ecc.v[i], -1, 1);

  // ϖ 绕向未知：两种漂移方向各展开一次，取更平滑者
  const piFwd = unwrapLongitude(s, EXPECTED_DRIFT);
  const piRev = unwrapLongitude(s, -EXPECTED_DRIFT);
  const pi = smoothness(piFwd) <= smoothness(piRev) ? piFwd : piRev;

  const oblDeg = new Float64Array(n);
  for (let i = 0; i < n; i++) oblDeg[i] = obl.v[i] * 180 / Math.PI;

  return {
    n,
    times,          // kyr
    ecc: ecc.v,     // 偏心率
    obl: obl.v,     // 地轴倾角 (rad)
    oblDeg,         // 地轴倾角 (°)
    pre: pre.v,     // 岁差指数 e·sinϖ
    pi,             // 近日点经度 ϖ (rad, 未取模)
    insol65: insol.v, // 65°N 夏至日均日照 (W/m²)
    // 时间 -> 最近数据行索引（截断到合法范围）
    indexAt(timeKyr) {
      return clamp(Math.round((timeKyr - times[0]) / DT), 0, n - 1);
    },
  };
}

// 浏览器端加载（需要通过 HTTP 服务访问，file:// 下 fetch 会被拦截）
export async function loadOrbitalData(base = 'orb_data') {
  const [eccText, oblText, preText, insolText] = await Promise.all([
    fetch(`${base}/ecc_1000_60_inter100.txt`).then((r) => r.text()),
    fetch(`${base}/obl_1000_60_inter100.txt`).then((r) => r.text()),
    fetch(`${base}/pre_1000_60_inter100.txt`).then((r) => r.text()),
    fetch(`${base}/insolation_65N_solstice_1000_60_inter100.txt`).then((r) => r.text()),
  ]);
  return buildOrbitalData(eccText, oblText, preText, insolText);
}
