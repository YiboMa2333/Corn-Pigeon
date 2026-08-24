/**
 * 玉米（圆盘造型）模块
 * 中间一个圆形玉米芯主体，玉米粒围绕芯子外围一圈排列，
 * 整体绕圆心自转，鸽子沿外圈正圆轨道绕芯子飞行并啄食。
 *
 * 几何模型：
 * - coreRadius: 中心玉米芯的半径（玉米粒内侧贴在芯子边缘）
 * - outerRadius: 玉米整体外半径（含玉米粒）
 * - kernelRingRadius: 玉米粒中心所在的圆周半径
 * - 每颗玉米粒以水滴形径向朝外排列（内圆外尖）
 * - 啄击判定：根据鸽子当前轨道角，找角度最接近的存活玉米粒
 */

// 一圈玉米粒数量
const KERNEL_COUNT = 18;
const ROWS = 1; // 仅保留以兼容旧引用（单圈）
const COLS = KERNEL_COUNT;
const BAD_RATIO_INITIAL = 0.22; // 初始坏玉米比例
const BAD_RATIO_MAX = 0.38; // 最高坏玉米比例

class Kernel {
  /**
   * @param {number} index - 在圈上的序号 0~KERNEL_COUNT-1
   * @param {boolean} good
   */
  constructor(index, good) {
    this.index = index;
    // 兼容旧字段
    this.row = 0;
    this.col = index;
    this.good = good;
    this.alive = true;
    // 轻微随机，避免机械感
    this.jitterRadius = (Math.random() - 0.5) * 4;
    this.jitterAngle = (Math.random() - 0.5) * 0.05;
    this.scale = 0.92 + Math.random() * 0.16;
    // 坏玉米斑点种子（确定性，避免每帧抖动）
    this.spotSeed = Math.floor(Math.random() * 1000);
  }
}

class CornCob {
  /**
   * @param {number} cx - 中心 x
   * @param {number} cy - 中心 y
   * @param {number} coreRadius - 中心玉米芯半径
   */
  constructor(cx, cy, coreRadius = 60) {
    this.cx = cx;
    this.cy = cy;
    this.coreRadius = coreRadius;
    this.outerRadius = coreRadius * 1.55; // 含玉米粒的整体外半径
    this.kernelRingRadius = (this.coreRadius + this.outerRadius) / 2;
    this.rotation = 0; // 绕圆心自转（弧度）
    this.rotationSpeed = 0.6; // rad/s，初始缓慢
    this.kernels = [];
    this.badRatio = BAD_RATIO_INITIAL;
    this._generateKernels();

    // 刷新时玉米粒缩放进入动画（0~1，1 表示刚刷新）
    this.refreshAnim = 0;
  }

  /** 生成一圈玉米粒 */
  _generateKernels() {
    this.kernels = [];
    for (let i = 0; i < KERNEL_COUNT; i++) {
      const isGood = Math.random() > this.badRatio;
      this.kernels.push(new Kernel(i, isGood));
    }
  }

  /** 重新生成一整圈玉米粒（好玉米被啄完时调用） */
  refresh(badRatio) {
    if (badRatio !== undefined) this.badRatio = badRatio;
    this._generateKernels();
    this.refreshAnim = 1;
  }

  /**
   * 随游戏进度加快自转
   * @param {number} progress 0~1
   */
  setSpeedByProgress(progress) {
    // 0.6 ~ 4.0 rad/s（约 0.64 圈/秒，保证可反应）
    this.rotationSpeed = 0.6 + progress * 3.4;
  }

  update(dt) {
    // 玉米整体顺时针旋转
    this.rotation -= this.rotationSpeed * dt;
    if (this.refreshAnim > 0) {
      this.refreshAnim = Math.max(0, this.refreshAnim - dt * 3.5);
    }
  }

  /** 重设大小（响应式） */
  resize(cx, cy, coreRadius) {
    this.cx = cx;
    this.cy = cy;
    this.coreRadius = coreRadius;
    this.outerRadius = coreRadius * 1.55;
    this.kernelRingRadius = (this.coreRadius + this.outerRadius) / 2;
  }

  /**
   * 计算某颗玉米粒的世界坐标与角度
   * @param {Kernel} k
   */
  _getKernelTransform(k) {
    const baseAngle = (k.index / KERNEL_COUNT) * Math.PI * 2;
    const angle = baseAngle + this.rotation + k.jitterAngle;
    const r = this.kernelRingRadius + k.jitterRadius;
    return {
      x: this.cx + Math.cos(angle) * r,
      y: this.cy + Math.sin(angle) * r,
      angle,
    };
  }

  /**
   * 计算当前最可能的啄击目标点，不会修改玉米状态。
   * @param {number} pigeonAngle - 鸽子当前绕玉米的轨道角（弧度）
   * @returns {{kernel:Kernel|null, x:number, y:number, good:boolean}}
   */
  getPeckPreview(pigeonAngle) {
    const localAngle = pigeonAngle - this.rotation;
    let best = null;
    let bestDist = Infinity;
    let bestTransform = null;

    for (const k of this.kernels) {
      if (!k.alive) continue;
      const baseAngle = (k.index / KERNEL_COUNT) * Math.PI * 2;
      let diff = baseAngle - localAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const dist = Math.abs(diff);
      if (dist < bestDist) {
        bestDist = dist;
        best = k;
        bestTransform = this._getKernelTransform(k);
      }
    }

    const kernelAngle = (Math.PI * 2) / KERNEL_COUNT;
    if (best && bestDist < kernelAngle * 0.75) {
      return {
        kernel: best,
        x: bestTransform.x,
        y: bestTransform.y,
        good: best.good,
      };
    }

    return {
      kernel: null,
      x: this.cx + Math.cos(pigeonAngle) * this.coreRadius,
      y: this.cy + Math.sin(pigeonAngle) * this.coreRadius,
      good: false,
    };
  }

  /**
   * 尝试啄击：根据鸽子当前轨道角，命中角度最接近的存活玉米粒
   * @param {number} pigeonAngle - 鸽子当前绕玉米的轨道角（弧度）
   * @returns {{kernel:Kernel|null, x:number, y:number, good:boolean}}
   */
  peck(pigeonAngle) {
    const result = this.getPeckPreview(pigeonAngle);
    if (result.kernel) {
      result.kernel.alive = false;
    }
    return result;
  }

  aliveCount() {
    let n = 0;
    for (const k of this.kernels) if (k.alive) n++;
    return n;
  }

  aliveGoodCount() {
    let n = 0;
    for (const k of this.kernels) if (k.alive && k.good) n++;
    return n;
  }

  /**
   * 绘制整个玉米（扁平 2D：圆形芯子 + 一圈椭圆形玉米粒）
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    // 1. 画一圈玉米粒（扁平椭圆片，在芯子外围）
    const visible = [];
    for (const k of this.kernels) {
      if (!k.alive) continue;
      visible.push({ k, t: this._getKernelTransform(k) });
    }
    // 按 y 排序，产生轻微前后遮挡（下方后画）
    visible.sort((a, b) => a.t.y - b.t.y);
    for (const { k, t } of visible) {
      this._drawKernel(ctx, k, t);
    }

    // 2. 画中心圆形芯子（扁平纯色圆，盖在玉米粒内端之上）
    this._drawCore(ctx);
  }

  _drawCore(ctx) {
    const r = this.coreRadius;
    ctx.save();

    // 扁平纯色填充（无渐变、无高光阴影）
    ctx.fillStyle = "#FFD54F";
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 卡通描边
    ctx.strokeStyle = "#5D4037";
    ctx.lineWidth = 4;
    ctx.stroke();

    // 扁平装饰：一圈圈同心圆线（玉米横截面的卡通纹路）
    ctx.strokeStyle = "#F9A825";
    ctx.lineWidth = 2.5;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r * (i / 3), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 中心一个扁平小圆点
    ctx.fillStyle = "#F57F17";
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // 一圈均匀分布的扁平小点点（玉米芯颗粒感，纯平涂色块）
    ctx.fillStyle = "#FFB300";
    const dotR = r * 0.7;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + this.rotation * 0.3;
      const dr = dotR * (0.35 + ((i * 7) % 10) / 16);
      const dx = this.cx + Math.cos(a) * dr;
      const dy = this.cy + Math.sin(a) * dr;
      ctx.beginPath();
      ctx.arc(dx, dy, r * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawKernel(ctx, kernel, t) {
    // 扁平 2D：玉米粒画成沿径向的椭圆片（圆形/胶囊形），纯色平涂
    const length = (this.outerRadius - this.coreRadius) * 0.95;
    const width = length * 0.72;
    const sizeScale = kernel.scale * (1 - this.refreshAnim * 0.6);
    const rx = (length / 2) * sizeScale;
    const ry = (width / 2) * sizeScale;

    ctx.save();
    ctx.translate(t.x, t.y);
    // 让玉米粒长轴沿径向朝外（angle 指向外侧）
    ctx.rotate(t.angle);

    // 纯色填充，无渐变/高光
    ctx.fillStyle = kernel.good ? "#FFC107" : "#5D4037";
    ctx.beginPath();
    this._kernelShape(ctx, rx, ry);
    ctx.fill();

    // 统一卡通描边
    ctx.strokeStyle = kernel.good ? "#E65100" : "#3E2723";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (!kernel.good) {
      // 坏玉米：扁平黑色霉斑圆点（确定性位置）
      ctx.fillStyle = "#1B1B1B";
      const spots = 2 + (kernel.spotSeed % 3);
      for (let i = 0; i < spots; i++) {
        const sr = 1.5 + ((kernel.spotSeed + i * 17) % 4);
        const sx = -rx * 0.3 + ((kernel.spotSeed + i * 31) % 100) / 100 * rx * 0.7;
        const sy = -ry * 0.4 + ((kernel.spotSeed + i * 53) % 100) / 100 * ry * 0.8;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /** 扁平玉米粒形状：圆角椭圆（胶囊形），rx/ry 为长短半轴 */
  _kernelShape(ctx, rx, ry) {
    // 直接用 ellipse 画椭圆，扁平干净
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  }
}

export {
  CornCob,
  Kernel,
  ROWS,
  COLS,
  KERNEL_COUNT,
  BAD_RATIO_INITIAL,
  BAD_RATIO_MAX,
};
