/**
 * 粒子系统
 * 负责：啄击玉米粒飞溅、Combo 火焰拖尾、玉米刷新爆裂等粒子效果
 * 所有粒子都是带物理（重力+旋转+淡出）的程序化绘制
 */

// 粒子类型
const ParticleKind = {
  KERNEL: "kernel", // 玉米粒形粒子（椭圆）
  FLAME: "flame", // 火焰粒子（圆形 + 发光）
  SPARK: "spark", // 小星芒粒子
};

class Particle {
  constructor(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.vx = opts.vx;
    this.vy = opts.vy;
    this.gravity = opts.gravity ?? 600; // px/s²
    this.life = opts.life; // 总寿命（秒）
    this.age = 0;
    this.size = opts.size;
    this.rotation = opts.rotation ?? Math.random() * Math.PI * 2;
    this.rotationSpeed = opts.rotationSpeed ?? (Math.random() - 0.5) * 12;
    this.color = opts.color; // 主色
    this.colorEnd = opts.colorEnd ?? opts.color; // 渐变结束色
    this.kind = opts.kind;
    this.alive = true;
  }

  update(dt) {
    this.age += dt;
    if (this.age >= this.life) {
      this.alive = false;
      return;
    }
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation += this.rotationSpeed * dt;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    const t = this.age / this.life; // 0~1
    const alpha = 1 - t;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    if (this.kind === ParticleKind.KERNEL) {
      this._drawKernel(ctx, t);
    } else if (this.kind === ParticleKind.FLAME) {
      this._drawFlame(ctx, t);
    } else if (this.kind === ParticleKind.SPARK) {
      this._drawSpark(ctx, t);
    }

    ctx.restore();
  }

  _drawKernel(ctx, t) {
    const s = this.size * (1 - t * 0.2);
    // 玉米粒呈椭圆水滴形
    ctx.scale(s, s * 0.75);
    const grad = ctx.createLinearGradient(-1, -1, 1, 1);
    grad.addColorStop(0, this.colorEnd);
    grad.addColorStop(1, this.color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 1, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // 描边
    ctx.strokeStyle = "rgba(78,52,46,0.5)";
    ctx.lineWidth = 0.25;
    ctx.stroke();
    // 高光
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(-0.3, -0.4, 0.25, 0.4, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawFlame(ctx, t) {
    const s = this.size * (1 - t * 0.5);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
    grad.addColorStop(0, this.colorEnd);
    grad.addColorStop(0.5, this.color);
    grad.addColorStop(1, "rgba(255,87,34,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawSpark(ctx, t) {
    const s = this.size * (1 - t * 0.4);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    // 四角星芒
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const r = i % 2 === 0 ? s : s * 0.4;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}

class ParticleSystem {
  constructor() {
    /** @type {Particle[]} */
    this.particles = [];
  }

  clear() {
    this.particles.length = 0;
  }

  /**
   * 啄击玉米粒飞溅
   * @param {number} x - 啄击中心 x
   * @param {number} y - 啄击中心 y
   * @param {boolean} good - 是否好玉米
   * @param {number} [count] - 粒子数量
   */
  burstKernel(x, y, good, count = 14) {
    const baseAngle = -Math.PI / 2; // 整体向上偏
    const spread = Math.PI * 1.4;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.random() - 0.5) * spread;
      const speed = 180 + Math.random() * 280;
      this.particles.push(
        new Particle({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 700,
          life: 0.55 + Math.random() * 0.2,
          size: 5 + Math.random() * 5,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 14,
          color: good ? "#FFA000" : "#3E2723",
          colorEnd: good ? "#FFD54F" : "#5D4037",
          kind: ParticleKind.KERNEL,
        })
      );
    }
    // 额外几个小星芒
    const sparkColor = good ? "#FFF9C4" : "#8D6E63";
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 200;
      this.particles.push(
        new Particle({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 300,
          life: 0.35 + Math.random() * 0.15,
          size: 3 + Math.random() * 3,
          rotation: 0,
          rotationSpeed: 0,
          color: sparkColor,
          kind: ParticleKind.SPARK,
        })
      );
    }
  }

  /**
   * Combo 火焰拖尾（在鸽子身后生成）
   * @param {number} x
   * @param {number} y
   * @param {number} intensity - 火焰强度 0~1
   */
  emitFlame(x, y, intensity = 1) {
    const count = Math.max(1, Math.round(2 * intensity));
    for (let i = 0; i < count; i++) {
      this.particles.push(
        new Particle({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 40,
          vy: 30 + Math.random() * 50, // 向上飘（注意 canvas y 向下，所以负值才是向上）
          gravity: -120, // 轻微上浮
          life: 0.35 + Math.random() * 0.25,
          size: 10 + Math.random() * 10 * intensity,
          rotation: 0,
          rotationSpeed: 0,
          color: "#FF5722",
          colorEnd: "#FFC107",
          kind: ParticleKind.FLAME,
        })
      );
    }
  }

  /**
   * 玉米刷新时整排爆裂庆祝粒子
   */
  burstRefresh(cx, cy, radius) {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 150 + Math.random() * 200;
      this.particles.push(
        new Particle({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 500,
          life: 0.6 + Math.random() * 0.2,
          size: 4 + Math.random() * 4,
          color: i % 2 === 0 ? "#FFD54F" : "#FFF9C4",
          colorEnd: "#FFA000",
          kind: ParticleKind.KERNEL,
        })
      );
    }
  }

  update(dt) {
    for (const p of this.particles) p.update(dt);
    // 回收死亡粒子
    if (this.particles.length > 400) {
      this.particles = this.particles.filter((p) => p.alive);
    } else {
      // 小数量时原地压缩
      let write = 0;
      for (let i = 0; i < this.particles.length; i++) {
        if (this.particles[i].alive) {
          this.particles[write++] = this.particles[i];
        }
      }
      this.particles.length = write;
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }
}

export const particleSystem = new ParticleSystem();
export { ParticleKind };
