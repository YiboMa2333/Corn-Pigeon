/**
 * 音频模块 - 使用 Web Audio API 程序化生成所有音效
 * 零外部音频资源，符合设计规范
 */

// 音效类型
const SoundType = {
  GOOD: "good", // 好玉米：清脆"啾"声
  BAD: "bad", // 坏玉米：低沉"咚"声
  BONUS: "bonus", // Combo 额外得分：明亮上扬音
  DASH: "dash", // 冲刺：短促风声
  DIRECTION: "direction", // 方向切换：嗖声
  START: "start", // 游戏开始：欢快上行
  END: "end", // 游戏结束：下行
};

class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {boolean} */
    this.muted = false;
    /** @type {GainNode|null} */
    this.masterGain = null;
  }

  /** 必须在用户首次交互后调用，以解除浏览器自动播放限制 */
  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.35;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn("Web Audio API 不可用：", e);
    }
  }

  /** 恢复被浏览器挂起的上下文（iOS 常见） */
  resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 0.35;
    }
  }

  /**
   * 播放一个简单的振荡器音效
   * @param {Object} opts
   * @param {OscillatorType} opts.type - 波形
   * @param {number} opts.freqStart - 起始频率
   * @param {number} [opts.freqEnd] - 结束频率（用于滑音）
   * @param {number} opts.duration - 时长（秒）
   * @param {number} [opts.volume] - 音量 0~1
   * @param {number} [opts.attack] - 起音时间
   * @param {number} [opts.release] - 释音时间
   */
  _playTone({
    type = "sine",
    freqStart,
    freqEnd,
    duration,
    volume = 0.5,
    attack = 0.005,
    release = 0.08,
  }) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, freqEnd),
        now + duration
      );
    }

    // ADSR 包络
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.linearRampToValueAtTime(
      volume * 0.6,
      now + duration - release
    );
    gain.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** 播放噪声（用于冲刺风声、方向切换） */
  _playNoise({ duration = 0.2, volume = 0.2, filterFreq = 1000 }) {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + duration);
  }

  /** 根据类型播放音效 */
  play(type) {
    if (!this.ctx) return;
    this.resume();
    switch (type) {
      case SoundType.GOOD:
        // 清脆"啾"：高频正弦快速上滑 + 二次谐波
        this._playTone({
          type: "sine",
          freqStart: 880,
          freqEnd: 1760,
          duration: 0.12,
          volume: 0.4,
          release: 0.06,
        });
        this._playTone({
          type: "triangle",
          freqStart: 1320,
          freqEnd: 2640,
          duration: 0.08,
          volume: 0.2,
          release: 0.04,
        });
        break;

      case SoundType.BAD:
        // 低沉"咚"：低频三角波
        this._playTone({
          type: "triangle",
          freqStart: 180,
          freqEnd: 80,
          duration: 0.22,
          volume: 0.5,
          attack: 0.005,
          release: 0.12,
        });
        this._playTone({
          type: "sine",
          freqStart: 90,
          freqEnd: 50,
          duration: 0.25,
          volume: 0.3,
        });
        break;

      case SoundType.BONUS:
        // Combo 奖励：明亮三音上行
        this._playTone({
          type: "square",
          freqStart: 1046,
          duration: 0.08,
          volume: 0.22,
        });
        setTimeout(
          () =>
            this._playTone({
              type: "square",
              freqStart: 1318,
              duration: 0.08,
              volume: 0.22,
            }),
          70
        );
        setTimeout(
          () =>
            this._playTone({
              type: "square",
              freqStart: 1568,
              duration: 0.12,
              volume: 0.25,
            }),
          140
        );
        break;

      case SoundType.DASH:
        // 冲刺：短噪声 + 频率下滑
        this._playNoise({ duration: 0.12, volume: 0.15, filterFreq: 1800 });
        this._playTone({
          type: "sine",
          freqStart: 600,
          freqEnd: 200,
          duration: 0.1,
          volume: 0.15,
        });
        break;

      case SoundType.DIRECTION:
        // 方向切换：嗖声（噪声带通扫频）
        this._playNoise({ duration: 0.3, volume: 0.25, filterFreq: 2200 });
        this._playTone({
          type: "sawtooth",
          freqStart: 200,
          freqEnd: 1200,
          duration: 0.25,
          volume: 0.18,
        });
        break;

      case SoundType.START:
        // 开始：do-mi-sol 上行
        [523, 659, 784, 1046].forEach((f, i) => {
          setTimeout(
            () =>
              this._playTone({
                type: "triangle",
                freqStart: f,
                duration: 0.14,
                volume: 0.35,
              }),
            i * 90
          );
        });
        break;

      case SoundType.END:
        // 结束：下行
        [784, 659, 523, 392].forEach((f, i) => {
          setTimeout(
            () =>
              this._playTone({
                type: "triangle",
                freqStart: f,
                duration: 0.2,
                volume: 0.35,
              }),
            i * 120
          );
        });
        break;
    }
  }
}

// 单例
export const audioManager = new AudioManager();
export { SoundType };
