// 播放引擎：全局时钟、自动循环规则、播放/暂停/跳转状态
import { T_START, T_END } from './data.js';

// 播放速度（kyr / 秒）：5 → 从 1Ma 前到现在一轮约 200 秒
export const SPEED_KYR_PER_SEC = 5;

export class Player {
  constructor() {
    this.t = T_START;
    this.playing = true; // 打开页面默认自动播放
  }

  update(dtSec) {
    if (!this.playing) return;
    const prev = this.t;
    this.t += SPEED_KYR_PER_SEC * dtSec;
    if (this.t >= T_END) {
      this.t = T_START + (this.t - T_END); // 从未来区播过 +60 kyr → 回卷到 -1000
    } else if (prev < 0 && this.t >= 0) {
      this.t = T_START + this.t; // 跨过“现在”(0 kyr) → 回卷到 -1000，保留过冲
    }
  }

  play() {
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  toggle() {
    this.playing = !this.playing;
    return this.playing;
  }

  // 用户拖动进度条：跳转并停止自动播放
  seek(t) {
    this.t = Math.min(T_END, Math.max(T_START, t));
    this.pause();
  }
}
