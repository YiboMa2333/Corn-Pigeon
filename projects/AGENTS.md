# AGENTS.md — 疯狂的鸽子

## 项目概览

一款抖音小游戏风格的纯前端休闲小游戏。画面中央是一个圆形玉米芯，金黄玉米粒围绕芯子排成一圈并持续自转；玩家点击屏幕，操控一只圆滚滚的胖鸽子沿玉米外圈的正圆轨道绕芯子飞行并啄食玉米粒：好玉米 +10 分，坏玉米 -15 分，连续啄中好玉米触发 Combo 额外加分，60 秒倒计时挑战最高分。

- **项目类型**：原生静态 Web（HTML + CSS + ES Modules），无构建步骤、无后端、无外部图片/音频资源
- **渲染方案**：Canvas 2D 绘制游戏主体（背景/玉米/鸽子/粒子），DOM + CSS 覆盖 UI 层
- **运行方式**：静态文件服务器（python http.server）

## 目录结构

```
.
├── index.html              # 页面骨架：loading/开始/游戏/结束四态 + HUD
├── styles/
│   └── main.css            # 全部样式：卡通字体、按钮弹跳、飘字、响应式
├── js/
│   ├── main.js             # 入口：DOM 绑定、loading 流程、输入、分享、UI 回调
│   ├── game.js             # 游戏主类：状态机、主循环、计分/计时/Combo/难度
│   ├── pigeon.js           # 鸽子：环绕轨道、三段冲刺、扇翅、眨眼、方向翻转
│   ├── corn.js             # 玉米棒：伪 3D 圆柱、玉米粒分布、自转、啄击判定
│   ├── particles.js        # 粒子系统：玉米粒飞溅、Combo 火焰、星芒
│   ├── background.js       # 背景：天空渐变、太阳、远山、分层视差云、草地
│   └── audio.js            # Web Audio API：程序化生成全部音效（单例）
├── DESIGN.md               # 设计规范（配色/字体/动效/禁忌）
└── .coze                   # 沙箱构建/运行配置（python http.server，端口 ${DEPLOY_RUN_PORT}）
```

## 构建与运行

- **开发/生产统一命令**：`python -m http.server ${DEPLOY_RUN_PORT} --bind 0.0.0.0`
- 无 `build` 步骤，无包管理器依赖
- 主仓预览常驻 5000 端口，修改文件后刷新浏览器即可

## 代码风格指南

- **语言**：原生 ES2020+ JavaScript，使用 ES Modules（`import`/`export`）
- **命名**：类名 `PascalCase`，变量/函数 `camelCase`，常量 `UPPER_SNAKE_CASE`
- **模块模式**：游戏实体（Pigeon/CornCob/Background/ParticleSystem）使用类；跨模块单例（particleSystem/background/audioManager）直接 `export const`
- **类型注解**：关键函数参数用 JSDoc 标注类型，IDE 可获得提示
- **Canvas 规范**：
  - 所有绘制使用 `ctx.save()`/`ctx.restore()` 配对，避免状态泄漏
  - 坐标基于 CSS 像素（DPR 已在 game.js `_resize` 中通过 `setTransform` 处理）
  - 颜色统一使用 DESIGN.md 中定义的色值，不要硬编码新颜色
- **UI 规范**：Canvas 只画游戏画面，所有文字/按钮/HUD 一律走 DOM（保证清晰度与可访问性）

## 核心游戏参数（js/game.js 顶部）

| 常量 | 值 | 含义 |
|------|----|------|
| `GAME_DURATION` | 60 | 游戏时长（秒） |
| `DIRECTION_INTERVAL` | 15 | 鸽子方向切换间隔（秒） |
| `GOOD_SCORE` | 10 | 好玉米得分 |
| `BAD_SCORE` | -15 | 坏玉米得分（扣分） |
| `COMBO_BONUS` | 5 | Combo≥3 时额外加分 |
| `COMBO_THRESHOLD` | 3 | 触发 Combo 的连击数 |

玉米参数（js/corn.js）：圆盘造型，中心一个圆形玉米芯（`coreRadius`），`KERNEL_COUNT=18` 颗玉米粒沿 `kernelRingRadius` 圆周径向排列一圈（外半径 `outerRadius = coreRadius * 1.55`）；坏玉米比例从 22% 随游戏进度递增到 38%。

## 游戏状态机

`game.state` 取值（GameState）：

1. `LOADING`：显示 loading 动画与进度条
2. `READY`：开始页，Canvas 已在后台渲染待机画面（背景+玉米+鸽子绕圈）
3. `PLAYING`：倒计时进行，接受啄击输入
4. `ENDED`：时间到，显示结束页

鸽子自身也有子状态机（PigeonState）：`ORBIT` → `DASH_IN`(0.1s) → `PECK`(0.05s) → `DASH_OUT`(0.15s)，总冲刺耗时约 0.3s。

## 玉米几何模型（关键，易踩坑）

玉米采用"圆盘 + 一圈玉米粒"造型，鸽子沿玉米外圈的**正圆轨道**绕芯子飞行：

- 芯子半径 `coreRadius`（约短边 17%），外半径 `outerRadius = coreRadius * 1.55`
- 玉米粒中心圆周 `kernelRingRadius = (coreRadius + outerRadius) / 2`
- 每颗玉米粒角度 `angle = (index/KERNEL_COUNT)*2π + rotation`，位置 = `cx + cos(angle)*ringRadius, cy + sin(angle)*ringRadius`
- 玉米粒以水滴形**径向朝外**绘制（绘制时 `rotate(angle)`，+x 指向外）
- 鸽子轨道半径 `orbitRadius = outerRadius + 身位间隙`，`orbitX = orbitY`（正圆）
- 啄击判定：`corn.peck(pigeon.angle)` 传入鸽子轨道角，换算成本地角 `pigeonAngle - rotation` 后找角度最接近的存活玉米粒，容差约 0.75 个玉米粒角宽
- 鸽子始终面朝圆心（`facingRight = cx > x`），因此无论绕到哪一侧都朝向玉米

修改自转/玉米粒数量时注意：`rotationSpeed` 上限约 4 rad/s（< 1 圈/秒），保证玩家能反应；`KERNEL_COUNT` 变化需同步调整玉米粒宽高比例。

## 测试与验证

- **JS 语法检查**：`for f in js/*.js; do node --check "$f"; done`
- **资源可访问性**：`curl -I http://localhost:${DEPLOY_RUN_PORT}/`、`/styles/main.css`、`/js/*.js` 应全部返回 200
- **手工冒烟路径**：
  1. loading 进度条走完 → 出现开始页（标题弹跳 + 大鸽子扇翅）
  2. 点"开始游戏" → HUD 出现、60s 倒计时、玉米自转、鸽子绕圈
  3. 点击/触摸/空格 → 鸽子冲刺啄击 + 粒子 + 飘字 + 音效
  4. 连续 3 个好玉米 → Combo 徽章弹出 + 鸽子尾部火焰
  5. 啄坏玉米 → 飘红 -15、Combo 清零
  6. 每 15s → 屏幕弧光闪过、鸽子翻转
  7. 倒计时到 0 → 结束页显示分数/最高连击/好玉米数，按钮可重玩
  8. 竖屏手机与 PC 宽屏均居中适配

## 常见问题排查

- **点击没反应**：检查 audioManager.init() 是否在用户首次点击后调用（浏览器自动播放策略）；game.state 是否为 PLAYING
- **Canvas 模糊**：确认 `_resize()` 中按 DPR 设置 canvas.width/height 并调用 `setTransform(dpr,0,0,dpr,0,0)`
- **移动端双击缩放**：HTML viewport 已设 `user-scalable=no`，CSS `touch-action: manipulation`
- **玉米刷新卡住**：刷新条件是"好玉米清零或全空"（不是全部被啄完，避免坏玉米残留卡场）
- **方向切换无音效/光带**：pigeon.onDirectionFlash 回调在 game.init 中绑定，触发 audioManager.play(DIRECTION) 与 ui.onDirectionFlash()
