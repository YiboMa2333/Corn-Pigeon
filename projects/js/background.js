/**
 * 背景模块
 * 程序化绘制蓝天白云 + 绿色草地，带分层视差滚动
 * 全部用 Canvas 2D 绘制，零外部图片资源
 */

class Cloud {
  /**
   * @param {number} w - 画布宽
   * @param {number} layer - 0 远云（小、慢），1 近云（大、快）
   */
  constructor(w, layer) {
    this.layer = layer;
    this.reset(w, true);
  }

  reset(w, initial = false) {
    this.x = initial ? Math.random() * w : -180;
    this.y = 40 + Math.random() * (this.layer === 0 ? 140 : 100);
    this.scale = (this.layer === 0 ? 0.55 : 0.9) + Math.random() * 0.4;
    this.speed = (this.layer === 0 ? 8 : 18) + Math.random() * 10; // px/s
    this.puffs = 3 + Math.floor(Math.random() * 3);
  }

  update(dt, w) {
    this.x += this.speed * dt;
    if (this.x > w + 200) {
      this.reset(w, false);
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    // 多个圆叠加为一朵蓬松云
    const baseR = 26;
    for (let i = 0; i < this.puffs; i++) {
      const px = i * baseR * 1.3 - ((this.puffs - 1) * baseR * 1.3) / 2;
      const py = Math.sin(i * 1.2) * 6;
      const r = baseR * (0.8 + (i % 2) * 0.35);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 云底扁平连接
    ctx.beginPath();
    ctx.ellipse(
      0,
      baseR * 0.5,
      baseR * this.puffs * 0.7,
      baseR * 0.45,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }
}

class Background {
  constructor() {
    this.w = 0;
    this.h = 0;
    /** @type {Cloud[]} */
    this.cloudsFar = [];
    /** @type {Cloud[]} */
    this.cloudsNear = [];
    this.grassOffset = 0;
    this.time = 0;
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    // 根据宽度生成云数量
    const farCount = Math.max(3, Math.floor(w / 280));
    const nearCount = Math.max(2, Math.floor(w / 420));
    this.cloudsFar = Array.from({ length: farCount }, () => new Cloud(w, 0));
    this.cloudsNear = Array.from({ length: nearCount }, () => new Cloud(w, 1));
    // 初始时把云随机铺在画面中
    for (const c of this.cloudsFar) {
      c.x = Math.random() * w;
    }
    for (const c of this.cloudsNear) {
      c.x = Math.random() * w;
    }
  }

  update(dt) {
    this.time += dt;
    this.grassOffset = (this.grassOffset + dt * 30) % 80;
    for (const c of this.cloudsFar) c.update(dt, this.w);
    for (const c of this.cloudsNear) c.update(dt, this.w);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const { w, h } = this;
    // 1. 天空渐变
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#4FC3F7");
    sky.addColorStop(0.65, "#B3E5FC");
    sky.addColorStop(0.85, "#C8E6C9");
    sky.addColorStop(1, "#AED581");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // 2. 太阳（右上角柔和光晕）
    this._drawSun(ctx);

    // 3. 远山（极慢视差）
    this._drawHills(ctx);

    // 4. 远云
    for (const c of this.cloudsFar) c.draw(ctx);

    // 5. 近云
    for (const c of this.cloudsNear) c.draw(ctx);

    // 6. 草地
    this._drawGrass(ctx);
  }

  _drawSun(ctx) {
    const sx = this.w * 0.82;
    const sy = this.h * 0.16;
    const r = Math.min(this.w, this.h) * 0.08;
    // 光晕
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
    glow.addColorStop(0, "rgba(255,235,59,0.5)");
    glow.addColorStop(0.4, "rgba(255,235,59,0.15)");
    glow.addColorStop(1, "rgba(255,235,59,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
    ctx.fill();
    // 太阳本体
    ctx.fillStyle = "#FFEB3B";
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    // 高光
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(sx - r * 0.3, sy - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawHills(ctx) {
    const baseY = this.h * 0.62;
    ctx.fillStyle = "#9CCC65";
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    // 用正弦波绘制起伏山丘
    for (let x = 0; x <= this.w; x += 20) {
      const y =
        baseY +
        Math.sin(x * 0.008 + this.time * 0.05) * 18 +
        Math.sin(x * 0.02) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(this.w, this.h);
    ctx.lineTo(0, this.h);
    ctx.closePath();
    ctx.fill();
  }

  _drawGrass(ctx) {
    const grassTop = this.h * 0.72;
    // 草地主体渐变
    const g = ctx.createLinearGradient(0, grassTop, 0, this.h);
    g.addColorStop(0, "#8BC34A");
    g.addColorStop(1, "#689F38");
    ctx.fillStyle = g;
    ctx.fillRect(0, grassTop, this.w, this.h - grassTop);

    // 草叶纹理（循环平移）
    ctx.strokeStyle = "rgba(104,159,56,0.5)";
    ctx.lineWidth = 2;
    const bladeW = 80;
    for (let x = -bladeW; x < this.w + bladeW; x += bladeW) {
      const ox = x - this.grassOffset;
      ctx.beginPath();
      ctx.moveTo(ox, grassTop);
      ctx.quadraticCurveTo(ox + 12, grassTop - 14, ox + 6, grassTop - 22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox + 30, grassTop + 20);
      ctx.quadraticCurveTo(ox + 42, grassTop + 6, ox + 36, grassTop - 2);
      ctx.stroke();
    }

    // 零散小花
    ctx.fillStyle = "#FFF9C4";
    for (let i = 0; i < 8; i++) {
      const fx = ((i * 137 + this.time * 5) % this.w);
      const fy = grassTop + 20 + (i % 3) * 25;
      ctx.beginPath();
      ctx.arc(fx, fy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export const background = new Background();
