/**
 * 鸽子模块
 * 圆滚滚灰白胖鸽子的程序化绘制与行为：
 * - 椭圆轨道环绕玉米棒飞行
 * - 始终面朝玉米（自动水平翻转）
 * - 翅膀持续扇动（12Hz，冲刺时 20Hz）
 * - 三段式冲刺啄击：冲向玉米 → 啄击挤压 → 返回轨道
 * - 方向切换时眨眼
 */

// 鸽子状态
const PigeonState = {
  ORBIT: "orbit", // 环绕飞行
  DASH_IN: "dash_in", // 冲向玉米
  PECK: "peck", // 啄击瞬间
  DASH_OUT: "dash_out", // 返回轨道
};

class Pigeon {
  /**
   * @param {Object} opts
   * @param {number} opts.cx - 环绕中心 x（玉米中心）
   * @param {number} opts.cy - 环绕中心 y
   * @param {number} opts.orbitX - 椭圆轨道水平半径
   * @param {number} opts.orbitY - 椭圆轨道垂直半径
   */
  constructor({ cx, cy, orbitX, orbitY }) {
    this.cx = cx;
    this.cy = cy;
    this.orbitX = orbitX;
    this.orbitY = orbitY;

    this.angle = -Math.PI / 2; // 从玉米正上方开始
    this.direction = 1; // 固定单向环绕：顺时针
    this.orbitSpeed = 1.1; // rad/s

    // 预览啄击路径：当前将往哪一目标点飞去
    this.previewTarget = null;

    this.state = PigeonState.ORBIT;
    this.stateTime = 0; // 当前状态已持续时间
    this.x = cx;
    this.y = cy;
    this.targetX = cx;
    this.targetY = cy;
    this.fromX = cx;
    this.fromY = cy;

    // 冲刺阶段的目标点（玉米棒表面）
    this.peckX = cx;
    this.peckY = cy;

    // 视觉
    this.bodySize = 34;
    this.wingPhase = 0; // 翅膀扇动相位
    this.wingSpeed = 12 * Math.PI * 2; // 12Hz -> rad/s
    this.bobPhase = 0; // 身体上下浮动
    this.squash = 0; // 啄击挤压 0~1
    this.blinkTimer = 2 + Math.random() * 3; // 眨眼倒计时
    this.isBlinking = false;
    this.blinkProgress = 0;
    this.flipTransition = 0; // 方向翻转动画 0~1

    // 方向切换光带回调
    this.onDirectionFlash = null;
    this.directionTimer = 0;
    this.directionInterval = 15; // 秒
  }

  resize({ cx, cy, orbitX, orbitY }) {
    this.cx = cx;
    this.cy = cy;
    this.orbitX = orbitX;
    this.orbitY = orbitY;
    this.bodySize = Math.max(28, Math.min(40, orbitX * 0.16));
  }

  /** 已移除方向切换逻辑：保持稳定单向飞行 */
  flipDirection() {
    // 保持原方向，不再在顺时针和逆时针之间切换
  }

  /**
   * 开始冲刺啄击
   * @param {number} px - 玉米上的啄击点 x
   * @param {number} py - 玉米上的啄击点 y
   */
  startPeck(px, py) {
    if (this.state !== PigeonState.ORBIT) return false;
    this.state = PigeonState.DASH_IN;
    this.stateTime = 0;
    this.fromX = this.x;
    this.fromY = this.y;
    this.peckX = px;
    this.peckY = py;
    this.targetX = px;
    this.targetY = py;
    this.previewTarget = { x: px, y: py };
    // 冲刺时翅膀加快
    this.wingSpeed = 20 * Math.PI * 2;
    return true;
  }

  clearPreviewTarget() {
    this.previewTarget = null;
  }

  isPecking() {
    return this.state !== PigeonState.ORBIT;
  }

  /**
   * @param {number} dt
   * @param {number} orbitSpeedMultiplier - 游戏难度带来的轨道速度倍率
   */
  update(dt, orbitSpeedMultiplier = 1) {
    this.directionTimer += dt;
    // 取消方向切换逻辑，保持持续单向飞行
    this.directionTimer = 0;

    // 翅膀扇动
    this.wingPhase += this.wingSpeed * dt;
    this.bobPhase += dt * 6;

    // 眨眼
    if (!this.isBlinking) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.isBlinking = true;
        this.blinkProgress = 0;
      }
    } else {
      this.blinkProgress += dt * 8;
      if (this.blinkProgress >= 1) {
        this.isBlinking = false;
        this.blinkTimer = 2 + Math.random() * 3;
      }
    }

    // 翻转过渡衰减：保留字段但不再使用
    if (this.flipTransition > 0) {
      this.flipTransition = Math.max(0, this.flipTransition - dt * 2.5);
    }

    // 状态机
    this.stateTime += dt;
    switch (this.state) {
      case PigeonState.ORBIT:
        this._updateOrbit(dt, orbitSpeedMultiplier);
        break;
      case PigeonState.DASH_IN:
        this._updateDashIn(dt);
        break;
      case PigeonState.PECK:
        this._updatePeck(dt);
        break;
      case PigeonState.DASH_OUT:
        this._updateDashOut(dt, orbitSpeedMultiplier);
        break;
    }
  }

  _updateOrbit(dt, speedMul) {
    this.angle += this.direction * this.orbitSpeed * speedMul * dt;
    const tx = this.cx + Math.cos(this.angle) * this.orbitX;
    const ty = this.cy + Math.sin(this.angle) * this.orbitY;
    this.x = tx;
    this.y = ty + Math.sin(this.bobPhase) * 3;
    // 翅膀恢复正常速度
    this.wingSpeed += (12 * Math.PI * 2 - this.wingSpeed) * Math.min(1, dt * 5);
    this.squash = 0;
  }

  _updateDashIn(dt) {
    // 0.1s ease-out 冲向玉米
    const t = Math.min(1, this.stateTime / 0.1);
    const eased = 1 - Math.pow(1 - t, 3);
    this.x = this.fromX + (this.targetX - this.fromX) * eased;
    this.y = this.fromY + (this.targetY - this.fromY) * eased;
    if (t >= 1) {
      this.state = PigeonState.PECK;
      this.stateTime = 0;
    }
  }

  _updatePeck(dt) {
    // 0.05s 啄击挤压
    const t = Math.min(1, this.stateTime / 0.05);
    // 挤压在中间最大
    this.squash = Math.sin(t * Math.PI);
    // 身体稍微向前（玉米方向）探
    if (t >= 1) {
      this.state = PigeonState.DASH_OUT;
      this.stateTime = 0;
      // 计算返回目标点（基于当前角度）
      this.fromX = this.peckX;
      this.fromY = this.peckY;
      this.targetX =
        this.cx + Math.cos(this.angle) * this.orbitX;
      this.targetY =
        this.cy + Math.sin(this.angle) * this.orbitY;
    }
  }

  _updateDashOut(dt, speedMul) {
    // 0.15s ease-in-out 返回
    const t = Math.min(1, this.stateTime / 0.15);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    this.x = this.fromX + (this.targetX - this.fromX) * eased;
    this.y = this.fromY + (this.targetY - this.fromY) * eased;
    if (t >= 1) {
      this.state = PigeonState.ORBIT;
      this.stateTime = 0;
      this.clearPreviewTarget();
    }
  }

  /**
   * 获取鸽子"尾部"位置（用于火焰拖尾发射点）
   * 尾巴在鸽子背离玉米的一侧
   */
  getTailPosition() {
    const dx = this.x - this.cx;
    const dy = this.y - this.cy;
    const len = Math.hypot(dx, dy) || 1;
    // 尾部在鸽子中心向外（远离玉米）方向偏移半个身位
    const offset = this.bodySize * 0.9;
    return {
      x: this.x + (dx / len) * offset,
      y: this.y + (dy / len) * offset,
    };
  }

  /**
   * 绘制鸽子
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (this.previewTarget) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 60, 60, 0.95)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.previewTarget.x, this.previewTarget.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);

    // 鸽子始终面朝玉米中心：玉米在鸽子哪一侧，就翻转到哪一侧
    const facingRight = this.cx > this.x;
    // 不再执行方向切换旋转动画，保持稳定姿态
    const flipAngle = 0;
    if (!facingRight) ctx.scale(-1, 1);
    ctx.rotate(flipAngle);

    // 挤压变形
    const sx = 1 + this.squash * 0.15;
    const sy = 1 - this.squash * 0.15;
    ctx.scale(sx, sy);

    this._drawTail(ctx);
    this._drawWing(ctx, true); // 后翼
    this._drawBody(ctx);
    this._drawHead(ctx);
    this._drawWing(ctx, false); // 前翼
    this._drawFeet(ctx);

    ctx.restore();
  }

  _drawBody(ctx) {
    const s = this.bodySize;
    // 身体：圆滚滚椭圆
    const grad = ctx.createRadialGradient(
      -s * 0.25,
      -s * 0.3,
      s * 0.2,
      0,
      0,
      s * 1.2
    );
    grad.addColorStop(0, "#FFFFFF");
    grad.addColorStop(0.4, "#ECEFF1");
    grad.addColorStop(1, "#B0BEC5");
    ctx.fillStyle = grad;
    ctx.strokeStyle = "#4E342E";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.05, s * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 肚皮浅色
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(s * 0.05, s * 0.25, s * 0.55, s * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawHead(ctx) {
    const s = this.bodySize;
    // 头部在身体前方（面朝玉米方向 = 右侧，因为已翻转）
    const hx = s * 0.65;
    const hy = -s * 0.35;
    const headR = s * 0.62;

    // 脖子连接（同色）
    ctx.fillStyle = "#CFD8DC";
    ctx.beginPath();
    ctx.ellipse(hx - s * 0.15, hy + s * 0.2, s * 0.3, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // 头部
    const grad = ctx.createRadialGradient(
      hx - s * 0.15,
      hy - s * 0.2,
      s * 0.1,
      hx,
      hy,
      headR
    );
    grad.addColorStop(0, "#FFFFFF");
    grad.addColorStop(0.5, "#ECEFF1");
    grad.addColorStop(1, "#CFD8DC");
    ctx.fillStyle = grad;
    ctx.strokeStyle = "#4E342E";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 腮红
    ctx.fillStyle = "rgba(255,138,128,0.7)";
    ctx.beginPath();
    ctx.ellipse(hx + s * 0.15, hy + s * 0.18, s * 0.13, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    const eyeX = hx + s * 0.18;
    const eyeY = hy - s * 0.12;
    const blinkH = this.isBlinking
      ? Math.sin(this.blinkProgress * Math.PI) * 1
      : 1; // 0~1 开合

    if (blinkH > 0.1) {
      ctx.fillStyle = "#1B1B1B";
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, s * 0.1, s * 0.12 * blinkH, 0, 0, Math.PI * 2);
      ctx.fill();
      // 高光
      if (blinkH > 0.5) {
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(eyeX + s * 0.03, eyeY - s * 0.04, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // 闭眼：弧线
      ctx.strokeStyle = "#4E342E";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, s * 0.09, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }

    // 嘴巴（橘色小嘴，朝前）
    ctx.fillStyle = "#FF9800";
    ctx.strokeStyle = "#4E342E";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(hx + headR * 0.75, hy - s * 0.02);
    ctx.lineTo(hx + headR * 1.45, hy + s * 0.04);
    ctx.lineTo(hx + headR * 0.75, hy + s * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 嘴的分割线
    ctx.beginPath();
    ctx.moveTo(hx + headR * 0.8, hy + s * 0.08);
    ctx.lineTo(hx + headR * 1.35, hy + s * 0.08);
    ctx.stroke();
  }

  _drawWing(ctx, isBack) {
    const s = this.bodySize;
    // 翅膀扇动：上下摆动
    const flap = Math.sin(this.wingPhase) * 0.6;
    const wingY = isBack ? -s * 0.05 : s * 0.1;
    const wingX = isBack ? -s * 0.1 : s * 0.15;
    const baseAngle = isBack ? -0.3 : 0.2;

    ctx.save();
    ctx.translate(wingX, wingY);
    ctx.rotate(baseAngle + flap);

    const grad = ctx.createLinearGradient(0, -s * 0.3, 0, s * 0.5);
    grad.addColorStop(0, "#CFD8DC");
    grad.addColorStop(1, "#90A4AE");
    ctx.fillStyle = grad;
    ctx.strokeStyle = "#4E342E";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.15, s * 0.45, s * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 翅膀羽毛纹路
    ctx.strokeStyle = "rgba(78,52,46,0.3)";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, s * 0.1 + i * s * 0.15);
      ctx.quadraticCurveTo(
        s * 0.1,
        s * 0.3 + i * s * 0.15,
        s * 0.3,
        s * 0.5 + i * s * 0.15
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawTail(ctx) {
    const s = this.bodySize;
    // 尾巴在身体后方（左侧，因已翻转面朝右）
    ctx.save();
    ctx.translate(-s * 0.95, -s * 0.1);
    ctx.rotate(-0.2 + Math.sin(this.wingPhase * 0.5) * 0.1);
    const grad = ctx.createLinearGradient(0, 0, -s * 0.6, 0);
    grad.addColorStop(0, "#CFD8DC");
    grad.addColorStop(1, "#90A4AE");
    ctx.fillStyle = grad;
    ctx.strokeStyle = "#4E342E";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.25);
    ctx.lineTo(-s * 0.55, -s * 0.15);
    ctx.lineTo(-s * 0.65, 0);
    ctx.lineTo(-s * 0.55, s * 0.15);
    ctx.lineTo(0, s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawFeet(ctx) {
    const s = this.bodySize;
    // 红色小爪子
    ctx.fillStyle = "#E53935";
    ctx.strokeStyle = "#4E342E";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i += 2) {
      const fx = i * s * 0.2;
      const fy = s * 0.75;
      ctx.beginPath();
      ctx.ellipse(fx, fy, s * 0.1, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 三趾
      for (let t = -1; t <= 1; t++) {
        ctx.beginPath();
        ctx.moveTo(fx + t * s * 0.05, fy + s * 0.03);
        ctx.lineTo(fx + t * s * 0.12, fy + s * 0.14);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  }
}

export { Pigeon, PigeonState };
