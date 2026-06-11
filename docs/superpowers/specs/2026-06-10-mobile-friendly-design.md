# 移动端适配设计（B′ 架构 + C 交互模型）

日期：2026-06-10
范围：游戏对局内为主（`Game.vue` / `Scenario.vue` / `Player.vue` 等），游戏外页面只修明显问题。
目标：手机竖屏与平板横屏优先级相近，全面适配（非最小可玩）。
导航模型：全屏地图 + 浮层（用户已确认）。

## 背景与现状

已有的移动端适配零散分布：

- `frontend/src/arkham/isMobile.ts` — 以 `宽度 ≤ 800px` 判断，被 8 个组件使用
- `CardOverlay.vue:162` — 用 `(hover: none) and (pointer: coarse)` 判断，与上者矛盾
- 侧边栏（GameLog）在 ≤800px 下已是右侧抽屉 + 遮罩（`Game.vue`）
- 手牌在移动端已是底部浮层（`Player.vue` 的 `hand-area-IsMobile` 分支）
- 地图缩放控件在触控设备被隐藏（`pointer: coarse` → `display: none`），无 pinch 替代
- `CardOverlay.vue` 已有触屏长按 200ms 预览，但 pointer 监听全部 `{ passive: true }`，
  **没有 click 拦截**：长按预览松手后动作仍会触发；快速点按直接执行、无预览机会
- safe-area insets 全仓库零使用；`100dvh` 仅 3 处

核心交互痛点（用户指出）：点击分两类——弹交互按钮的（资产能力 → AbilitiesMenu，天然两步）
和直接执行的（手牌打出、选目标卡、点地点移动，单步直达）。后者在触屏上完全无法预览。

## 1. 设备模型 — `useDeviceLayout`

新 composable（`frontend/src/arkham/composables/useDeviceLayout.ts`），两条正交的轴，
替换现有两套矛盾检测：

```ts
{
  isTouch,    // (hover: none) and (pointer: coarse)，响应式
  size,       // 'phone' | 'tablet' | 'desktop'（按视口短边 + 宽度）
  shell,      // 'phone' → 手机 shell；其余 → 桌面布局
}
```

决策矩阵：

| | 触控输入 | 鼠标输入 |
|---|---|---|
| 小屏（手机） | 手机 shell | — |
| 大屏（平板/桌面） | 桌面布局 + 触控交互层 | 现有桌面布局 |

平板**不进**手机 shell：iPad 横屏宽 1024–1366px，空间足够桌面布局，缺的是触控交互支持。
全仓库 `IsMobile()` 调用点逐步迁移到该 composable。

## 2. 触控交互层（手机 + 平板共享，`isTouch` 时启用）

### 2a. 卡牌预览与执行（C 模型）

核心规则：**图像两步，文字按钮一步。**

- 触屏下，可交互的卡牌/地点图像的 click 在捕获阶段被拦截，改为打开
  **CardActionSheet**（底部抽屉）：大图 + 该元素当前所有可执行动作的按钮。
  原"点击即执行"的动作被显式化为按钮；AbilitiesMenu 的内容合并进同一面板。
- 无动作的卡牌 tap 也打开 sheet（纯预览），取代不可发现的长按；长按保留为快捷方式。
- 文字按钮（选项列表、`Question.vue` 的选择、「继续」等）保持单步——文字本身可读，
  不存在"不知道点的是什么"。
- 实现位置：在现有 `choose` 事件分发路径上加触屏拦截层，桌面逻辑不动。
- 地点移动同样走两步（图像规则统一）；如实测后觉得高频移动太繁琐，可调整为已揭示地点单步
  （规则可调点，先统一后再说）。

### 2b. 地图 pinch-to-zoom

`Scenario.vue` 已有 pointer-event 拖拽与 `transform: scale` 缩放基建（含双击缩放
`DOUBLE_ZOOM`），补双指手势驱动 `locationsZoom`。双击缩放保留。

### 2c. 基础修缮

- safe-area insets（`env(safe-area-inset-*)`），底部导航/浮层避开 home bar
- `100dvh` 统一替换 `100vh`
- 可点元素热区审计，目标 ≥ 44px

**→ 这层完成后，平板（桌面布局 + 触控）即基本可玩。**

## 3. Phase 0：Game.vue 抽取

手机 shell 的前置。`Game.vue` 现 2859 行，websocket、撤销、各模态全部内联，
直接加第二个 shell 会复制逻辑。拆出：

- `useGameSocket` — websocket 连接、结果队列、重连
- `useGameModals` — 揭示卡 / 塔罗 / Silence / bug 表单等模态栈状态
- 各模态独立成组件文件，两个 shell 共用
- `Game.vue` 保留路由级职责，变薄壳

先例：`useGameChoices`、`useGameIndexes` 已是 composable，方向一致。
纯重构，行为不变，桌面端全程回归验证。

## 4. 手机 shell — `MobilePlayLayout`

- **全屏地图**为底（复用 `Scenario.vue`），浮层覆盖其上
- **底部导航栏**：地图 / 手牌 / 角色 / 日志，带待办指示（轮到选择时高亮）
- **统一浮层系统**（Drawer/Sheet 组件）：收编现有零散实现——`Player.vue` 的移动端
  手牌抽屉、`Game.vue` 的侧边栏抽屉、新的 CardActionSheet，全部走同一组件
- **顶部精简条**：当前阶段指示 + 汉堡菜单（收纳 game-bar 的撤销/视图/日志/debug）
- **Question 提示**停靠底部导航上方，不遮地图

## 范围外 / 顺带

- 游戏外页面（大厅、牌组等）只修明显溢出和热区问题，不重设计
- 误触兜底：现有撤销系统（choice/action/turn/phase/round 五级）已覆盖，
  不加额外确认弹窗

## 交付顺序

1 → 2 → 3 → 4，每步独立可合并：

1. `useDeviceLayout` 设备模型
2. 触控交互层（2a/2b/2c 可再拆）→ **平板可用**
3. Game.vue 抽取（纯重构）
4. 手机 shell → **手机体验完整**

## 验证方式

- 触控交互：Playwright 移动 viewport 模拟 + 真机（iPhone / iPad）实测
- Phase 0 重构：桌面全流程回归（开局 → 调查 → 战斗 → 过回合 → 撤销）
- **桌面零回归是每一步的硬约束**
