/**
 * 入口文件
 * 负责：DOM 引用、loading 流程、开始页大鸽子预览绘制、
 *       游戏实例化、输入绑定（鼠标/触摸）、UI 更新回调、分享功能
 */

import { Game } from "./game.js";
import { audioManager } from "./audio.js";
import { particleSystem } from "./particles.js";

/* ============================================================
   1. DOM 引用
   ============================================================ */
const canvas = document.getElementById("game-canvas");
const loadingScreen = document.getElementById("loading-screen");
const loadingFill = document.getElementById("loading-fill");
const startScreen = document.getElementById("start-screen");
const endScreen = document.getElementById("end-screen");
const hud = document.getElementById("hud");
const scoreText = document.getElementById("score-text");
const timeText = document.getElementById("time-text");
const hudTime = document.getElementById("hud-time");
const comboDisplay = document.getElementById("combo-display");
const comboCount = document.getElementById("combo-count");
const floatLayer = document.getElementById("float-layer");
const directionFlash = document.getElementById("direction-flash");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");
const shareBtn = document.getElementById("share-btn");
const finalScore = document.getElementById("final-score");
const maxComboEl = document.getElementById("max-combo");
const goodCountEl = document.getElementById("good-count");
const toast = document.getElementById("toast");
const pigeonPreview = document.getElementById("pigeon-preview");

/* ============================================================
   2. 在开始页用 DOM 拼装一只大胖鸽子（CSS 已定义基础结构）
   ============================================================ */
function buildPigeonPreview() {
  pigeonPreview.innerHTML = `
    <div class="preview-wing left"></div>
    <div class="preview-wing right"></div>
    <div class="preview-body"></div>
    <div class="preview-head">
      <div class="preview-blush left"></div>
      <div class="preview-blush right"></div>
      <div class="preview-eye left"></div>
      <div class="preview-eye right"></div>
      <div class="preview-beak"></div>
    </div>
  `;
}
buildPigeonPreview();

/* ============================================================
   3. UI 回调实现
   ============================================================ */
const ui = {
  onScoreChange(score, _up = false, isBad = false) {
    scoreText.textContent = String(score);
    scoreText.classList.remove("bump");
    // 强制重排以重启动画
    void scoreText.offsetWidth;
    scoreText.classList.add("bump");
    scoreText.style.color = isBad ? "#FF5252" : "";
    setTimeout(() => {
      scoreText.style.color = "";
    }, 300);
  },

  onTimeChange(seconds) {
    timeText.textContent = String(seconds);
    if (seconds <= 10) {
      hudTime.classList.add("urgent");
    } else {
      hudTime.classList.remove("urgent");
    }
  },

  onComboChange(combo) {
    if (combo >= 3) {
      comboDisplay.classList.remove("hidden");
      comboCount.textContent = String(combo);
      // 每次 combo 变化都弹一下
      comboDisplay.style.animation = "none";
      void comboDisplay.offsetWidth;
      comboDisplay.style.animation = "";
    } else {
      comboDisplay.classList.add("hidden");
    }
  },

  onFloatText(x, y, text, type) {
    const el = document.createElement("div");
    el.className = `float-text ${type}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    floatLayer.appendChild(el);
    // 动画结束后移除
    el.addEventListener("animationend", () => el.remove(), { once: true });
  },

  onDirectionFlash() {
    directionFlash.classList.remove("flash");
    void directionFlash.offsetWidth;
    directionFlash.classList.add("flash");
  },

  onGameEnd({ score, maxCombo, goodCount }) {
    finalScore.textContent = String(score);
    maxComboEl.textContent = String(maxCombo);
    goodCountEl.textContent = String(goodCount);
    hud.classList.add("hidden");
    // 延迟一点显示结束页，让最后一帧粒子/啄击动画播完
    setTimeout(() => {
      endScreen.classList.remove("hidden");
    }, 500);
  },
};

/* ============================================================
   4. 游戏实例化
   ============================================================ */
const game = new Game(canvas, ui);

/* ============================================================
   5. Loading 流程：模拟资源加载进度
   ============================================================ */
function runLoading() {
  let progress = 0;
  const timer = setInterval(() => {
    progress += 8 + Math.random() * 18;
    if (progress >= 100) {
      progress = 100;
      loadingFill.style.width = "100%";
      clearInterval(timer);
      // 等一帧让用户看到 100%，再切换
      setTimeout(() => {
        // 初始化游戏（此时 Canvas 已正确布局）
        game.init();
        // 启动渲染循环（但游戏处于 READY 状态，只渲染背景/玉米/鸽子待机动画）
        game.lastTime = performance.now();
        game.rafId = requestAnimationFrame(game._boundLoop);
        // 切到开始页
        loadingScreen.classList.add("hidden");
        startScreen.classList.remove("hidden");
      }, 250);
    } else {
      loadingFill.style.width = `${progress}%`;
    }
  }, 120);
}

/* ============================================================
   6. 开始/重玩 按钮
   ============================================================ */
function startGame() {
  // 用户首次交互，初始化音频
  audioManager.init();
  audioManager.resume();
  startScreen.classList.add("hidden");
  endScreen.classList.add("hidden");
  hud.classList.remove("hidden");
  ui.onComboChange(0);
  game.start();
}

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

/* ============================================================
   7. 输入：点击/触摸 Canvas 触发啄击
   ============================================================ */
function onPeck(e) {
  // 在非游戏中状态不触发
  e.preventDefault();
  game.handlePeck();
}

canvas.addEventListener("mousedown", onPeck);
canvas.addEventListener("touchstart", onPeck, { passive: false });

// 空格键也可啄击（PC 友好）
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    if (game.state === "playing") {
      e.preventDefault();
      game.handlePeck();
    } else if (game.state === "ready" || game.state === "ended") {
      // 在开始/结束页按空格也可以开始
      if (!startScreen.classList.contains("hidden")) {
        startBtn.click();
      } else if (!endScreen.classList.contains("hidden")) {
        restartBtn.click();
      }
    }
  }
});

/* ============================================================
   8. 分享功能（Web Share API + 剪贴板降级）
   ============================================================ */
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2200);
}

shareBtn.addEventListener("click", async () => {
  const shareUrl = window.location.href;
  const shareText = `我在「疯狂的鸽子」里得了 ${finalScore.textContent} 分，你能啄过我吗？`;
  if (navigator.share) {
    try {
      await navigator.share({
        title: "疯狂的鸽子",
        text: shareText,
        url: shareUrl,
      });
    } catch (e) {
      // 用户取消分享，静默处理
    }
  } else {
    // 降级：复制链接到剪贴板
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      showToast("已复制分享链接，快去炫耀吧！");
    } catch {
      showToast("链接：" + shareUrl);
    }
  }
});

/* ============================================================
   9. 页面可见性：切走时暂停计时（避免时间作弊）
   ============================================================ */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // 暂停：通过重置 lastTime 让恢复时 dt 不会巨大
    game.lastTime = performance.now();
  } else {
    game.lastTime = performance.now();
  }
});

/* ============================================================
   10. 启动
   ============================================================ */
runLoading();
