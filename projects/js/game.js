/**
 * 游戏主逻辑
 * 负责：游戏状态机、主循环、计分/计时/Combo/难度递增、
 *       鸽子与玉米棒协调、输入处理、UI 更新回调
 */

import { CornCob, BAD_RATIO_INITIAL, BAD_RATIO_MAX } from "./corn.js";
import { Pigeon, PigeonState } from "./pigeon.js";
import { particleSystem } from "./particles.js";
import { background } from "./background.js";
import { audioManager, SoundType } from "./audio.js";

const GameState = {
  LOADING: "loading",
  READY: "ready",
  PLAYING: "playing",
  ENDED: "ended",
};

const GAME_DURATION = 60; // 秒
const DIRECTION_INTERVAL = 15; // 秒
const GOOD_SCORE = 10;
const BAD_SCORE = -15;
const COMBO_BONUS = 5;
const COMBO_THRESHOLD = 3;

class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} ui - UI 元素与回调集合
   */
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ui = ui;

    this.state = GameState.LOADING;
    this.score = 0;
    this.timeLeft = GAME_DURATION;
    this.combo = 0;
    this.maxCombo = 0;
    this.goodCount = 0;

    this.lastTime = 0;
    this.rafId = 0;
    this.dpr = 1;

    // 游戏对象在 resize 时创建
    this.corn = null;
    this.pigeon = null;

    this._boundLoop = this._loop.bind(this);
    this._boundResize = this._resize.bind(this);
  }

  /** 初始化画布尺寸与游戏对象 */
  init() {
    window.addEventListener("resize", this._boundResize);
    this._resize();
    // 创建游戏对象（圆盘造型：圆形玉米芯 + 一圈玉米粒，鸽子沿正圆轨道绕飞）
    const { cx, cy, coreRadius, orbitRadius } = this._calcLayout();
    this.corn = new CornCob(cx, cy, coreRadius);
    this.pigeon = new Pigeon({
      cx,
      cy,
      orbitX: orbitRadius,
      orbitY: orbitRadius,
    });
    this.pigeon.directionInterval = DIRECTION_INTERVAL;
    this.pigeon.onDirectionFlash = () => {
      audioManager.play(SoundType.DIRECTION);
      this.ui.onDirectionFlash && this.ui.onDirectionFlash();
    };

    this.state = GameState.READY;
  }

  /** 根据画布尺寸计算布局（圆盘玉米 + 正圆轨道） */
  _calcLayout() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const baseUnit = Math.min(w, h);
    // 玉米芯半径：约短边的 17%，外半径 = coreRadius * 1.55
    const coreRadius = Math.max(46, Math.min(95, baseUnit * 0.17));
    const outerRadius = coreRadius * 1.55;
    const cx = w / 2;
    // 竖直居中略偏上，给顶部 HUD 留空间
    const cy = h * 0.52;
    // 鸽子轨道半径 = 玉米外半径 + 一个身位的间隙，沿玉米外圈飞行
    const orbitRadius = outerRadius + Math.max(28, baseUnit * 0.06);
    return { cx, cy, coreRadius, orbitRadius };
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    background.resize(w, h);
    if (this.corn && this.pigeon) {
      const { cx, cy, coreRadius, orbitRadius } = this._calcLayout();
      this.corn.resize(cx, cy, coreRadius);
      this.pigeon.resize({
        cx,
        cy,
        orbitX: orbitRadius,
        orbitY: orbitRadius,
      });
    }
  }

  /** 开始/重新开始游戏 */
  start() {
    this.score = 0;
    this.timeLeft = GAME_DURATION;
    this.combo = 0;
    this.maxCombo = 0;
    this.goodCount = 0;
    particleSystem.clear();
    this.corn.refresh(BAD_RATIO_INITIAL);
    this.pigeon.angle = -Math.PI / 2;
    this.pigeon.directionTimer = 0;
    this.pigeon.state = PigeonState.ORBIT;
    this.state = GameState.PLAYING;

    audioManager.play(SoundType.START);
    this.ui.onScoreChange(this.score);
    this.ui.onTimeChange(this.timeLeft);
    this.ui.onComboChange(0);

    if (!this.rafId) {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this._boundLoop);
    }
  }

  /** 玩家点击/触摸触发啄击 */
  handlePeck() {
    if (this.state !== GameState.PLAYING) return;
    if (this.pigeon.isPecking()) return;

    // 鸽子当前绕玉米的轨道角，玉米据此找到角度最接近的存活玉米粒
    const result = this.corn.peck(this.pigeon.angle);
    // 预览啄击路径：红色虚线提示目标位置
    this.pigeon.previewTarget = { x: result.x, y: result.y };
    // 鸽子冲向玉米粒位置（即使没啄中，也啄向芯子表面）
    this.pigeon.startPeck(result.x, result.y);
    audioManager.play(SoundType.DASH);

    if (result.kernel) {
      this._onKernelHit(result);
    }

    // 刷新规则：当所有好玉米都被啄完（或整圈被清空）时刷新一圈新玉米。
    // 这样避免玩家只啄好玉米、留下坏玉米导致无玉米可啄的卡场情况。
    if (
      this.corn.aliveGoodCount() === 0 ||
      this.corn.aliveCount() === 0
    ) {
      this._refreshCorn();
    }
  }

  _onKernelHit(result) {
    if (result.good) {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.goodCount++;
      let gained = GOOD_SCORE;
      let isBonus = false;
      if (this.combo >= COMBO_THRESHOLD) {
        gained += COMBO_BONUS;
        isBonus = true;
        audioManager.play(SoundType.BONUS);
      } else {
        audioManager.play(SoundType.GOOD);
      }
      this.score += gained;
      this.ui.onScoreChange(this.score, true);
      this.ui.onFloatText(
        result.x,
        result.y,
        isBonus ? `+${GOOD_SCORE} +${COMBO_BONUS}` : `+${GOOD_SCORE}`,
        isBonus ? "bonus" : "good"
      );
      if (this.combo >= COMBO_THRESHOLD) {
        this.ui.onComboChange(this.combo);
      }
      particleSystem.burstKernel(result.x, result.y, true);
    } else {
      // 坏玉米
      this.combo = 0;
      this.score = Math.max(0, this.score + BAD_SCORE);
      audioManager.play(SoundType.BAD);
      this.ui.onScoreChange(this.score, false, true);
      this.ui.onFloatText(result.x, result.y, `${BAD_SCORE}`, "bad");
      this.ui.onComboChange(0);
      particleSystem.burstKernel(result.x, result.y, false);
    }
  }

  _refreshCorn() {
    // 随游戏进度增加坏玉米比例
    const progress = 1 - this.timeLeft / GAME_DURATION;
    const badRatio =
      BAD_RATIO_INITIAL + (BAD_RATIO_MAX - BAD_RATIO_INITIAL) * progress;
    this.corn.refresh(badRatio);
    // 刷新爆裂粒子（在玉米粒所在圆周上爆开）
    particleSystem.burstRefresh(
      this.corn.cx,
      this.corn.cy,
      this.corn.kernelRingRadius
    );
  }

  _end() {
    this.state = GameState.ENDED;
    audioManager.play(SoundType.END);
    this.ui.onGameEnd({
      score: this.score,
      maxCombo: this.maxCombo,
      goodCount: this.goodCount,
    });
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** 主循环 */
  _loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (this.state === GameState.PLAYING) {
      this._updatePlaying(dt);
    } else {
      // 待机/结束时背景仍然动
      background.update(dt);
      if (this.pigeon) {
        this.pigeon.update(dt, 1);
      }
      particleSystem.update(dt);
    }

    this._render();
    this.rafId = requestAnimationFrame(this._boundLoop);
  }

  _updatePlaying(dt) {
    // 倒计时
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.ui.onTimeChange(0);
      this._end();
      // 仍然更新一帧背景和鸽子
      background.update(dt);
      particleSystem.update(dt);
      return;
    }
    this.ui.onTimeChange(Math.ceil(this.timeLeft));

    // 难度递增
    const progress = 1 - this.timeLeft / GAME_DURATION;
    this.corn.setSpeedByProgress(progress);
    const orbitSpeedMul = 1 + progress * 0.6;

    background.update(dt);
    this.corn.update(dt);
    this.pigeon.update(dt, orbitSpeedMul);

    // 实时更新预览目标线：让玩家能看到下一次啄击要打到哪里
    if (this.pigeon.state === PigeonState.ORBIT) {
      const preview = this.corn.getPeckPreview(this.pigeon.angle);
      this.pigeon.previewTarget = { x: preview.x, y: preview.y };
    }

    // Combo 火焰：combo >= 3 时在鸽子尾部发射
    if (this.combo >= COMBO_THRESHOLD && this.state === GameState.PLAYING) {
      const intensity = Math.min(1, (this.combo - 2) / 6);
      const tail = this.pigeon.getTailPosition();
      if (Math.random() < 0.6 + intensity * 0.4) {
        particleSystem.emitFlame(tail.x, tail.y, intensity);
      }
    }

    particleSystem.update(dt);
  }

  _render() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // 背景
    background.draw(ctx);

    if (this.corn && this.pigeon) {
      // 先画玉米棒（在鸽子下层）
      this.corn.draw(ctx);

      // 粒子（玉米飞溅等，在玉米之上、鸽子之下）
      particleSystem.draw(ctx);

      // 鸽子
      this.pigeon.draw(ctx);
    }
  }

  destroy() {
    this.stop();
    window.removeEventListener("resize", this._boundResize);
  }
}

export { Game, GameState };
