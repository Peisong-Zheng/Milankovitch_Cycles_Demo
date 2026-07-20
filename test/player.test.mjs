// 播放引擎循环规则自检
import { Player, SPEED_KYR_PER_SEC } from '../js/player.js';

// 每帧前进 0.25 kyr（由速度常量反推 dt，与具体速度解耦）
const dt = 0.25 / SPEED_KYR_PER_SEC;

// 1. 跨过 0 kyr → 回卷到 -1000（保留过冲）
let p = new Player();
p.t = -0.1;
p.update(dt);
console.log('跨过现在: -0.1 ->', p.t.toFixed(2), '(期望 ≈ -999.85)');
if (p.t > -999 || p.t < -1000) throw new Error('跨过 0 的回卷不正确');

// 2. 从未来区播过 +60 → 回卷到 -1000
p = new Player();
p.t = 59.95;
p.update(dt);
console.log('播过未来末端: 59.95 ->', p.t.toFixed(2), '(期望 ≈ -999.80)');
if (p.t > -999 || p.t < -1000) throw new Error('未来末端的回卷不正确');

// 3. 正常前进不触发回卷
p = new Player();
p.t = -500;
p.update(dt);
const expect = -500 + SPEED_KYR_PER_SEC * dt;
console.log('正常前进: -500 ->', p.t.toFixed(2), `(期望 ${expect.toFixed(2)})`);
if (Math.abs(p.t - expect) > 1e-9) throw new Error('正常前进不正确');

// 4. seek 暂停并截断范围
p = new Player();
p.seek(999);
console.log('seek(999): t =', p.t, '| playing =', p.playing, '(期望 t=60, playing=false)');
if (p.t !== 60 || p.playing) throw new Error('seek 不正确');

console.log('OK: 播放引擎循环规则自检通过');
