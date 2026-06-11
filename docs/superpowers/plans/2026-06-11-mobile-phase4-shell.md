# Phase 4：手机 shell（MobilePlayLayout）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手机（`useDeviceLayout().shell === 'phone'`）进入专属游戏 shell：全屏地图为底、顶部阶段条+汉堡菜单、底部导航（终态 地图/手牌/角色/日志）、统一浮层系统、Question 停靠底部——spec §4 全量。

**Architecture:** 所有逻辑（socket/modals/undo/tap 拦截/bug 上报）留在 `Game.vue`，模板按 shell 分叉 chrome；内容主体抽成 `GameMain.vue` 两端共用；模态优先级契约抽成 `ActiveGameModals.vue` 只写一处；统一浮层 `OverlayDrawer`（bottom/right + inline 透传 + keepMounted）收编 CardActionSheet、日志抽屉、手牌抽屉、角色抽屉。shell 经 provide（`phoneShell`）向 Scenario/Player 下发抽屉开关。

**Tech Stack:** Vue 3.5 + TS、vitest（jsdom，无 @vue/test-utils——组件生命周期测试用 `createApp` 宿主挂载）、SCSS/scoped CSS、vue-i18n（按文件名挂命名空间）。

**硬约束:** 桌面零回归（每个任务独立可合并，桌面行为不变）。纯抽取任务不顺手修已知 bug（既有问题清单见记忆，单独清理 commit 处理）。

**分支:** 在主 checkout 上从 `zh` 开 `mobile-phase4-shell`，完成后 merge 回 `zh`。

```bash
cd /Users/siwei/project/ArkhamHorror && git checkout -b mobile-phase4-shell zh
```

---

## 文件结构总览

新建：

| 文件 | 职责 |
|---|---|
| `frontend/src/arkham/composables/useGameUndo.spec.ts` | 补 undo 单测 |
| `frontend/src/arkham/composables/useCardTapSheet.ts` + `.spec.ts` | 触屏两步面板状态（从 Game.vue 抽出） |
| `frontend/src/arkham/components/ActiveGameModals.vue` | 模态优先级契约（silence>gameCard 互斥、tarot 并行） |
| `frontend/src/arkham/composables/useBugReport.ts` + `.spec.ts` | bug 上报状态机（从 Game.vue 抽出） |
| `frontend/src/components/OverlayDrawer.vue` | 统一浮层（bottom/right/inline/keepMounted） |
| `frontend/src/arkham/components/GameMain.vue` | Campaign/Scenario 分支链 + game-over（从 Game.vue 抽出） |
| `frontend/src/arkham/components/MobilePhaseBar.vue` | 紧凑阶段指示条 |
| `frontend/src/arkham/components/MobilePlayLayout.vue` | 手机 shell 本体 |
| `frontend/src/arkham/composables/phoneShell.ts` | shell→Scenario/Player 的 provide/inject 契约 |
| `frontend/src/arkham/composables/usePlayerHand.ts` + `.spec.ts` | 手牌/在手敌人/诡计/手牌数计算（从 Player.vue 抽出） |
| `frontend/src/arkham/cardTransitions.ts` | gsap 卡牌过渡钩子工厂（从 Player.vue 抽出） |
| `frontend/src/arkham/components/PlayerHandCards.vue` | 手牌渲染（Player.vue 桌面/移动两份模板去重） |
| `frontend/src/locales/{en,zh}/gameBoard/mobile_shell.json` | shell 文案 |

修改：`Game.vue`（瘦身+分叉）、`CardActionSheet.vue`（收编进 OverlayDrawer）、`Scenario.vue`（.phases 隐藏、player-zone 入抽屉）、`Player.vue`（手牌去重、移动浮层删除、ChoiceModal 抑制）、`ChoiceModal.vue`（docked 模式）、`locales/{en,zh}/gameBoard/gameBoard.ts`。

任务依赖：1–4 互相独立；5 → 6(收编)；6(GameMain) → 8；7 → 8；9 → 10；8 → 10/11/12；11 必须在 12 之前（角色抽屉收走 player-zone 前，Question 必须先停靠到 shell，否则选择 UI 会被藏进抽屉）。

---

### Task 1: 补 useGameUndo 单测

**Files:**
- Test: `frontend/src/arkham/composables/useGameUndo.spec.ts`
- 不改生产代码。测试按**现状行为**写（含既有怪癖：`undo()` 在检查 undoLock 之前就执行了重置副作用、`undoScenario` 无锁——这些在既有问题清单里，本任务不修）。

- [ ] **Step 1: 写测试文件**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref, shallowRef, nextTick } from 'vue'
import { useGameUndo, type UseGameUndoOptions } from './useGameUndo'
import * as api from '@/arkham/api'
import type * as Arkham from '@/arkham/types/Game'

vi.mock('@/arkham/api', () => ({
  undoChoice: vi.fn(),
  undoScenarioChoice: vi.fn(),
  undoAction: vi.fn(),
  undoTurn: vi.fn(),
  undoPhase: vi.fn(),
  undoRound: vi.fn(),
}))

function makeGame(over: Partial<Record<string, unknown>> = {}) {
  return {
    question: { p1: { tag: 'ChooseOne' } },
    scenarioSteps: 5,
    undoActionStep: 3,
    undoTurnStep: null,
    undoPhaseStep: 6,
    undoRoundStep: 1,
    ...over,
  } as unknown as Arkham.Game
}

function setup(gameOver: Partial<Record<string, unknown>> = {}) {
  const game = shallowRef<Arkham.Game | null>(makeGame(gameOver))
  const calls: string[] = []
  const opts: UseGameUndoOptions = {
    gameId: () => 'g1',
    game,
    processing: ref(false),
    setGameQuestion: vi.fn(() => calls.push('setGameQuestion')),
    clearResultQueue: vi.fn(() => calls.push('clearResultQueue')),
    modals: { resetForUndo: vi.fn(() => calls.push('resetForUndo')) },
    debugActive: () => false,
  }
  return { undoApi: useGameUndo(opts), opts, game, calls }
}

describe('useGameUndo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('undo 成功：重置顺序为 清问题→清队列→resetForUndo，调用 undoChoice 并释放锁', async () => {
    vi.mocked(api.undoChoice).mockResolvedValue(undefined as never)
    const { undoApi, opts, calls } = setup()
    await undoApi.undo()
    expect(calls).toEqual(['setGameQuestion', 'clearResultQueue', 'resetForUndo'])
    expect(opts.setGameQuestion).toHaveBeenCalledWith({})
    expect(api.undoChoice).toHaveBeenCalledWith('g1', false)
    expect(opts.processing.value).toBe(true) // 成功路径由后续 socket 推送解除 processing
    // 锁已释放：可再次 undo
    await undoApi.undo()
    expect(api.undoChoice).toHaveBeenCalledTimes(2)
  })

  it('undo 失败：恢复旧 question、processing 回 false', async () => {
    vi.mocked(api.undoChoice).mockRejectedValue(new Error('boom'))
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { undoApi, opts } = setup()
    await undoApi.undo()
    expect(opts.processing.value).toBe(false)
    // 第二次调用恢复了旧 question
    expect(vi.mocked(opts.setGameQuestion).mock.calls[1][0]).toEqual({ p1: { tag: 'ChooseOne' } })
    consoleSpy.mockRestore()
  })

  it('undo 锁早退：pending 期间重入不重复调 API（既有怪癖：重置副作用仍会执行）', async () => {
    let release!: () => void
    vi.mocked(api.undoChoice).mockReturnValue(new Promise<void>((r) => (release = r)) as never)
    const { undoApi } = setup()
    const first = undoApi.undo()
    await undoApi.undo() // 锁住，早退
    expect(api.undoChoice).toHaveBeenCalledTimes(1)
    release()
    await first
  })

  it('undoBoundary 锁早退：锁检查在所有副作用之前', async () => {
    let release!: () => void
    vi.mocked(api.undoAction).mockReturnValue(new Promise<void>((r) => (release = r)) as never)
    const { undoApi, opts } = setup()
    const first = undoApi.undoActionStart()
    await undoApi.undoActionStart()
    expect(api.undoAction).toHaveBeenCalledTimes(1)
    expect(opts.setGameQuestion).toHaveBeenCalledTimes(1) // 重入未触发副作用
    release()
    await first
  })

  it('undoBoundary 失败：恢复旧 question、processing 回 false、锁释放', async () => {
    vi.mocked(api.undoTurn).mockRejectedValue(new Error('boom'))
    vi.mocked(api.undoRound).mockResolvedValue(undefined as never)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { undoApi, opts } = setup()
    await undoApi.undoTurnStart()
    expect(opts.processing.value).toBe(false)
    await undoApi.undoRoundStart() // 锁已释放
    expect(api.undoRound).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  it('canUndo*：scenarioSteps 与边界步比较；边界为 null 或 game 为 null 时 false', async () => {
    const { undoApi, game } = setup()
    expect(undoApi.canUndoScenario.value).toBe(true)  // steps 5 > 1
    expect(undoApi.canUndoAction.value).toBe(true)    // 5 > 3
    expect(undoApi.canUndoTurn.value).toBe(false)     // null
    expect(undoApi.canUndoPhase.value).toBe(false)    // 5 > 6 不成立
    expect(undoApi.canUndoRound.value).toBe(true)     // 5 > 1
    game.value = null
    await nextTick()
    expect(undoApi.canUndoScenario.value).toBe(false)
    expect(undoApi.canUndoAction.value).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认全绿**

Run: `cd frontend && npx vitest run src/arkham/composables/useGameUndo.spec.ts`
Expected: 6 passed。若「重置顺序」或「锁早退」断言与实际不符，**以实际行为为准修测试**（本任务只记录现状，不改生产代码），并在 commit message 里注明。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/arkham/composables/useGameUndo.spec.ts
git commit -m "Add useGameUndo unit tests covering reset order and lock early-exit"
```

---

### Task 2: 抽取 useCardTapSheet

**Files:**
- Create: `frontend/src/arkham/composables/useCardTapSheet.ts`
- Test: `frontend/src/arkham/composables/useCardTapSheet.spec.ts`
- Modify: `frontend/src/arkham/views/Game.vue`（删除 sheetTap/tapIntercept 内联逻辑，行为不变）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createApp, defineComponent, h, shallowRef, nextTick } from 'vue'
import type * as Arkham from '@/arkham/types/Game'
import type { InterceptedTap } from '@/arkham/touchTapIntercept'

const approve = vi.fn()
const uninstall = vi.fn()

interface InstallOpts {
  isTouch: () => boolean
  onIntercept: (tap: InterceptedTap) => void
  shouldPreview?: (el: HTMLElement) => boolean
}
let lastInstallOpts: InstallOpts | null = null

vi.mock('@/arkham/touchTapIntercept', () => ({
  installTapIntercept: vi.fn((opts) => {
    lastInstallOpts = opts
    return { approve, uninstall }
  }),
}))
vi.mock('@/arkham/cardImageLookup', () => ({
  getCardImage: vi.fn(() => 'img.avif'),
}))

import { useCardTapSheet } from './useCardTapSheet'

// 无 @vue/test-utils：用 createApp 宿主组件驱动生命周期
function mountWith(game: ReturnType<typeof shallowRef<Arkham.Game | null>>) {
  let result!: ReturnType<typeof useCardTapSheet>
  const app = createApp(
    defineComponent({
      setup() {
        result = useCardTapSheet({ isTouch: () => true, game })
        return () => h('div')
      },
    }),
  )
  app.mount(document.createElement('div'))
  return { result, app }
}

const fakeTap = (): InterceptedTap => ({
  el: document.createElement('div'),
  target: document.createElement('div'),
  actionable: true,
})

describe('useCardTapSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastInstallOpts = null
  })

  it('挂载时安装拦截器；拦截到 tap 后清卡牌悬浮层并存入 sheetTap', () => {
    const game = shallowRef<Arkham.Game | null>(null)
    const dispatched: string[] = []
    const spy = vi
      .spyOn(document, 'dispatchEvent')
      .mockImplementation((e: Event) => (dispatched.push(e.type), true))
    const { result } = mountWith(game)
    expect(lastInstallOpts).not.toBeNull()
    const tap = fakeTap()
    lastInstallOpts!.onIntercept(tap)
    expect(dispatched).toContain('arkham:clear-card-overlay')
    expect(result.sheetTap.value).toBe(tap)
    spy.mockRestore()
  })

  it('confirmSheetAction：approve 原 tap 并清空 sheetTap', () => {
    const game = shallowRef<Arkham.Game | null>(null)
    const { result } = mountWith(game)
    const tap = fakeTap()
    lastInstallOpts!.onIntercept(tap)
    result.confirmSheetAction()
    expect(approve).toHaveBeenCalledWith(tap)
    expect(result.sheetTap.value).toBeNull()
  })

  it('closeSheet 只清空不放行', () => {
    const game = shallowRef<Arkham.Game | null>(null)
    const { result } = mountWith(game)
    lastInstallOpts!.onIntercept(fakeTap())
    result.closeSheet()
    expect(result.sheetTap.value).toBeNull()
    expect(approve).not.toHaveBeenCalled()
  })

  it('game 推送新状态后自动关闭面板（动作可能已失效）', async () => {
    const game = shallowRef<Arkham.Game | null>(null)
    const { result } = mountWith(game)
    lastInstallOpts!.onIntercept(fakeTap())
    game.value = {} as Arkham.Game
    await nextTick()
    expect(result.sheetTap.value).toBeNull()
  })

  it('卸载时 uninstall 拦截器', () => {
    const game = shallowRef<Arkham.Game | null>(null)
    const { app } = mountWith(game)
    app.unmount()
    expect(uninstall).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/arkham/composables/useCardTapSheet.spec.ts`
Expected: FAIL，`Cannot find module './useCardTapSheet'`（或同义报错）。

- [ ] **Step 3: 写 composable**

`frontend/src/arkham/composables/useCardTapSheet.ts`：

```ts
import { onMounted, onUnmounted, ref, watch, type ShallowRef } from 'vue'
import type * as Arkham from '@/arkham/types/Game'
import {
  installTapIntercept,
  type InterceptedTap,
  type TapIntercept,
} from '@/arkham/touchTapIntercept'
import { getCardImage } from '@/arkham/cardImageLookup'

// 触屏「图像两步」面板状态：installTapIntercept 拦到 tap 后存入 sheetTap，
// CardActionSheet 确认时经 approve() 重放原 click。生命周期挂在调用方组件上。
export function useCardTapSheet(opts: {
  isTouch: () => boolean
  game: ShallowRef<Arkham.Game | null>
}) {
  const sheetTap = ref<InterceptedTap | null>(null)
  let tapIntercept: TapIntercept | null = null

  // 服务器推送新状态后，面板里的动作可能已失效，直接关闭
  watch(opts.game, () => {
    sheetTap.value = null
  })

  function confirmSheetAction() {
    const tap = sheetTap.value
    sheetTap.value = null
    if (tap) tapIntercept?.approve(tap)
  }

  function closeSheet() {
    sheetTap.value = null
  }

  onMounted(() => {
    tapIntercept = installTapIntercept({
      isTouch: opts.isTouch,
      shouldPreview: (el) => getCardImage(el) !== null,
      onIntercept: (tap) => {
        document.dispatchEvent(new Event('arkham:clear-card-overlay'))
        sheetTap.value = tap
      },
    })
  })

  onUnmounted(() => {
    tapIntercept?.uninstall()
    tapIntercept = null
  })

  return { sheetTap, confirmSheetAction, closeSheet }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/arkham/composables/useCardTapSheet.spec.ts`
Expected: 5 passed。

- [ ] **Step 5: Game.vue 切换到 composable**

`frontend/src/arkham/views/Game.vue` 五处修改：

1. import 区：删
```ts
import {
  installTapIntercept,
  type InterceptedTap,
  type TapIntercept,
} from '@/arkham/touchTapIntercept'
```
和 `import { getCardImage } from '@/arkham/cardImageLookup'`，加
```ts
import { useCardTapSheet } from '@/arkham/composables/useCardTapSheet'
```

2. 删除（在 `const { t } = useI18n()` 之后）：
```ts
const sheetTap = ref<InterceptedTap | null>(null)
let tapIntercept: TapIntercept | null = null

// 服务器推送新状态后，面板里的动作可能已失效，直接关闭
watch(game, () => {
  sheetTap.value = null
})

function confirmSheetAction() {
  const tap = sheetTap.value
  sheetTap.value = null
  if (tap) tapIntercept?.approve(tap)
}
```
替换为：
```ts
const { sheetTap, confirmSheetAction, closeSheet } = useCardTapSheet({
  isTouch: () => isTouch.value,
  game,
})
```
注意该调用须在 `const { isTouch, size } = useDeviceLayout()` 与 socket 创建之后。

3. `onMounted` 内删除 `tapIntercept = installTapIntercept({ ... })` 整段。

4. `onUnmounted` 内删除：
```ts
  tapIntercept?.uninstall()
  tapIntercept = null
```

5. 模板 `<CardActionSheet>` 的 `@close="sheetTap = null"` 改为 `@close="closeSheet"`。

若 `watch` / `ref` 等 import 因此不再使用，从 vue import 中移除（`npm run lint` 会提示）。

- [ ] **Step 6: 全量验证**

Run: `cd frontend && npx vitest run && npm run tc`
Expected: 全部通过、类型检查无新错误。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/arkham/composables/useCardTapSheet.ts frontend/src/arkham/composables/useCardTapSheet.spec.ts frontend/src/arkham/views/Game.vue
git commit -m "Extract useCardTapSheet from Game.vue"
```

---

### Task 3: 抽取 ActiveGameModals.vue（模态优先级契约）

**Files:**
- Create: `frontend/src/arkham/components/ActiveGameModals.vue`
- Modify: `frontend/src/arkham/views/Game.vue`

- [ ] **Step 1: 写组件**

```vue
<script lang="ts" setup>
// 模态优先级契约（两个 shell 共用，禁止在 shell 模板里复制）：
// - TheSilence 与揭示卡互斥，TheSilence 优先（v-if / v-else-if）
// - 塔罗与上述并行（可同时出现）
// 状态与 uiLock 排队协议见 useGameModals / useGameSocket。
import type { Game } from '@/arkham/types/Game'
import type { GameModals } from '@/arkham/composables/useGameModals'
import TheSilenceModal from '@/arkham/components/TheSilenceModal.vue'
import RevealedCardModal from '@/arkham/components/RevealedCardModal.vue'
import TarotModal from '@/arkham/components/TarotModal.vue'

const props = defineProps<{
  game: Game
  playerId: string
  modals: GameModals
}>()

const { gameCard, tarotCards, showTheSilenceModal, continueUI } = props.modals
</script>

<template>
  <TheSilenceModal v-if="showTheSilenceModal" @continue="continueUI" />
  <RevealedCardModal
    v-else-if="gameCard"
    :game="game"
    :playerId="playerId"
    :gameCard="gameCard"
    @continue="continueUI"
  />
  <TarotModal v-if="tarotCards.length > 0" :tarotCards="tarotCards" @continue="continueUI" />
</template>
```

（多根模板 = fragment，不引入包裹元素，DOM 结构与现状一致。）

- [ ] **Step 2: Game.vue 替换**

1. import 区：删 `TheSilenceModal`、`RevealedCardModal`、`TarotModal` 三行 import，加
```ts
import ActiveGameModals from '@/arkham/components/ActiveGameModals.vue'
```
2. script：删 `const { gameCard, tarotCards, showTheSilenceModal, continueUI } = modals`（这些只被模板里的三个模态用到）。
3. 模板 `.game-main` 内，将：
```vue
<TheSilenceModal v-if="showTheSilenceModal" @continue="continueUI" />
<RevealedCardModal
  v-else-if="gameCard"
  :game="game"
  :playerId="playerId"
  :gameCard="gameCard"
  @continue="continueUI"
/>
```
替换为：
```vue
<ActiveGameModals :game="game" :playerId="playerId" :modals="modals" />
```
并删除下方独立的一行 `<TarotModal v-if="tarotCards.length > 0" :tarotCards="tarotCards" @continue="continueUI" />`（已并入契约组件；它原来与 HistoryPanel/PlayabilityModal 之间的相对位置不影响展示——三者都是 fixed 浮层）。

- [ ] **Step 3: 验证**

Run: `cd frontend && npx vitest run && npm run tc && npm run lint`
Expected: 通过。手动回归（dev server，桌面视口）：进一局游戏触发一次揭示卡（如遭遇卡揭示）确认模态正常弹出/继续。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/arkham/components/ActiveGameModals.vue frontend/src/arkham/views/Game.vue
git commit -m "Extract ActiveGameModals to centralize modal priority contract"
```

---

### Task 4: 抽取 useBugReport

**Files:**
- Create: `frontend/src/arkham/composables/useBugReport.ts`
- Test: `frontend/src/arkham/composables/useBugReport.spec.ts`
- Modify: `frontend/src/arkham/views/Game.vue`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useBugReport } from './useBugReport'
import * as Api from '@/arkham/api'

vi.mock('@/arkham/api', () => ({
  fileBug: vi.fn(),
}))

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('useBugReport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('openBugReport：带初始描述打开表单', () => {
    const r = useBugReport({ gameId: () => 'g1', onFail: vi.fn() })
    r.openBugReport('boom stack')
    expect(r.filingBug.value).toBe(true)
    expect(r.bugInitialDescription.value).toBe('boom stack')
  })

  it('fileBug 成功：关表单→submitting→打开 GitHub issue→复位', async () => {
    vi.mocked(Api.fileBug).mockResolvedValue({ data: 'debug-file-url' } as never)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const r = useBugReport({ gameId: () => 'g1', onFail: vi.fn() })
    r.openBugReport()
    r.fileBug('title', 'desc')
    expect(r.filingBug.value).toBe(false)
    expect(r.submittingBug.value).toBe(true)
    await flush()
    expect(Api.fileBug).toHaveBeenCalledWith('g1')
    expect(open).toHaveBeenCalledOnce()
    const url = open.mock.calls[0][0] as string
    expect(url).toContain('github.com/halogenandtoast/ArkhamHorror/issues/new')
    expect(url).toContain(encodeURIComponent('debug-file-url'))
    expect(r.submittingBug.value).toBe(false)
    open.mockRestore()
  })

  it('fileBug 失败：调 onFail 并复位 submitting', async () => {
    vi.mocked(Api.fileBug).mockRejectedValue(new Error('nope'))
    const onFail = vi.fn()
    const r = useBugReport({ gameId: () => 'g1', onFail })
    r.fileBug('t', 'd')
    await flush()
    expect(onFail).toHaveBeenCalledOnce()
    expect(r.submittingBug.value).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/arkham/composables/useBugReport.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 composable**

`frontend/src/arkham/composables/useBugReport.ts`：

```ts
import { ref } from 'vue'
import * as Api from '@/arkham/api'

// bug 上报流程状态机：表单（filingBug）→ 提交占位页（submittingBug）→ 打开 GitHub issue。
// 失败提示方式由调用方注入（桌面 alert / 手机 shell 可换内嵌提示）。
export function useBugReport(opts: { gameId: () => string; onFail: () => void }) {
  const filingBug = ref(false)
  const submittingBug = ref(false)
  const bugInitialDescription = ref('')

  function openBugReport(initialDescription = '') {
    bugInitialDescription.value = initialDescription
    filingBug.value = true
  }

  function fileBug(bugTitle: string, bugDescription: string) {
    submittingBug.value = true
    filingBug.value = false
    Api.fileBug(opts.gameId())
      .then((response) => {
        const title = encodeURIComponent(bugTitle)
        const body = encodeURIComponent(
          `${bugDescription}\n\ngame: ${window.location.href}\nfile: ${response.data}`,
        )
        window.open(
          `https://github.com/halogenandtoast/ArkhamHorror/issues/new?labels=bug&title=${title}&body=${body}&assignee=halogenandtoast&projects=halogenandtoast/2`,
          '_blank',
        )
        submittingBug.value = false
      })
      .catch(() => {
        opts.onFail()
        submittingBug.value = false
      })
  }

  return { filingBug, submittingBug, bugInitialDescription, openBugReport, fileBug }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/arkham/composables/useBugReport.spec.ts`
Expected: 3 passed。

- [ ] **Step 5: Game.vue 切换**

1. import 加 `import { useBugReport } from '@/arkham/composables/useBugReport'`。
2. 删除：
```ts
const filingBug = ref(false)
const submittingBug = ref(false)
const bugInitialDescription = ref('')
```
与
```ts
function fileBugFromError() {
  bugInitialDescription.value = error.value ?? ''
  error.value = null
  filingBug.value = true
}

function openBugReport() {
  bugInitialDescription.value = ''
  filingBug.value = true
}

async function fileBug(bugTitle: string, bugDescription: string) { /* 整个函数体 */ }
```
替换为：
```ts
const { filingBug, submittingBug, bugInitialDescription, openBugReport, fileBug } = useBugReport({
  gameId: () => props.gameId,
  onFail: () => alert(t('gameBar.bugSubmittingFail')),
})

function fileBugFromError() {
  const description = error.value ?? ''
  error.value = null
  openBugReport(description)
}
```
3. 模板不变（`fileBugFromError`、`openBugReport`、`fileBug`、`filingBug`、`submittingBug`、`bugInitialDescription` 名称全部保留）。注意 `useGameKeyboard` 的 `enabled: () => !filingBug.value` 仍然成立。
4. `Api`（`import * as Api from '@/arkham/api'`）若 Game.vue 再无其他使用处则删除该 import。

- [ ] **Step 6: 验证 + Commit**

Run: `cd frontend && npx vitest run && npm run tc && npm run lint`
Expected: 通过。

```bash
git add frontend/src/arkham/composables/useBugReport.ts frontend/src/arkham/composables/useBugReport.spec.ts frontend/src/arkham/views/Game.vue
git commit -m "Extract useBugReport from Game.vue"
```

---

### Task 5: OverlayDrawer 统一浮层 + 收编 CardActionSheet

**Files:**
- Create: `frontend/src/components/OverlayDrawer.vue`
- Modify: `frontend/src/arkham/components/CardActionSheet.vue`

- [ ] **Step 1: 写 OverlayDrawer**

```vue
<script lang="ts" setup>
// 统一浮层系统（spec §4）：底部 sheet / 右侧抽屉，带遮罩与滑入动画。
// - keepMounted：v-show 切换，保留内部组件状态（如 PlayerTabs 选中页）
// - inline：透传模式，原地渲染 slot 不做浮层（桌面与手机复用同一段模板时用）
withDefaults(
  defineProps<{
    open: boolean
    side?: 'bottom' | 'right'
    keepMounted?: boolean
    inline?: boolean
  }>(),
  { side: 'bottom', keepMounted: false, inline: false },
)
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <slot v-if="inline" />
  <Teleport v-else to="body">
    <Transition name="overlay-drawer" appear>
      <div
        v-if="keepMounted || open"
        v-show="open"
        class="overlay-drawer-backdrop"
        :class="`overlay-drawer-backdrop--${side}`"
        @click.self="emit('close')"
      >
        <div class="overlay-drawer" :class="`overlay-drawer--${side}`">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
}

.overlay-drawer-backdrop--bottom {
  align-items: flex-end;
  justify-content: center;
}

.overlay-drawer-backdrop--right {
  justify-content: flex-end;
}

.overlay-drawer {
  background: var(--background, #1c1c1c);
  overflow: auto;
  overscroll-behavior: contain;
}

.overlay-drawer--bottom {
  width: 100%;
  max-height: 85dvh;
  border-radius: 12px 12px 0 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.overlay-drawer--right {
  height: 100dvh;
  width: min(85vw, 360px);
  box-shadow: -2px 0 16px rgba(0, 0, 0, 0.45);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.overlay-drawer-enter-active,
.overlay-drawer-leave-active {
  transition: opacity 0.18s ease;
}

.overlay-drawer-enter-active .overlay-drawer,
.overlay-drawer-leave-active .overlay-drawer {
  transition: transform 0.18s ease;
}

.overlay-drawer-enter-from,
.overlay-drawer-leave-to {
  opacity: 0;
}

.overlay-drawer-enter-from .overlay-drawer--bottom,
.overlay-drawer-leave-to .overlay-drawer--bottom {
  transform: translateY(100%);
}

.overlay-drawer-enter-from .overlay-drawer--right,
.overlay-drawer-leave-to .overlay-drawer--right {
  transform: translateX(100%);
}
</style>
```

- [ ] **Step 2: CardActionSheet 收编**

`frontend/src/arkham/components/CardActionSheet.vue` 整体替换为：

```vue
<script lang="ts" setup>
import { computed } from 'vue'
import { getCardImage } from '@/arkham/cardImageLookup'
import OverlayDrawer from '@/components/OverlayDrawer.vue'

const props = defineProps<{
  target: HTMLElement
  actionable: boolean
}>()

const emit = defineEmits<{
  confirm: []
  close: []
}>()

const image = computed(() => getCardImage(props.target))
</script>

<template>
  <!-- .card-action-sheet 类被 touchTapIntercept 的放行判断引用，保留 -->
  <OverlayDrawer :open="true" side="bottom" @close="emit('close')">
    <div class="card-action-sheet no-overlay">
      <img v-if="image" :src="image" class="sheet-card" />
      <div class="sheet-actions">
        <button v-if="actionable" class="sheet-confirm" @click="emit('confirm')">
          {{ $t('cardSheet.perform') }}
        </button>
        <button class="sheet-cancel" @click="emit('close')">{{ $t('cancel') }}</button>
      </div>
    </div>
  </OverlayDrawer>
</template>

<style scoped>
.card-action-sheet {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.sheet-card {
  max-height: 50dvh;
  max-width: 100%;
  border-radius: 8px;
  object-fit: contain;
}

.sheet-actions {
  display: flex;
  gap: 10px;
  width: 100%;
}

.sheet-actions button {
  flex: 1;
  min-height: 48px;
  border: none;
  border-radius: 8px;
  font-size: 1em;
  cursor: pointer;
}

.sheet-confirm {
  background: var(--select, #ff00ff);
  color: white;
  font-weight: 700;
}

.sheet-cancel {
  background: rgba(255, 255, 255, 0.12);
  color: var(--title, #cecece);
}
</style>
```

注意：scoped style 作用不到 OverlayDrawer 内部（Teleport + 子组件），`.card-action-sheet` 是本组件 slot 内容、scoped 正常生效。原 backdrop/定位样式由 OverlayDrawer 接管。

- [ ] **Step 3: 验证**

Run: `cd frontend && npx vitest run && npm run tc && npm run lint`
Expected: 通过（touchTapIntercept.spec 仍绿——放行判断依赖的 `.card-action-sheet` 类保留在 slot 内容上）。
手动（dev server + Chrome devtools 触屏模拟，iPhone 视口）：tap 一张可交互手牌 → 底部 sheet 弹出带滑入动画 → 确认/取消都正常、遮罩点击关闭。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/OverlayDrawer.vue frontend/src/arkham/components/CardActionSheet.vue
git commit -m "Add OverlayDrawer and rebuild CardActionSheet on top of it"
```

---

### Task 6: 抽取 GameMain.vue（内容主体两端共用）

**Files:**
- Create: `frontend/src/arkham/components/GameMain.vue`
- Modify: `frontend/src/arkham/views/Game.vue`

- [ ] **Step 1: 写 GameMain**

```vue
<script lang="ts" setup>
// 游戏内容主体：CampaignSettings/Campaign/ScenarioSettings/StandaloneScenario 分支链 + game-over。
// 桌面（Game.vue .game-main）与手机（MobilePlayLayout）共用；chrome（侧边栏/导航/顶条）归 shell。
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Game } from '@/arkham/types/Game'
import { useCardStore } from '@/stores/cards'
import Campaign from '@/arkham/components/Campaign.vue'
import CampaignLog from '@/arkham/components/CampaignLog.vue'
import CampaignSettings from '@/arkham/components/CampaignSettings.vue'
import ScenarioSettings from '@/arkham/components/ScenarioSettings.vue'
import StandaloneScenario from '@/arkham/components/StandaloneScenario.vue'

const props = defineProps<{
  game: Game
  gameId: string
  playerId: string
  gameLog: readonly string[]
}>()

const emit = defineEmits<{
  choose: [number]
  update: [Game]
}>()

const router = useRouter()
const store = useCardStore()
const cards = computed(() => store.cards)
const gameOver = computed(() => props.game.gameState.tag === 'IsOver')
const question = computed(() => props.game.question[props.playerId])
</script>

<template>
  <CampaignSettings
    v-if="game.campaign && !gameOver && question && question.tag === 'PickCampaignSettings'"
    :game="game"
    :campaign="game.campaign"
    :playerId="playerId"
  />
  <Campaign
    v-else-if="game.campaign"
    :game="game"
    :gameLog="gameLog"
    :playerId="playerId"
    :campaign="game.campaign"
    @choose="emit('choose', $event)"
    @update="emit('update', $event)"
  />
  <ScenarioSettings
    v-else-if="game.scenario && !gameOver && question && question.tag === 'PickScenarioSettings'"
    :game="game"
    :scenario="game.scenario"
    :playerId="playerId"
  />
  <StandaloneScenario
    v-else-if="game.scenario && !gameOver"
    :game="game"
    :playerId="playerId"
    @choose="emit('choose', $event)"
    @update="emit('update', $event)"
  />
  <div class="game-over" v-if="gameOver">
    <p>{{ $t('gameOver') }}</p>
    <button class="replay-button" @click="router.push({ name: 'ReplayGame', params: { gameId } })">
      {{ $t('watchReplay') }}
    </button>
    <CampaignLog v-if="game !== null" :game="game" :cards="cards" :playerId="playerId" />
  </div>
</template>

<style lang="scss" scoped>
.game-over {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;

  p {
    text-transform: uppercase;
    background: rgba(0, 0, 0, 0.5);
    width: 100%;
    padding: 10px 20px;
    color: white;
    text-align: center;
  }
}

.replay-button {
  padding: 10px;
  width: 100%;
  font-size: 1.2em;
  border: 0;
  background-color: var(--spooky-green);
  &:hover {
    background-color: var(--spooky-green-dark);
  }
}
</style>
```

- [ ] **Step 2: Game.vue 替换**

1. import：删 `Campaign`、`CampaignSettings`、`ScenarioSettings`、`StandaloneScenario` 四个 import（`CampaignLog` 保留——showLog 分支与 game-over 之外仍用），加 `import GameMain from '@/arkham/components/GameMain.vue'`。
2. 模板 `.game-main` 内：将 `<CampaignSettings ...>` 到 `<StandaloneScenario ...>` 的整段分支链，连同其后的 `<div class="game-over" v-if="gameOver">...</div>` 块，替换为：
```vue
<GameMain
  :game="game"
  :game-id="gameId"
  :player-id="playerId"
  :game-log="gameLog"
  @choose="choose"
  @update="socket.setGame"
/>
```
注意保持两个 `.sidebar` div 与 `.sidebar-backdrop` 原位不动（它们是桌面 chrome）。
3. 同时把 `<HistoryPanel ...>` 与 `<PlayabilityModal ...>` 两块从 `.game-main` 内**上移**到 `#game` 根级（紧跟 `<ShortcutsModal>` 之后）——它们是 fixed/absolute 浮层，两端 shell 都要能用，Game.vue 持有其状态（showHistory/playabilityInfo）：
```vue
<ShortcutsModal v-if="showShortcuts" @close="showShortcuts = false" />
<HistoryPanel
  v-if="showHistory && game && playerId"
  :game="game"
  :playerId="playerId"
  @close="showHistory = false"
/>
<PlayabilityModal
  v-if="playabilityInfo && debug.active"
  :info="playabilityInfo"
  @close="playabilityInfo = null"
/>
```
4. script：`gameOver` computed 若只剩 `.game-main` 的 sidebar 条件在用则保留；`cards` computed 仍被 showLog 的 `<CampaignLog>` 使用，保留。删除 Game.vue `<style>` 里整段 `.game-over` 与 `.replay-button` 规则（已随组件迁走）。

- [ ] **Step 3: 验证**

Run: `cd frontend && npx vitest run && npm run tc && npm run lint`
Expected: 通过。
手动桌面回归（关键，本任务动了模板结构）：开一局战役游戏走到场景内 → 地图/玩家区/侧边栏正常；按 `H` 开历史面板、debug 模式下可玩性弹窗正常；打完一局（或 debug 跳到结束）看 game-over 块样式不变。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/arkham/components/GameMain.vue frontend/src/arkham/views/Game.vue
git commit -m "Extract GameMain content branch chain from Game.vue"
```

---

### Task 7: MobilePhaseBar + shell i18n 文案

**Files:**
- Create: `frontend/src/arkham/components/MobilePhaseBar.vue`
- Create: `frontend/src/locales/en/gameBoard/mobile_shell.json`、`frontend/src/locales/zh/gameBoard/mobile_shell.json`
- Modify: `frontend/src/locales/en/gameBoard/gameBoard.ts`、`frontend/src/locales/zh/gameBoard/gameBoard.ts`

- [ ] **Step 1: i18n 文件**

`frontend/src/locales/en/gameBoard/mobile_shell.json`：
```json
{
  "map": "Map",
  "hand": "Hand",
  "players": "Investigators",
  "log": "Log",
  "menu": "Menu",
  "undoGroup": "Undo"
}
```
`frontend/src/locales/zh/gameBoard/mobile_shell.json`：
```json
{
  "map": "地图",
  "hand": "手牌",
  "players": "角色",
  "log": "日志",
  "menu": "菜单",
  "undoGroup": "撤销"
}
```
两个 `gameBoard.ts`（en、zh 同样改法）：
```ts
import mobileShell from '@/locales/en/gameBoard/mobile_shell.json'   // zh 文件里路径用 zh
// export default 对象里追加：
export default {...base, phase, skillTest, gameBar, historyPanel, investigator, scenario, card, upgrade, create, mobileShell}
```
（es/fr/it/ko 不加，vue-i18n 回退到 en。）

- [ ] **Step 2: 写 MobilePhaseBar**

```vue
<script lang="ts" setup>
// 手机顶部紧凑阶段条：替代桌面 .phases 侧栏（竖屏 ≤768px 下本就被 Scenario.vue 隐藏）。
// 只到阶段粒度；子步骤 tooltip 在触屏不可用，不搬。
import { computed } from 'vue'
import type { Game } from '@/arkham/types/Game'

const props = defineProps<{ game: Game }>()
const phase = computed(() => props.game.phase)

const PHASES = [
  { key: 'MythosPhase', label: 'phase.mythosPhase' },
  { key: 'InvestigationPhase', label: 'phase.investigationPhase' },
  { key: 'EnemyPhase', label: 'phase.enemyPhase' },
  { key: 'UpkeepPhase', label: 'phase.upkeepPhase' },
] as const
</script>

<template>
  <div class="mobile-phase-bar">
    <div
      v-for="p in PHASES"
      :key="p.key"
      class="phase-chip"
      :class="{ 'phase-chip--active': phase === p.key }"
    >
      {{ $t(p.label) }}
    </div>
  </div>
</template>

<style scoped>
.mobile-phase-bar {
  display: flex;
  gap: 4px;
  align-items: center;
  overflow-x: auto;
  min-width: 0;
}

.phase-chip {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.06);
  white-space: nowrap;
}

.phase-chip--active {
  color: #fff;
  background: var(--select, #6f42c1);
  font-weight: 700;
}
</style>
```

- [ ] **Step 3: 验证 + Commit**

Run: `cd frontend && npm run tc && npm run lint && npx vitest run`
Expected: 通过（组件尚未被引用，仅编译检查）。

```bash
git add frontend/src/arkham/components/MobilePhaseBar.vue frontend/src/locales/en/gameBoard/mobile_shell.json frontend/src/locales/zh/gameBoard/mobile_shell.json frontend/src/locales/en/gameBoard/gameBoard.ts frontend/src/locales/zh/gameBoard/gameBoard.ts
git commit -m "Add MobilePhaseBar and mobile shell i18n strings"
```

---

### Task 8: MobilePlayLayout 骨架 + Game.vue 按 shell 分叉

**Files:**
- Create: `frontend/src/arkham/composables/phoneShell.ts`
- Create: `frontend/src/arkham/components/MobilePlayLayout.vue`
- Modify: `frontend/src/arkham/views/Game.vue`、`frontend/src/arkham/components/Scenario.vue`、`frontend/src/arkham/composables/useGameUndo.ts`（加导出类型）

骨架范围：顶部条（MobilePhaseBar + 撤销 + 汉堡）、底部导航（地图/日志，**手牌/角色 tab 在 Task 10/12 加**）、日志抽屉、汉堡菜单 sheet（菜单项/撤销组/debug/上报 bug/战役日志）。

- [ ] **Step 1: useGameUndo 导出 API 类型**

`frontend/src/arkham/composables/useGameUndo.ts` 文件末尾追加：
```ts
export type GameUndoApi = ReturnType<typeof useGameUndo>
```

- [ ] **Step 2: phoneShell provide/inject 契约**

`frontend/src/arkham/composables/phoneShell.ts`：
```ts
import { inject, provide, type InjectionKey, type Ref } from 'vue'

// 手机 shell 与深层组件（Scenario/Player）之间的小协议：
// - 注入存在 ⇒ 当前在手机 shell 内（Scenario 据此隐藏 .phases、把 player-zone 交给抽屉）
// - 抽屉开关由 shell 持有，深层组件只读写 Ref
export interface PhoneShellControls {
  handOpen: Ref<boolean>
  playersOpen: Ref<boolean>
}

export const phoneShellKey: InjectionKey<PhoneShellControls> = Symbol('phoneShell')

export function providePhoneShell(controls: PhoneShellControls) {
  provide(phoneShellKey, controls)
}

export function usePhoneShell() {
  return inject(phoneShellKey, null)
}
```

- [ ] **Step 3: 写 MobilePlayLayout**

`frontend/src/arkham/components/MobilePlayLayout.vue`：

```vue
<script lang="ts" setup>
// 手机 shell（spec §4）：全屏地图为底，顶部 阶段条+撤销+汉堡，底部导航，统一浮层。
// 逻辑（socket/undo/modals）全在 Game.vue，这里只做 chrome 与编排。
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Bars3Icon, BackwardIcon, ExclamationTriangleIcon, DocumentTextIcon, MapIcon } from '@heroicons/vue/20/solid'
import type { Game } from '@/arkham/types/Game'
import type { GameModals } from '@/arkham/composables/useGameModals'
import type { GameUndoApi } from '@/arkham/composables/useGameUndo'
import { providePhoneShell } from '@/arkham/composables/phoneShell'
import { useMenu } from '@/composable/menu'
import { useDebug } from '@/arkham/debug'
import MobilePhaseBar from '@/arkham/components/MobilePhaseBar.vue'
import ActiveGameModals from '@/arkham/components/ActiveGameModals.vue'
import GameMain from '@/arkham/components/GameMain.vue'
import GameLog from '@/arkham/components/GameLog.vue'
import OverlayDrawer from '@/components/OverlayDrawer.vue'

const props = defineProps<{
  game: Game
  gameId: string
  playerId: string
  gameLog: readonly string[]
  modals: GameModals
  undoApi: GameUndoApi
}>()

const emit = defineEmits<{
  choose: [number]
  update: [Game]
  fileBug: []
  undoScenario: []
}>()

const router = useRouter()
const debug = useDebug()
const { menuItems } = useMenu()

const menuOpen = ref(false)
const logOpen = ref(false)
const handOpen = ref(false)
const playersOpen = ref(false)
providePhoneShell({ handOpen, playersOpen })

type DrawerName = 'log' | 'hand' | 'players'
const drawers: Record<DrawerName, typeof logOpen> = { log: logOpen, hand: handOpen, players: playersOpen }
function toggleDrawer(name: DrawerName) {
  const next = !drawers[name].value
  for (const d of Object.values(drawers)) d.value = false
  drawers[name].value = next
}
function closeAllDrawers() {
  for (const d of Object.values(drawers)) d.value = false
  menuOpen.value = false
}

const inPlay = computed(() => props.game.gameState.tag === 'IsActive' && props.game.scenario !== null)
// 待办指示：轮到本玩家选择时高亮（Task 11 起配合 Question 停靠使用）
const hasQuestion = computed(() => !!props.game.question[props.playerId])

// 技能检定开始时自动展开手牌（对齐原 Player.vue 移动浮层行为）——Task 10 启用手牌抽屉后生效
watch(
  () => props.game.skillTest,
  (st) => {
    handOpen.value = !!st
  },
)

function runMenuItem(action: () => void) {
  menuOpen.value = false
  action()
}
</script>

<template>
  <div class="mobile-play" :class="{ 'mobile-play--question': hasQuestion }">
    <header class="mobile-top-bar">
      <MobilePhaseBar v-if="inPlay" :game="game" class="top-bar-phases" />
      <span v-else class="top-bar-spacer"></span>
      <button type="button" class="top-bar-btn" :aria-label="$t('gameBar.undo')" @click="undoApi.undo()">
        <BackwardIcon aria-hidden="true" />
      </button>
      <button type="button" class="top-bar-btn" :class="{ 'top-bar-btn--attention': hasQuestion }" :aria-label="$t('mobileShell.menu')" @click="menuOpen = true">
        <Bars3Icon aria-hidden="true" />
      </button>
    </header>

    <main class="mobile-main">
      <ActiveGameModals :game="game" :playerId="playerId" :modals="modals" />
      <GameMain
        :game="game"
        :game-id="gameId"
        :player-id="playerId"
        :game-log="gameLog"
        @choose="emit('choose', $event)"
        @update="emit('update', $event)"
      />
    </main>

    <nav class="mobile-nav">
      <button type="button" :class="{ active: !logOpen && !handOpen && !playersOpen }" @click="closeAllDrawers">
        <MapIcon aria-hidden="true" />{{ $t('mobileShell.map') }}
      </button>
      <button type="button" :class="{ active: logOpen }" @click="toggleDrawer('log')">
        <DocumentTextIcon aria-hidden="true" />{{ $t('mobileShell.log') }}
      </button>
    </nav>

    <OverlayDrawer :open="logOpen" side="right" @close="logOpen = false">
      <div class="mobile-log">
        <GameLog :game="game" :gameLog="gameLog" @undo="undoApi.undo" />
      </div>
    </OverlayDrawer>

    <OverlayDrawer :open="menuOpen" side="bottom" @close="menuOpen = false">
      <div class="mobile-menu">
        <button type="button" @click="runMenuItem(() => router.push({ name: 'CampaignLog', params: { gameId } }))">
          <DocumentTextIcon aria-hidden="true" /> {{ $t('gameBar.viewLog') }}
        </button>
        <button v-for="item in menuItems" :key="item.id" type="button" @click="runMenuItem(item.action)">
          <component v-if="item.icon" :is="item.icon" /> {{ item.content }}
        </button>
        <div
          v-if="undoApi.canUndoAction.value || undoApi.canUndoTurn.value || undoApi.canUndoPhase.value || undoApi.canUndoRound.value || undoApi.canUndoScenario.value"
          class="menu-undo-group"
        >
          <span class="menu-section-title">{{ $t('game.undoTo') }}</span>
          <button v-if="undoApi.canUndoAction.value" type="button" @click="runMenuItem(undoApi.undoActionStart)">{{ $t('game.startOfAction') }}</button>
          <button v-if="undoApi.canUndoTurn.value" type="button" @click="runMenuItem(undoApi.undoTurnStart)">{{ $t('game.startOfTurn') }}</button>
          <button v-if="undoApi.canUndoPhase.value" type="button" @click="runMenuItem(undoApi.undoPhaseStart)">{{ $t('game.startOfPhase') }}</button>
          <button v-if="undoApi.canUndoRound.value" type="button" @click="runMenuItem(undoApi.undoRoundStart)">{{ $t('game.startOfRound') }}</button>
          <button v-if="undoApi.canUndoScenario.value" type="button" @click="runMenuItem(() => emit('undoScenario'))">{{ $t('gameBar.restartScenario') }}</button>
        </div>
        <button type="button" @click="runMenuItem(debug.toggle)">{{ $t('gameBar.toggleDebug') }}</button>
        <button type="button" @click="runMenuItem(() => emit('fileBug'))">
          <ExclamationTriangleIcon aria-hidden="true" /> {{ $t('fileBug') }}
        </button>
      </div>
    </OverlayDrawer>
  </div>
</template>

<style lang="scss" scoped>
.mobile-play {
  --mobile-nav-height: 56px;
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
}

.mobile-top-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  padding-top: calc(6px + env(safe-area-inset-top, 0px));
  background: var(--background-mid);
}

.top-bar-phases,
.top-bar-spacer {
  flex: 1;
  min-width: 0;
}

.top-bar-btn {
  flex-shrink: 0;
  width: 44px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--title);

  svg {
    width: 20px;
  }

  &--attention {
    box-shadow: 0 0 0 2px var(--select);
  }
}

.mobile-main {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.mobile-nav {
  display: flex;
  height: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--background-mid);
  border-top: 1px solid rgba(255, 255, 255, 0.08);

  button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 0;
    background: none;
    color: rgba(255, 255, 255, 0.55);
    font-size: 11px;

    svg {
      width: 20px;
    }

    &.active {
      color: var(--select);
    }
  }
}

.mobile-log {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #d0d9dc;

  @media (prefers-color-scheme: dark) {
    background: #1c1c1c;
  }
}

.mobile-menu {
  display: flex;
  flex-direction: column;
  padding: 8px;

  > button,
  .menu-undo-group button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    background: none;
    color: var(--title);
    font-size: 1em;
    text-align: left;

    svg {
      width: 18px;
    }
  }

  .menu-undo-group {
    display: flex;
    flex-direction: column;
    margin-block: 4px;
    border-block: 1px solid rgba(255, 255, 255, 0.1);
  }

  .menu-section-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: rgba(255, 255, 255, 0.5);
    padding: 8px 12px 2px;
  }
}
</style>
```

- [ ] **Step 4: Game.vue 分叉**

1. import 加：
```ts
import MobilePlayLayout from '@/arkham/components/MobilePlayLayout.vue'
```
2. `const { isTouch, size } = useDeviceLayout()` 改为：
```ts
const { isTouch, size, shell } = useDeviceLayout()
const phoneShell = computed(() => shell.value === 'phone')
```
3. `undoApi` 持有整个对象（原解构保留）：
```ts
const undoApi = useGameUndo({ ...原参数不变... })
const {
  undo, undoScenario, undoActionStart, undoTurnStart, undoPhaseStart, undoRoundStart,
  canUndoScenario, canUndoAction, canUndoTurn, canUndoPhase, canUndoRound,
} = undoApi
```
4. 模板 `<GameBar ...>` 加 `v-if="!phoneShell"`（手机不渲染桌面 game-bar）。
5. 模板 `<template v-else>`（非 pending 分支）内，`<CampaignLog v-if="showLog ..."/>` 之后的 `<div v-else class="game-main">` 改为三路：
```vue
<CampaignLog v-if="showLog && game !== null" :game="game" :cards="cards" :playerId="playerId" />
<MobilePlayLayout
  v-else-if="phoneShell"
  :game="game"
  :game-id="gameId"
  :player-id="playerId"
  :game-log="gameLog"
  :modals="modals"
  :undo-api="undoApi"
  @choose="choose"
  @update="socket.setGame"
  @file-bug="openBugReport()"
  @undo-scenario="undoScenarioDialog?.showModal()"
/>
<div v-else class="game-main">
  ……（Task 6 之后的桌面内容原样保留：ActiveGameModals、GameMain、sidebar×2、sidebar-backdrop）
</div>
```
6. `showSidebar` 初始化注释更新：手机走 shell 后 `isMobileViewport()` 分支只对「桌面被缩窄再放大」过渡态有意义，行为保留不动。

- [ ] **Step 5: Scenario.vue 隐藏 .phases（shell 顶条已替代）**

`frontend/src/arkham/components/Scenario.vue`：
1. script 增加（import 区 + `const { isMobile } = IsMobile()` 附近）：
```ts
import { usePhoneShell } from '@/arkham/composables/phoneShell'
const phoneShell = usePhoneShell()
```
2. 模板 2162 行 `<div class="phases">` 改为：
```vue
<div v-if="!phoneShell" class="phases">
```
（桌面注入不存在 → 永远渲染，零回归。）

- [ ] **Step 6: 验证**

Run: `cd frontend && npx vitest run && npm run tc && npm run lint`
Expected: 通过。

手动验证（dev server）：
- **手机视口**（Chrome devtools iPhone 14 Pro，393×852，触屏模拟开）：进行中的对局 → 顶部阶段条高亮当前阶段、撤销按钮可用、汉堡菜单弹出且各项可点（设置/历史/debug/上报 bug/撤销组）；底部导航 地图/日志 切换、日志抽屉右滑入；GameBar 不出现。
- **桌面视口**（≥1200px）：与 Task 6 之后完全一致（GameBar/侧边栏/阶段侧栏都在）。
- 把桌面窗口缩到 ≤800px：切到手机 shell（这是 `size: 'phone'` 的预期行为）。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/arkham/composables/phoneShell.ts frontend/src/arkham/components/MobilePlayLayout.vue frontend/src/arkham/views/Game.vue frontend/src/arkham/components/Scenario.vue frontend/src/arkham/composables/useGameUndo.ts
git commit -m "Add MobilePlayLayout phone shell and fork Game.vue chrome by shell"
```

---

### Task 9: 抽取 usePlayerHand + cardTransitions + PlayerHandCards（Player.vue 去重）

**Files:**
- Create: `frontend/src/arkham/composables/usePlayerHand.ts`
- Test: `frontend/src/arkham/composables/usePlayerHand.spec.ts`
- Create: `frontend/src/arkham/cardTransitions.ts`
- Create: `frontend/src/arkham/components/PlayerHandCards.vue`
- Modify: `frontend/src/arkham/components/Player.vue`

纯重构：桌面手牌区与移动浮层的两份几乎相同的 transition-group 模板合一。**本任务不删移动浮层**（Task 10 做），先让两处都用新组件。

- [ ] **Step 1: 写 usePlayerHand 失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { usePlayerHand } from './usePlayerHand'
import type { Game } from '@/arkham/types/Game'
import type { Investigator } from '@/arkham/types/Investigator'

// 最小假数据：只填 usePlayerHand 实际读取的字段
const card = (id: string, code = 'c1') =>
  ({ tag: 'PlayerCard', contents: { id, cardCode: code } }) as never

function makeGame(over: Record<string, unknown> = {}): Game {
  return {
    skillTest: null,
    modifiers: [],
    enemies: {},
    treacheries: {},
    ...over,
  } as unknown as Game
}

function makeInvestigator(over: Record<string, unknown> = {}): Investigator {
  return {
    id: 'i1',
    hand: [card('a'), card('b')],
    handSize: 8,
    modifiers: [],
    ...over,
  } as unknown as Investigator
}

describe('usePlayerHand', () => {
  it('playerHand 过滤掉已投入技能检定的牌', () => {
    const game = makeGame({
      skillTest: { committedCards: [card('a')] },
    })
    const h = usePlayerHand({ game: () => game, investigator: () => makeInvestigator() })
    expect(h.playerHand.value.map((c) => (c as unknown as { contents: { id: string } }).contents.id)).toEqual(['b'])
  })

  it('inHandEnemies/inHandTreacheries 按 StillInHand/HiddenInHand 归属本调查员', () => {
    const game = makeGame({
      enemies: {
        e1: { id: 'e1', placement: { tag: 'StillInHand', contents: 'i1' } },
        e2: { id: 'e2', placement: { tag: 'AtLocation', contents: 'l1' } },
      },
      treacheries: {
        t1: { id: 't1', placement: { tag: 'HiddenInHand', contents: 'i1' } },
        t2: { id: 't2', placement: { tag: 'HiddenInHand', contents: 'i2' } },
      },
    })
    const h = usePlayerHand({ game: () => game, investigator: () => makeInvestigator() })
    expect(h.inHandEnemies.value.map((e) => e.id)).toEqual(['e1'])
    expect(h.inHandTreacheries.value.map((t) => t.id)).toEqual(['t1'])
  })

  it('totalHandSize 计入在手敌人/诡计；handSizeClasses 按上限分级', () => {
    const game = makeGame({
      enemies: { e1: { id: 'e1', cardId: 'ec1', placement: { tag: 'StillInHand', contents: 'i1' } } },
    })
    const h = usePlayerHand({
      game: () => game,
      investigator: () => makeInvestigator({ handSize: 3 }),
    })
    expect(h.totalHandSize.value).toBe(3) // 2 手牌 + 1 在手敌人
    expect(h.handSizeClasses.value['hand-size-warn']).toBe(true)
  })
})
```

Run: `cd frontend && npx vitest run src/arkham/composables/usePlayerHand.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 2: 写 usePlayerHand**

从 `Player.vue` **原样搬移**以下 computed（保持逻辑零改动）：`committedIdSet`、`playerHand`、`inHandEnemies`（91-93 行）、`inHandTreacheries`（153-154 行）、`totalHandSize`（156-190 行）、`actualHandSize`、`handSizeClasses`：

```ts
import { computed } from 'vue'
import * as CardT from '@/arkham/types/Card'
import { toCardContents } from '@/arkham/types/Card'
import type { Game } from '@/arkham/types/Game'
import type { Investigator } from '@/arkham/types/Investigator'
import type { Modifier } from '@/arkham/types/Modifier'

// 手牌相关派生状态（Player.vue 桌面区 / 手机 shell 手牌抽屉共用）
export function usePlayerHand(opts: { game: () => Game; investigator: () => Investigator }) {
  const investigatorId = computed(() => opts.investigator().id)

  const committedIdSet = computed(
    () => new Set((opts.game().skillTest?.committedCards ?? []).map((c) => toCardContents(c).id)),
  )

  const playerHand = computed(() =>
    opts.investigator().hand.filter((card) => !committedIdSet.value.has(toCardContents(card).id)),
  )

  const inHandEnemies = computed(() =>
    Object.values(opts.game().enemies).filter(
      (e) =>
        (e.placement.tag === 'StillInHand' || e.placement.tag === 'HiddenInHand') &&
        e.placement.contents === investigatorId.value,
    ),
  )

  const inHandTreacheries = computed(() =>
    Object.values(opts.game().treacheries).filter(
      (t) => t.placement.tag === 'HiddenInHand' && t.placement.contents === investigatorId.value,
    ),
  )

  const totalHandSize = computed(() => {
    // …… Player.vue 156-190 行原样搬入，props.game→opts.game()、props.investigator→opts.investigator()、
    // playerHand/inHandTreacheries/inHandEnemies 引用本文件内的 computed ……
  })

  const actualHandSize = computed(
    () => playerHand.value.length + inHandTreacheries.value.length + inHandEnemies.value.length,
  )

  const handSizeClasses = computed(() => ({
    'hand-size-ok': (opts.investigator().handSize ?? 8) > totalHandSize.value,
    'hand-size-warn': (opts.investigator().handSize ?? 8) == totalHandSize.value,
    'hand-size-alert': (opts.investigator().handSize ?? 8) < totalHandSize.value,
  }))

  return { playerHand, inHandEnemies, inHandTreacheries, totalHandSize, actualHandSize, handSizeClasses }
}
```

Run: `npx vitest run src/arkham/composables/usePlayerHand.spec.ts` → 3 passed。

- [ ] **Step 3: 抽 cardTransitions 工厂**

`frontend/src/arkham/cardTransitions.ts`——把 Player.vue 的 `rectMap`/`isHtmlElement`/`onBeforeEnter`/`onEnter`/`onLeave`（245-303 行）原样搬成工厂（每个 transition-group 一份独立 rectMap）：

```ts
import gsap from 'gsap'

// gsap 卡牌进出场动画钩子。每个 transition-group 调一次工厂，rectMap 互不串扰。
export function createCardTransitionHooks() {
  const rectMap = new Map<string, DOMRect>()

  function isHtmlElement(el: Element): el is HTMLElement {
    return el instanceof HTMLElement
  }

  function onBeforeEnter(el: Element) { /* Player.vue 249-256 原样 */ }
  function onEnter(el: Element, done: () => void) { /* Player.vue 258-294 原样 */ }
  function onLeave(el: Element, done: () => void) { /* Player.vue 296-303 原样 */ }

  return { onBeforeEnter, onEnter, onLeave }
}
```

- [ ] **Step 4: 写 PlayerHandCards**

合并 Player.vue 566-612（桌面）与 626-670（移动）两段 transition-group。两段差异点：移动版给 `Treachery` 传 `:isInHand="true"`、给 transition-group 绑 pointerEvents 样式（由调用方 style 透传，不进组件）。

```vue
<script lang="ts" setup>
import { computed, inject, type Ref } from 'vue'
import type { Game } from '@/arkham/types/Game'
import type { Investigator } from '@/arkham/types/Investigator'
import type { CardContents } from '@/arkham/types/Card'
import * as CardT from '@/arkham/types/Card'
import { toCardContents } from '@/arkham/types/Card'
import { imgsrc } from '@/arkham/helpers'
import { useDebug } from '@/arkham/debug'
import HandCard from '@/arkham/components/HandCard.vue'
import EnemyView from '@/arkham/components/Enemy.vue'
import Treachery from '@/arkham/components/Treachery.vue'
import { usePlayerHand } from '@/arkham/composables/usePlayerHand'
import { createCardTransitionHooks } from '@/arkham/cardTransitions'
import type { Enemy } from '@/arkham/types/Enemy'

const props = withDefaults(
  defineProps<{
    game: Game
    playerId: string
    investigator: Investigator
    treacheryInHand?: boolean
  }>(),
  { treacheryInHand: false },
)
const emit = defineEmits<{ choose: [number] }>()

const debug = useDebug()
const solo = inject<Ref<boolean>>('solo')
const showOtherPlayersHands = inject<Ref<boolean>>('showOtherPlayersHands')

const { playerHand, inHandEnemies, inHandTreacheries } = usePlayerHand({
  game: () => props.game,
  investigator: () => props.investigator,
})

const { onBeforeEnter, onEnter, onLeave } = createCardTransitionHooks()

const ENCOUNTER_BACK = imgsrc('encounter_back.jpg')
const PLAYER_BACK = imgsrc('player_back.jpg')

function backForEnemy(enemy: Enemy) {
  const card = props.game.cards[enemy.cardId]
  if (!card) return ENCOUNTER_BACK
  if (card.tag === 'PlayerCard') return PLAYER_BACK
  return ENCOUNTER_BACK
}

const id = computed(() => props.investigator.id)

/* dragover/onDropHand/startHandDrag：Player.vue 307-337 原样搬入（debug 拖拽） */
</script>

<template>
  <transition-group
    tag="section"
    class="hand"
    @enter="onEnter"
    @leave="onLeave"
    @before-enter="onBeforeEnter"
    @drop="onDropHand($event)"
    @dragover.prevent="dragover($event)"
    @dragenter.prevent
  >
    <HandCard
      v-for="card in playerHand"
      :card="card"
      :game="game"
      :playerId="playerId"
      :ownerId="investigator.id"
      :key="toCardContents(card).id"
      @choose="emit('choose', $event)"
      :draggable="debug.active"
      @dragstart="startHandDrag($event, card)"
    />

    <template v-for="enemy in inHandEnemies" :key="enemy.id">
      <EnemyView
        v-if="solo || showOtherPlayersHands || playerId == investigator.playerId"
        :enemy="enemy"
        :game="game"
        :data-index="enemy.cardId"
        :playerId="playerId"
        @choose="emit('choose', $event)"
      />
      <div class="card-container" v-else>
        <img class="card" :src="backForEnemy(enemy)" />
      </div>
    </template>

    <template v-for="treachery in inHandTreacheries" :key="treachery.id">
      <Treachery
        v-if="solo || showOtherPlayersHands || playerId == investigator.playerId"
        :treachery="treachery"
        :data-index="treachery.cardId"
        :game="game"
        :playerId="playerId"
        :isInHand="treacheryInHand || undefined"
        @choose="emit('choose', $event)"
      />
      <div class="card-container" v-else>
        <img class="card" :src="ENCOUNTER_BACK" />
      </div>
    </template>
  </transition-group>
</template>

<style scoped>
.hand {
  flex: 0;
  display: flex;
  gap: 5px;
  overflow-x: auto;
}

/* 过渡类作用在组内元素上，必须随 transition-group 迁入本组件 */
.hand-move,
.hand-enter-active,
.hand-leave-active {
  transition: all 0.3s ease;
}

.hand-enter-from,
.hand-leave-to {
  opacity: 0;
  transform: translateY(-40px);
}

.hand-leave-active {
  position: absolute;
}

.card {
  width: var(--card-width);
  min-width: var(--card-width);
  border-radius: 2px;
}
</style>
```

实现时核对 `Treachery.vue` 的 `isInHand` 默认值：若 `withDefaults` 默认 `false`，传 `treacheryInHand`（布尔）即可，不需要 `|| undefined`。

- [ ] **Step 5: Player.vue 两处替换**

1. 桌面区（566-614 行）：transition-group 整段换成
```vue
<div v-if="!isMobile" class="hand hand-area">
  <PlayerHandCards
    :game="game"
    :playerId="playerId"
    :investigator="investigator"
    @choose="$emit('choose', $event)"
  />
  <div v-if="investigator.handSize" class="hand-size" :class="handSizeClasses" :current-length="totalHandSize">{{ t('handSize') }}: {{totalHandSize}}/{{investigator.handSize}}</div>
</div>
```
2. 移动浮层（616-671 行）：内部 transition-group 换成
```vue
<PlayerHandCards
  :style="{ pointerEvents: `${handAreaPointerEvents}`, flex: '1' }"
  :game="game"
  :playerId="playerId"
  :investigator="investigator"
  treachery-in-hand
  @choose="$emit('choose', $event)"
/>
```
（外层 `hand-area-IsMobile` div、关闭按钮、开合逻辑保留——Task 10 再删。）
3. script 清理：`usePlayerHand` 引入替代本地 `committedIdSet/playerHand/inHandEnemies/inHandTreacheries/totalHandSize/actualHandSize/handSizeClasses`（`totalHandSize/actualHandSize/handSizeClasses` 仍被 hand-size div 和 CSS `v-bind(actualHandSize)` 使用，从 composable 解构）；`in-play` 的 transition-group 改用 `createCardTransitionHooks()` 返回的钩子；删除不再使用的 `gsap` import、`rectMap`、动画函数、`backForEnemy`、`ENCOUNTER_BACK/PLAYER_BACK`（若 in-play 区还在用 `backForEnemy` 则保留——检索确认）、拖拽函数中已迁走的部分（`onDrop` 给 in-play 用，保留；`onDropHand`/`startHandDrag`/`dragover` 若 in-play 的 `@dragover` 还在用 `dragover` 则保留该函数）。
4. `totalHandSize` 里 hunchDeck 无关；`noCards/showCards` 等不动。

- [ ] **Step 6: 验证**

Run: `cd frontend && npx vitest run && npm run tc && npm run lint`
Expected: 通过。
手动桌面回归：手牌增减动画正常（抽牌/打牌）、技能检定投入牌从手牌消失、手牌数标签颜色分级正常、debug 模式拖牌进出手牌正常；≤800px 视口（手机 shell 下 Player 在 GameMain 内仍渲染移动浮层）开合正常。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/arkham/composables/usePlayerHand.ts frontend/src/arkham/composables/usePlayerHand.spec.ts frontend/src/arkham/cardTransitions.ts frontend/src/arkham/components/PlayerHandCards.vue frontend/src/arkham/components/Player.vue
git commit -m "Extract PlayerHandCards and usePlayerHand to dedupe hand rendering"
```

---

### Task 10: 手牌抽屉（shell 收编 Player.vue 移动浮层）

**Files:**
- Modify: `frontend/src/arkham/components/MobilePlayLayout.vue`（手牌 tab + 抽屉）
- Modify: `frontend/src/arkham/components/Player.vue`（删除移动浮层与开合机器）

- [ ] **Step 1: MobilePlayLayout 加手牌抽屉**

1. script 增加：
```ts
import { inject } from 'vue' // 并入现有 vue import
import { HandRaisedIcon } from '@heroicons/vue/20/solid' // 并入现有 heroicons import
import { gameIndexesKey } from '@/arkham/composables/provideGameContext'
import PlayerHandCards from '@/arkham/components/PlayerHandCards.vue'
import Draw from '@/arkham/components/Draw.vue'

const gameIndexes = inject(gameIndexesKey)!
const ownInvestigator = computed(() => gameIndexes.value.investigatorByPlayerId.get(props.playerId) ?? null)
```
（核对 `provideGameContext.ts` 中 key 的实际导出名与 GameIndexes 字段名后引用。）

2. 模板 nav 中「日志」按钮**之前**插入：
```vue
<button v-if="ownInvestigator" type="button" :class="{ active: handOpen }" @click="toggleDrawer('hand')">
  <HandRaisedIcon aria-hidden="true" />{{ $t('mobileShell.hand') }}
</button>
```

3. 模板加抽屉（与日志抽屉并列）：
```vue
<OverlayDrawer v-if="ownInvestigator" :open="handOpen" keep-mounted side="bottom" @close="handOpen = false">
  <div class="mobile-hand">
    <Draw :game="game" :playerId="playerId" :investigator="ownInvestigator" @choose="emit('choose', $event)" />
    <PlayerHandCards
      class="mobile-hand-cards"
      :game="game"
      :playerId="playerId"
      :investigator="ownInvestigator"
      treachery-in-hand
      @choose="emit('choose', $event)"
    />
  </div>
</OverlayDrawer>
```
style 追加：
```scss
.mobile-hand {
  display: flex;
  gap: 8px;
  padding: 10px;
  align-items: flex-start;

  .mobile-hand-cards {
    flex: 1;
    min-width: 0;
    /* 手牌在抽屉里放大便于触控（对齐原浮层 4 倍卡宽的意图，按实际观感调整倍数） */
    :deep(.card) {
      width: calc(var(--card-width) * 3);
      min-width: calc(var(--card-width) * 3);
    }
  }
}
```

（Task 8 已写好的 `watch(() => props.game.skillTest, ...)` 此时自然生效：检定开始自动开手牌抽屉，结束自动收。与原浮层的差异：不再联动 `isMinimized_SkillTest`——该状态 provide 在 Scenario 深处，shell 拿不到；先接受，真机体验后再说。）

- [ ] **Step 2: Player.vue 删除移动浮层**

手机宽度（`isMobile` ⇔ `size==='phone'` ⇔ 手机 shell）下手牌已由 shell 抽屉接管，浮层成死代码：

1. 模板：删除整个 `<div v-if="isMobile" class="hand hand-area-IsMobile" ...>...</div>` 块（含关闭按钮与 PlayerHandCards 调用）。
2. script：删除 `handCardHeight/handCardExposedHeight_MIN/handCardExposedHeight_MAX/handAreaMarginBottom/handAreaPointerEvents`（354-358 行）、`onMounted`/`onBeforeUnmount` 中 isMobile 相关监听（360-383 行）、`toggleHandAreaMarginBottom`/`closeHand`（385-400 行）、`XMarkIcon` import。
3. 保留 `isMobile`（仍控制 `Draw v-if="!isMobile"` 与桌面手牌区 `v-if="!isMobile"`——手机下两者都不在 Player 内渲染，由 shell 提供）。
4. CSS：删除 `.hand-area-IsMobile`、`.hand-close-button` 两段。

- [ ] **Step 3: 验证**

Run: `cd frontend && npx vitest run && npm run tc && npm run lint`
Expected: 通过。
手动手机视口：底部导航出现「手牌」tab → 抽屉滑出，能看牌、tap 牌走两步确认（CardActionSheet 叠在抽屉上方）、打出后抽屉内列表动画更新；触发技能检定自动弹手牌；桌面视口手牌区不变。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/arkham/components/MobilePlayLayout.vue frontend/src/arkham/components/Player.vue
git commit -m "Move phone hand into shell drawer and drop Player.vue mobile hand float"
```

---

### Task 11: Question 停靠（ChoiceModal docked 模式）

**Files:**
- Modify: `frontend/src/arkham/components/ChoiceModal.vue`（加 docked prop）
- Modify: `frontend/src/arkham/components/Player.vue`（手机 shell 下抑制自身 ChoiceModal）
- Modify: `frontend/src/arkham/components/MobilePlayLayout.vue`（渲染停靠版）

**必须在 Task 12 之前完成**（角色抽屉收走 player-zone 后，Player 内的 ChoiceModal 会被藏进抽屉）。

- [ ] **Step 1: ChoiceModal 加 docked 模式**

1. Props 接口与 withDefaults：
```ts
export interface Props {
  game: Game
  playerId: string
  noStory?: boolean
  docked?: boolean
}

const props = withDefaults(defineProps<Props>(), { noStory: false, docked: false })
```
2. 模板替换为：
```vue
<template>
  <template v-if="requiresModal">
    <div v-if="docked" class="choice-dock">
      <h1 class="choice-dock-title" v-html="label(title)"></h1>
      <div class="choice-modal-wrapper">
        <p class="body" v-if="body" v-html="label(body)"></p>
        <Question v-if="question" :game="game" :playerId="playerId" @choose="choose" />
      </div>
    </div>
    <Draggable v-else>
      <template #handle><h1 v-html="label(title)"></h1></template>
      <div class="choice-modal-wrapper">
        <p class="body" v-if="body" v-html="label(body)"></p>
        <Question v-if="question" :game="game" :playerId="playerId" @choose="choose" />
      </div>
    </Draggable>
  </template>
</template>
```
3. style 追加（scoped）：
```css
/* 手机 shell：停靠在底部导航上方，不遮地图（spec §4） */
.choice-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--mobile-nav-height, 56px) + env(safe-area-inset-bottom, 0px));
  z-index: 5000;
  max-height: 45dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: rgba(0, 0, 0, 0.85);
  padding: 10px;
  padding-top: 6px;
}

.choice-dock-title {
  font-size: 1.1em;
  margin: 0 0 6px;
  color: var(--title);
}
```

- [ ] **Step 2: Player.vue 抑制 + MobilePlayLayout 渲染停靠版**

Player.vue：
```ts
import { usePhoneShell } from '@/arkham/composables/phoneShell'
const phoneShell = usePhoneShell()
```
模板 519 行：
```vue
<ChoiceModal
  v-if="playerId === investigator.playerId && !phoneShell"
  :game="game"
  :playerId="playerId"
  @choose="$emit('choose', $event)"
/>
```

MobilePlayLayout：import `ChoiceModal`，模板（`</nav>` 之后、抽屉之前）加：
```vue
<ChoiceModal docked :game="game" :playerId="playerId" @choose="emit('choose', $event)" />
```

- [ ] **Step 3: 验证**

Run: `cd frontend && npx vitest run && npm run tc && npm run lint`
Expected: 通过。
手动手机视口：触发一个模态型选择（如回合开始的 QuestionLabel、搜索牌堆选卡）→ 面板停靠在底部导航上方、可滚动、可选择；顶部汉堡按钮出现高亮描边（待办指示）；技能检定中不弹（requiresModal=false 路径不变）。桌面视口：ChoiceModal 仍是可拖拽浮窗。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/arkham/components/ChoiceModal.vue frontend/src/arkham/components/Player.vue frontend/src/arkham/components/MobilePlayLayout.vue
git commit -m "Dock ChoiceModal above mobile nav in phone shell"
```

---

### Task 12: 角色抽屉（player-zone 收进 OverlayDrawer）+ 导航终态

**Files:**
- Modify: `frontend/src/arkham/components/Scenario.vue`（player-zone 包进 OverlayDrawer inline 透传）
- Modify: `frontend/src/arkham/components/MobilePlayLayout.vue`（角色 tab；导航终态 地图/手牌/角色/日志）

- [ ] **Step 1: Scenario.vue 包裹 player-zone**

1. import：
```ts
import OverlayDrawer from '@/components/OverlayDrawer.vue'
```
（`usePhoneShell` Task 8 已引入。）
2. 模板 2120 行起，将 `<div id="player-zone">...</div>` 整块包裹：
```vue
<OverlayDrawer
  :inline="!phoneShell"
  :open="!!phoneShell?.playersOpen.value"
  keep-mounted
  side="bottom"
  @close="phoneShell && (phoneShell.playersOpen.value = false)"
>
  <div id="player-zone">
    ……原内容完全不动（PlayerTabs + zoom-control slot + #totals）……
  </div>
</OverlayDrawer>
```
桌面 `inline` ⇒ 原地渲染、零变化；手机 ⇒ keepMounted 抽屉（PlayerTabs 选中页、内部状态常驻）。
3. style 追加（scoped 作用不到 teleport 内容，用 :global 或在 OverlayDrawer slot 内层加类；推荐后者——给 `#player-zone` 增加手机内联样式）：
```css
/* 手机抽屉内：player-zone 纵排、占满抽屉宽度 */
:global(.overlay-drawer #player-zone) {
  flex-direction: column;
  max-height: 80dvh;
}
```

- [ ] **Step 2: MobilePlayLayout 导航终态**

1. heroicons import 加 `UserGroupIcon`。
2. nav 在「手牌」与「日志」之间插入：
```vue
<button type="button" :class="{ active: playersOpen }" @click="toggleDrawer('players')">
  <UserGroupIcon aria-hidden="true" />{{ $t('mobileShell.players') }}
</button>
```
终态四 tab：地图 / 手牌 / 角色 / 日志（撤销已在顶部条 + 汉堡组，spec §4 达成）。

- [ ] **Step 3: 验证**

Run: `cd frontend && npx vitest run && npm run tc && npm run lint`
Expected: 通过。
手动手机视口：地图终于全屏（player-zone 不再常驻底部）；「角色」tab 弹出玩家区抽屉（PlayerTabs 可切人、in-play 区可滚、资源/生命池可点、关闭再开选中页保持）；多人局切 tab 看其他玩家区；「手牌」「日志」互斥开关正常；选择停靠面板仍在导航上方。桌面视口 diff 应为零（inline 透传）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/arkham/components/Scenario.vue frontend/src/arkham/components/MobilePlayLayout.vue
git commit -m "Move player zone into phone shell drawer and finalize mobile nav tabs"
```

---

### Task 13: 全量验证与收尾

**Files:** 无新增（按验证结果修补）。

- [ ] **Step 1: 自动化全量**

```bash
cd frontend && npx vitest run && npm run tc && npm run lint && npm run build
```
Expected: 全绿、build 成功。

- [ ] **Step 2: Playwright 手机全流程**

dev server（`npm run dev`，:8080）+ Playwright MCP：
1. viewport 393×852（iPhone 14 Pro）+ 触屏模拟，进一局进行中的对局。
2. 检查清单：顶部阶段条高亮正确 → 汉堡菜单全项可点 → 撤销按钮生效（走一步棋再撤销）→ 手牌抽屉开/打牌两步确认 → 角色抽屉切人 → 日志抽屉滚动 → 模态选择停靠在导航上方 → 揭示卡/塔罗模态正常 → game-bar 不可见 → 无横向滚动溢出。
3. 截图存档对比。

- [ ] **Step 3: 桌面回归（硬约束）**

viewport 1440×900：开局 → 调查 → 战斗 → 过回合 → 撤销（U+A/T/P/R 和弦）→ 侧边栏开合 → 设置/历史/快捷键弹窗 → 揭示卡模态。所有行为与 `zh` 分支基线一致。

- [ ] **Step 4: 真机验证（用户）**

iPhone Safari 实测：safe-area（刘海/home bar）不遮挡、抽屉手势流畅、两步 tap 正常。已知既有问题：真机双指缩放失灵（usePinchZoom 真机 bug，非本期范围）。

- [ ] **Step 5: merge 回 zh**

```bash
git checkout zh && git merge mobile-phase4-shell
```
（用户确认真机体验后执行；plan/spec 文档不提交——见记忆「Arkham 只提交代码」。）

---

## 后续 backlog（本期不做，记录避免丢失）

- `#totals`（总 doom/线索）随角色抽屉隐藏 → 考虑挪到顶部条
- 手牌抽屉与 `isMinimized_SkillTest` 联动（原浮层行为差异）
- MobilePhaseBar 显示子步骤（触屏 tooltip 替代方案）
- Game.vue 桌面 sidebar 的 ≤800px 抽屉 CSS 已成死代码（campaign 无 scenario 分支除外），随既有问题清单清理 commit 处理
- 既有问题清单（见记忆 mobile-adaptation-progress）单独清理 commit
