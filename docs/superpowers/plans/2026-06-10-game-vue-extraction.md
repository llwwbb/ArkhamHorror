# Game.vue 抽取（移动端适配 Phase 3）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 2898 行的 `Game.vue` 拆成 composable + 独立模态组件，行为零变化，为手机 shell（Phase 4）铺路。

**Architecture:** 逻辑层拆 5 个 composable（socket / modals / undo / keyboard / provides），UI 层拆 7 个组件（3 个揭示类模态、bug 表单、快捷键面板、playability 调试模态、game-bar）。耦合枢纽是 `uiLock`：`useGameModals` 持有锁，`useGameSocket` 见锁排队、watch 锁释放后排空队列——逐字保留现有时序。`Game.vue` 保留路由级职责：布局编排、sidebar、tap 拦截、flashlight、Settings/History 开关。

**Tech Stack:** Vue 3 `<script setup>` + TS、vitest（jsdom）、Prettier/ESLint。spec：`docs/superpowers/specs/2026-06-10-mobile-friendly-design.md` §3。

**硬约束：**
- 桌面零回归。每个 Task 独立可提交，提交前必须过 `npm run tc && npx vitest run`（在 `frontend/`）。
- 所有搬移逐字保留原逻辑（包括看似可疑的代码，如 `gameCardDecoder.decodePromise(result as any)` 解码整个 result 对象、永远为 false 的 `showLog`、未被引用的 `#invite` 样式）。重构不顺带修 bug、不顺带删死代码。
- 提交只含 `frontend/` 代码；`docs/superpowers/` 一律不提交（个人约定）。
- 提交前确认 `git config user.email` 是 `llwwbb7@gmail.com`。
- 提交信息用英文句式（仓库风格，如 "Extract useGameSocket from Game.vue"），结尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

**命名对照（新 API ↔ Game.vue 原变量）：**

| 新位置 | 原 Game.vue |
|---|---|
| `modals.uiLock` | `uiLock` |
| `modals.gameCard` / `tarotCards` / `showTheSilenceModal` | 同名 ref |
| `modals.continueUI()` / `resetForUndo()` | `continueUI()` / undo 里清 modal 的三行 |
| `socket.game` / `gameLog` / `playerId` / `ready` / `solo` / `error` / `socketError` / `processing` | 同名 ref |
| `socket.choose/chooseDeck/chooseDeckList/choosePaymentAmounts/chooseAmounts` | 同名函数 |
| `socket.setGame` | `update()` |
| `socket.clearResultQueue()` | `resultQueue.value = []` |
| `undoCtl.undo/undoScenario/undoActionStart/...` + `canUndo*` | 同名 |
| `keyboard.undoChordArmed` | `undoChordArmed` |

---

### Task 1: 抽出图片预加载 `gameImagePreload.ts`

**Files:**
- Create: `frontend/src/arkham/gameImagePreload.ts`
- Test: `frontend/src/arkham/gameImagePreload.spec.ts`
- Modify: `frontend/src/arkham/views/Game.vue`（删除 `preloaded`/`loadAllImages`/`preloadImages`）

- [ ] **Step 1: 写失败测试**

`frontend/src/arkham/gameImagePreload.spec.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAllGameImages, _resetForTests } from './gameImagePreload'
import type { Game } from '@/arkham/types/Game'

vi.mock('@/arkham/helpers', () => ({
  imgsrc: (path: string) => `/img/${path}`,
}))

vi.mock('@/arkham/types/Card', () => ({
  toCardContents: (card: { cardCode: string; isFlipped: boolean }) => card,
}))

// 可控的 Image 替身：记录加载过的 src，手动触发 onload/onerror
class FakeImage {
  static created: FakeImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  constructor() {
    FakeImage.created.push(this)
  }
  set src(value: string) {
    this._src = value
    queueMicrotask(() => this.onload?.())
  }
  get src() {
    return this._src
  }
}

function fakeGame(cards: Record<string, { cardCode: string; isFlipped: boolean }>): Game {
  return { cards } as unknown as Game
}

describe('loadAllGameImages', () => {
  beforeEach(() => {
    FakeImage.created = []
    vi.stubGlobal('Image', FakeImage)
    _resetForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('为每张未加载过的卡创建一次 Image，并按 cardCode 去 c 前缀拼 url', async () => {
    await loadAllGameImages(fakeGame({ a: { cardCode: 'c01001', isFlipped: false } }))
    expect(FakeImage.created.map((i) => i.src)).toEqual(['/img/cards/01001.avif'])
  })

  it('isFlipped 的卡加 b 后缀', async () => {
    await loadAllGameImages(fakeGame({ a: { cardCode: 'c01001', isFlipped: true } }))
    expect(FakeImage.created.map((i) => i.src)).toEqual(['/img/cards/01001b.avif'])
  })

  it('加载过的 url 不重复加载（跨调用去重）', async () => {
    await loadAllGameImages(fakeGame({ a: { cardCode: 'c01001', isFlipped: false } }))
    await loadAllGameImages(fakeGame({ a: { cardCode: 'c01001', isFlipped: false } }))
    expect(FakeImage.created).toHaveLength(1)
  })

  it('onerror 也标记为已加载（不无限重试），且 promise reject', async () => {
    class ErrorImage extends FakeImage {
      set src(value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', ErrorImage)
    await expect(
      loadAllGameImages(fakeGame({ a: { cardCode: 'c01001', isFlipped: false } })),
    ).rejects.toBeTruthy()
    vi.stubGlobal('Image', FakeImage)
    await loadAllGameImages(fakeGame({ a: { cardCode: 'c01001', isFlipped: false } }))
    expect(FakeImage.created).toHaveLength(0) // 错误的也进了 preloaded 集合
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd frontend && npx vitest run src/arkham/gameImagePreload.spec.ts
```
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 `gameImagePreload.ts`**

把 Game.vue 中 `const preloaded = new Set<string>()`、`loadAllImages`、`preloadImages` 三段逐字搬过来，仅改名导出：

```ts
import { imgsrc } from '@/arkham/helpers'
import { toCardContents } from '@/arkham/types/Card'
import type { Game } from '@/arkham/types/Game'

const preloaded = new Set<string>()

export async function loadAllGameImages(game: Game): Promise<void> {
  const pending: string[] = []
  for (const card of Object.values(game.cards)) {
    const { cardCode, isFlipped } = toCardContents(card)
    const url = imgsrc(`cards/${cardCode.replace(/^c/, '')}${isFlipped ? 'b' : ''}.avif`)
    if (!preloaded.has(url)) pending.push(url)
  }
  if (pending.length === 0) return

  await Promise.all(
    pending.map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            preloaded.add(url)
            resolve()
          }
          img.onerror = () => {
            preloaded.add(url)
            reject(`Could not load ${url}`)
          }
          img.src = url
        }),
    ),
  )
}

export function preloadGameImages(game: Game): void {
  void loadAllGameImages(game).catch((e: unknown) => {
    console.error(e)
  })
}

export function _resetForTests(): void {
  preloaded.clear()
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/arkham/gameImagePreload.spec.ts
```
预期：4 个用例 PASS。

- [ ] **Step 5: 接入 Game.vue**

- 删除 Game.vue 里的 `const preloaded = new Set<string>()`、`function preloadImages(...)`、`async function loadAllImages(...)` 三段。
- 顶部加 `import { loadAllGameImages, preloadGameImages } from '@/arkham/gameImagePreload'`。
- `watch(() => props.gameId, ...)` 里的 `await loadAllImages(newGame)` 改为 `await loadAllGameImages(newGame)`。
- `scheduleApplyUpdate` 里的 `preloadImages(updatedGame)` 改为 `preloadGameImages(updatedGame)`。

- [ ] **Step 6: 全量验证**

```bash
npm run tc && npx vitest run
```
预期：均 PASS。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/arkham/gameImagePreload.ts frontend/src/arkham/gameImagePreload.spec.ts frontend/src/arkham/views/Game.vue
git commit -m "Extract game image preloading from Game.vue"
```

---

### Task 2: 抽出 `useGameModals`

**Files:**
- Create: `frontend/src/arkham/composables/useGameModals.ts`
- Test: `frontend/src/arkham/composables/useGameModals.spec.ts`
- Modify: `frontend/src/arkham/views/Game.vue`

**设计**：composable 持有 `uiLock` 与三类揭示状态；`show*` 方法封装「上锁 + 解码 + 解码失败回滚锁」；排队判断（`if (uiLock) qPush`）**不在**这里——留给调用方（现在是 Game.vue 的 handleResult，Task 4 后是 useGameSocket）。

- [ ] **Step 1: 写失败测试**

`frontend/src/arkham/composables/useGameModals.spec.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import * as JsonDecoder from 'ts.data.json'
import { useGameModals } from './useGameModals'

// cardDecoder 解码真实卡牌结构太重，替换成透传
vi.mock('@/arkham/types/Card', () => ({
  cardDecoder: JsonDecoder.succeed(),
}))

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('useGameModals', () => {
  it('showGameCard：立即上锁，解码完成后填入 gameCard', async () => {
    const m = useGameModals()
    m.showGameCard({ title: 'Revealed', card: { tag: 'PlayerCard' } })
    expect(m.uiLock.value).toBe(true)
    await flush()
    expect(m.gameCard.value?.title).toBe('Revealed')
  })

  it('showGameCard：解码失败回滚锁', async () => {
    const m = useGameModals()
    m.showGameCard({ notTitle: true })
    expect(m.uiLock.value).toBe(true)
    await flush()
    expect(m.uiLock.value).toBe(false)
    expect(m.gameCard.value).toBeNull()
  })

  it('showGameCardOnly：不是给我的卡，解锁且不展示', async () => {
    const m = useGameModals()
    m.showGameCardOnly({ player: 'p2', title: 'X', card: {} }, (p) => p === 'p1')
    await flush()
    expect(m.uiLock.value).toBe(false)
    expect(m.gameCard.value).toBeNull()
  })

  it('showGameCardOnly：是给我的卡则展示', async () => {
    const m = useGameModals()
    m.showGameCardOnly({ player: 'p1', title: 'X', card: {} }, (p) => p === 'p1')
    await flush()
    expect(m.uiLock.value).toBe(true)
    expect(m.gameCard.value?.title).toBe('X')
  })

  it('showSilence：清卡牌悬浮层、弹 Silence、上锁', () => {
    const dispatched: string[] = []
    const spy = vi
      .spyOn(document, 'dispatchEvent')
      .mockImplementation((e: Event) => (dispatched.push(e.type), true))
    const m = useGameModals()
    m.showSilence()
    expect(dispatched).toContain('arkham:clear-card-overlay')
    expect(m.showTheSilenceModal.value).toBe(true)
    expect(m.uiLock.value).toBe(true)
    spy.mockRestore()
  })

  it('showTarot：解码塔罗数组', async () => {
    const m = useGameModals()
    m.showTarot([{ arcana: 'TheFool', facing: 'Upright' }] as unknown as string)
    expect(m.uiLock.value).toBe(true)
    await flush()
    expect(m.tarotCards.value).toHaveLength(1)
  })

  it('continueUI 清空全部并解锁；resetForUndo 不动 showTheSilenceModal', async () => {
    const m = useGameModals()
    m.showSilence()
    m.continueUI()
    expect(m.uiLock.value).toBe(false)
    expect(m.showTheSilenceModal.value).toBe(false)
    m.showSilence()
    m.resetForUndo()
    expect(m.uiLock.value).toBe(false)
    expect(m.gameCard.value).toBeNull()
    expect(m.tarotCards.value).toEqual([])
  })
})
```

注：`showTarot` 用例中塔罗解码走真实 `tarotCardDecoder`，若其字段与示例不符，按 `frontend/src/arkham/types/TarotCard.ts` 的实际字段改测试数据（不要改实现）。

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/arkham/composables/useGameModals.spec.ts
```
预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 `useGameModals.ts`**

```ts
import { ref } from 'vue'
import * as JsonDecoder from 'ts.data.json'
import { Card, cardDecoder } from '@/arkham/types/Card'
import { TarotCard, tarotCardDecoder } from '@/arkham/types/TarotCard'

export interface GameCard {
  title: string
  card: Card
}

export interface GameCardOnly {
  player: string
  title: string
  card: Card
}

const gameCardDecoder = JsonDecoder.object<GameCard>(
  {
    title: JsonDecoder.string(),
    card: cardDecoder,
  },
  'GameCard',
)

const gameCardOnlyDecoder = JsonDecoder.object<GameCardOnly>(
  {
    player: JsonDecoder.string(),
    title: JsonDecoder.string(),
    card: cardDecoder,
  },
  'GameCard',
)

// uiLock 协议：show* 立即上锁（异步解码期间挡住后续 UI 结果），解码失败回滚；
// 排队（锁住时 qPush）由调用方负责，见 useGameSocket.handleResult。
export function useGameModals() {
  const uiLock = ref(false)
  const gameCard = ref<GameCard | GameCardOnly | null>(null)
  const tarotCards = ref<TarotCard[]>([])
  const showTheSilenceModal = ref(false)

  function showSilence() {
    document.dispatchEvent(new CustomEvent('arkham:clear-card-overlay'))
    showTheSilenceModal.value = true
    uiLock.value = true
  }

  function showGameCard(result: unknown) {
    uiLock.value = true
    gameCardDecoder
      .decodePromise(result as any)
      .then((r) => {
        gameCard.value = r
      })
      .catch((e) => {
        console.error(e)
        uiLock.value = false
      })
  }

  function showGameCardOnly(result: unknown, isForUs: (player: string) => boolean) {
    uiLock.value = true
    gameCardOnlyDecoder
      .decodePromise(result as any)
      .then((r) => {
        // if it isn't for us, immediately unlock and continue draining
        if (!isForUs(r.player)) {
          uiLock.value = false
          return
        }
        gameCard.value = r
      })
      .catch((e) => {
        console.error(e)
        uiLock.value = false
      })
  }

  function showTarot(contents: string) {
    uiLock.value = true
    JsonDecoder.array(tarotCardDecoder, 'tarotCards')
      .decodePromise(contents)
      .then((r) => {
        tarotCards.value = r
      })
      .catch((e) => {
        console.error(e)
        uiLock.value = false
      })
  }

  function continueUI() {
    gameCard.value = null
    showTheSilenceModal.value = false
    tarotCards.value = []
    uiLock.value = false
  }

  // undo 路径：原 Game.vue 清 gameCard/tarotCards/uiLock 但不动 showTheSilenceModal
  function resetForUndo() {
    gameCard.value = null
    tarotCards.value = []
    uiLock.value = false
  }

  return {
    uiLock,
    gameCard,
    tarotCards,
    showTheSilenceModal,
    showSilence,
    showGameCard,
    showGameCardOnly,
    showTarot,
    continueUI,
    resetForUndo,
  }
}

export type GameModals = ReturnType<typeof useGameModals>
```

注意原解码细节逐字保留：GameCard/GameCardOnly 解码的是**整个 result 对象**（`result as any`），GameTarot 解码的是 `result.contents`——调用方传参时要对应。

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/arkham/composables/useGameModals.spec.ts
```

- [ ] **Step 5: 接入 Game.vue**

- 删除：`GameCard`/`GameCardOnly` 接口、`gameCardDecoder`/`gameCardOnlyDecoder`、`gameCard`/`showTheSilenceModal`/`tarotCards`/`uiLock` 四个 ref、`continueUI`。
- 顶部加：

```ts
import { useGameModals } from '@/arkham/composables/useGameModals'
```

- setup 里加（解构出模板在用的名字，模板零改动）：

```ts
const modals = useGameModals()
const { uiLock, gameCard, tarotCards, showTheSilenceModal, continueUI } = modals
```

- `handleResult` 各分支改写（排队判断留在原地）：

```ts
case 'GameUI':
  if (result.contents.startsWith('theSilence:')) {
    if (props.spectate) return
    const targetPlayer = result.contents.slice('theSilence:'.length)
    if (!(solo.value === true || targetPlayer === playerId.value)) return
    if (uiLock.value) {
      qPush(result)
      return
    }
    modals.showSilence()
    return
  }
  // confetti 分支不动
```

```ts
case 'GameTarot':
  if (props.spectate) return
  if (uiLock.value) {
    qPush(result)
    return
  }
  modals.showTarot(result.contents)
  return

case 'GameCard':
  if (props.spectate) return
  if (uiLock.value) {
    qPush(result)
    return
  }
  modals.showGameCard(result)
  return

case 'GameCardOnly':
  if (props.spectate) return
  if (uiLock.value) {
    qPush(result)
    return
  }
  modals.showGameCardOnly(result, (player) => solo.value === true || player === playerId.value)
  return
```

- `undo`/`undoScenario`/`undoBoundary` 里的三行 `gameCard.value = null; tarotCards.value = []; uiLock.value = false` 改为 `modals.resetForUndo()`（`resultQueue.value = []` 留在原地）。
- Card/TarotCard 的 import 改为仅保留模板还在用的部分（`toCardContents` 在 Task 1 已移走；`tarotCardImage` 模板还在用，保留）。

- [ ] **Step 6: 全量验证 + 手动冒烟**

```bash
npm run tc && npx vitest run
```
另起 dev server 开一局游戏，确认抽遭遇卡/揭示卡弹层、确定按钮、undo 后弹层清空均正常。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/arkham/composables/useGameModals.ts frontend/src/arkham/composables/useGameModals.spec.ts frontend/src/arkham/views/Game.vue
git commit -m "Extract useGameModals from Game.vue"
```

---

### Task 3: 三个揭示类模态组件

**Files:**
- Create: `frontend/src/arkham/components/TheSilenceModal.vue`
- Create: `frontend/src/arkham/components/RevealedCardModal.vue`
- Create: `frontend/src/arkham/components/TarotModal.vue`
- Modify: `frontend/src/arkham/views/Game.vue`

纯模板+样式搬移，无逻辑。`.revelation` 基础样式在卡牌/塔罗两个组件各留一份（约 60 行重复，换取组件完全自治；Phase 4 若再用可再提公共 scss）。

- [ ] **Step 1: 创建 `TheSilenceModal.vue`**

```vue
<script lang="ts" setup>
import { imgsrc } from '@/arkham/helpers'

defineEmits<{ continue: [] }>()
</script>

<template>
  <div class="the-silence-modal-backdrop">
    <div class="the-silence-modal" role="dialog" aria-modal="true" aria-labelledby="the-silence-modal-title">
      <img class="the-silence-modal__agenda no-overlay" :src="imgsrc('cards/10652.avif')" alt="The Silence" />
      <div class="the-silence-modal__body">
        <h2 id="the-silence-modal-title">The Silence</h2>
        <p>If you look at the Cosmic Emissary enemy for more than 15 seconds at a time, you are <strong>driven insane</strong>.</p>
        <div class="the-silence-modal__actions">
          <button type="button" class="the-silence-modal__confirm" @click="$emit('continue')">{{ $t('ok') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 以下样式从 Game.vue 逐字搬入：
   .the-silence-modal-backdrop、.the-silence-modal、.the-silence-modal__agenda、
   .the-silence-modal__body（含 h2/p）、.the-silence-modal__actions（含 button）、
   .the-silence-modal__confirm、@media (max-width: 650px) 整块 */
</style>
```

样式块按注释把 Game.vue `<style>` 里所有 `the-silence-` 开头的选择器及其 650px media query 原样剪切过来（剪切＝Game.vue 里删除）。

- [ ] **Step 2: 创建 `RevealedCardModal.vue`**

```vue
<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { imgsrc } from '@/arkham/helpers'
import { handleEmbeddedI18n } from '@/arkham/i18n'
import type * as Arkham from '@/arkham/types/Game'
import type { GameCard, GameCardOnly } from '@/arkham/composables/useGameModals'
import CardView from '@/arkham/components/Card.vue'

defineProps<{
  game: Arkham.Game
  playerId: string
  gameCard: GameCard | GameCardOnly
}>()

defineEmits<{ continue: [] }>()

const { t } = useI18n()
const format = (str: string) => handleEmbeddedI18n(str, t)
</script>

<template>
  <div class="revelation">
    <div class="revelation-container">
      <h2>{{ format(gameCard.title) }}</h2>
      <div class="revelation-card-container">
        <div class="revelation-card">
          <CardView :game="game" :card="gameCard.card" :playerId="playerId" />
          <img
            v-if="gameCard.card.tag === 'PlayerCard'"
            :src="imgsrc('player_back.jpg')"
            class="card back"
          />
          <img v-else :src="imgsrc('back.png')" class="card back" />
        </div>
        <button @click="$emit('continue')">{{ $t('ok') }}</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 从 Game.vue 逐字搬入：
   @keyframes revelation、@keyframes glow、@keyframes flip-back、@keyframes flip-front、
   .revelation（整块含嵌套 button/h2/:deep(.card)）、.revelation-container、
   .revelation-card-container（保留 .revelation-card 子块与 .the-silence-card 子块，
   删去 .tarot-cards/.tarot/.tarot-card 子块——那些归 TarotModal） */
</style>
```

- [ ] **Step 3: 创建 `TarotModal.vue`**

```vue
<script lang="ts" setup>
import { imgsrc } from '@/arkham/helpers'
import { TarotCard, tarotCardImage } from '@/arkham/types/TarotCard'

defineProps<{ tarotCards: TarotCard[] }>()
defineEmits<{ continue: [] }>()
</script>

<template>
  <div class="revelation">
    <div class="revelation-container">
      <div class="revelation-card-container">
        <div class="tarot-cards">
          <div v-for="(tarotCard, idx) in tarotCards" :key="idx" class="tarot-card">
            <div class="card-container">
              <img
                :src="imgsrc(`tarot/${tarotCardImage(tarotCard)}`)"
                class="tarot"
                :class="tarotCard.facing"
              />
            </div>
            <img :src="imgsrc('tarot/back.jpg')" class="card back" />
          </div>
        </div>
        <button @click="$emit('continue')">{{ $t('ok') }}</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 从 Game.vue 复制（卡牌组件已留一份，此处第二份）：
   @keyframes revelation、@keyframes glow、@keyframes flip-back、@keyframes flip-front、
   .revelation（整块）、.revelation-container；
   .revelation-card-container 只保留 .tarot-cards/.tarot/.tarot-card:nth-child(*)/.tarot-card 子块 */
</style>
```

- [ ] **Step 4: 接入 Game.vue**

模板替换（注意保持原 `v-if`/`v-else-if` 链：silence → gameCard → …）：

```html
<TheSilenceModal v-if="showTheSilenceModal" @continue="continueUI" />
<RevealedCardModal
  v-else-if="gameCard"
  :game="game"
  :playerId="playerId"
  :gameCard="gameCard"
  @continue="continueUI"
/>
...
<TarotModal v-if="tarotCards.length > 0" :tarotCards="tarotCards" @continue="continueUI" />
```

- script 加三个 import；删掉不再被模板引用的 `CardView`、`tarotCardImage`、`handleEmbeddedI18n`、`format`（确认 Game.vue 其他地方无引用后再删）。
- 删除 Game.vue `<style>` 中已搬走的全部选择器与 keyframes。
- `@keyframes anim`、`@property --gradient-angle`、`@keyframes rotation` 三段在模板中无引用——本次**不动**（纯重构不顺带删码），留注释 `/* TODO(清理): 疑似无引用 */` 也不加，保持 diff 干净。

- [ ] **Step 5: 验证 + 提交**

```bash
npm run tc && npx vitest run
```
dev server 手动确认：遭遇卡揭示动画（翻面、辉光）、塔罗弹层、Silence 弹层视觉与之前一致。

```bash
git add frontend/src/arkham/components/TheSilenceModal.vue frontend/src/arkham/components/RevealedCardModal.vue frontend/src/arkham/components/TarotModal.vue frontend/src/arkham/views/Game.vue
git commit -m "Extract revelation modals (silence/card/tarot) from Game.vue"
```

---### Task 4: 抽出 `useGameSocket`

**Files:**
- Create: `frontend/src/arkham/composables/useGameSocket.ts`
- Test: `frontend/src/arkham/composables/useGameSocket.spec.ts`
- Modify: `frontend/src/arkham/views/Game.vue`

本计划最大一步。composable 拥有连接、初始 fetch、结果队列、应答发送、skipAll，并持有 `game/gameLog/playerId/ready/solo/error/socketError/processing` 状态。

- [ ] **Step 1: 写失败测试**

`frontend/src/arkham/composables/useGameSocket.spec.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useGameModals } from './useGameModals'
import { useGameSocket } from './useGameSocket'
import * as Arkham from '@/arkham/types/Game'

vi.mock('@/arkham/types/Card', () => ({ cardDecoder: { decodePromise: (x: any) => Promise.resolve(x) } }))

// 捕获 useWebSocket 的回调，模拟服务器推送
let wsOptions: any
const sendSpy = vi.fn()
vi.mock('@vueuse/core', () => ({
  useWebSocket: vi.fn((_url: unknown, options: unknown) => {
    wsOptions = options
    return { send: sendSpy, close: vi.fn() }
  }),
}))

vi.mock('@/stores/user', () => ({ useUserStore: () => ({ token: 'tok' }) }))
vi.mock('@/arkham/gameImagePreload', () => ({
  loadAllGameImages: vi.fn(() => Promise.resolve()),
  preloadGameImages: vi.fn(),
}))
vi.mock('@/arkham/api', () => ({
  fetchGame: vi.fn(() =>
    Promise.resolve({
      game: { log: [], question: { p1: {} }, scenarioSteps: 5 },
      playerId: 'p1',
      multiplayerMode: 'Solo',
    }),
  ),
}))

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

function pushMessage(result: object) {
  wsOptions.onMessage(null, { data: JSON.stringify(result) })
}

function makeSocket(spectate = false) {
  const scope = effectScope()
  let socket!: ReturnType<typeof useGameSocket>
  let modals!: ReturnType<typeof useGameModals>
  scope.run(() => {
    modals = useGameModals()
    socket = useGameSocket({
      gameId: () => 'g1',
      spectate,
      modals,
      emitter: { emit: vi.fn() },
    })
  })
  return { socket, modals, scope }
}

describe('useGameSocket', () => {
  beforeEach(() => {
    sendSpy.mockClear()
  })

  it('初始 fetch 填充 game/playerId/ready/solo', async () => {
    const { socket } = makeSocket()
    await flush()
    expect(socket.ready.value).toBe(true)
    expect(socket.playerId.value).toBe('p1')
    expect(socket.solo.value).toBe(true)
  })

  it('GameMessage 追加到 gameLog', async () => {
    const { socket } = makeSocket()
    await flush()
    pushMessage({ tag: 'GameMessage', contents: 'hello' })
    expect(socket.gameLog.value).toContain('hello')
  })

  it('GameError 写入 error 并恢复 oldQuestion', async () => {
    const { socket } = makeSocket()
    await flush()
    socket.choose(2)
    expect(socket.game.value?.question).toEqual({})
    pushMessage({ tag: 'GameError', contents: 'boom' })
    expect(socket.error.value).toBe('boom')
    expect(socket.game.value?.question).toEqual({ p1: {} })
  })

  it('choose 发送 Answer（带 questionVersion），清空 question，置 processing', async () => {
    const { socket } = makeSocket()
    await flush()
    socket.choose(3)
    expect(socket.processing.value).toBe(true)
    expect(JSON.parse(sendSpy.mock.calls[0][0])).toEqual({
      tag: 'Answer',
      contents: { choice: 3, playerId: 'p1', questionVersion: 5 },
    })
  })

  it('spectate 模式 choose 不发送', async () => {
    const { socket } = makeSocket(true)
    await flush()
    socket.choose(3)
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it('uiLock 锁住时 GameCard 入队，解锁后排空重放', async () => {
    const { socket, modals } = makeSocket()
    await flush()
    modals.uiLock.value = true
    const showSpy = vi.spyOn(modals, 'showGameCard')
    pushMessage({ tag: 'GameCard', title: 'T', card: {} })
    expect(showSpy).not.toHaveBeenCalled()
    modals.uiLock.value = false
    await nextTick()
    expect(showSpy).toHaveBeenCalledOnce()
  })

  it('uiLock 锁住时 GameUpdate 入队并清空 question', async () => {
    const { socket, modals } = makeSocket()
    await flush()
    modals.uiLock.value = true
    const decodeSpy = vi
      .spyOn(Arkham.gameDecoder, 'decodePromise')
      .mockResolvedValue({ log: [], question: {}, activePlayerId: 'p1' } as any)
    pushMessage({ tag: 'GameUpdate', contents: '{}' })
    expect(decodeSpy).not.toHaveBeenCalled()
    expect(socket.game.value?.question).toEqual({})
    modals.uiLock.value = false
    await nextTick()
    expect(decodeSpy).toHaveBeenCalledOnce()
    decodeSpy.mockRestore()
  })

  it('GameUpdate 解码后更新 game 并预加载图片', async () => {
    const { socket } = makeSocket()
    await flush()
    const updated = { log: ['l1'], question: { p1: {} }, activePlayerId: 'p1' } as any
    const decodeSpy = vi.spyOn(Arkham.gameDecoder, 'decodePromise').mockResolvedValue(updated)
    pushMessage({ tag: 'GameUpdate', contents: '{}' })
    await flush()
    expect(socket.game.value).toBe(updated)
    expect(socket.gameLog.value).toEqual(['l1'])
    decodeSpy.mockRestore()
  })
})
```

注：`fetchGame` mock 的 game 对象是按需最小化的 `as any` 假对象；若 `ArkhamGame.choices` 等在测试路径上要求更多字段，补字段而非改实现。

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/arkham/composables/useGameSocket.spec.ts
```

- [ ] **Step 3: 实现 `useGameSocket.ts`**

逐字搬移 Game.vue 对应代码，替换：`props.gameId` → `opts.gameId()`、`props.spectate` → `opts.spectate`、`uiLock` → `modals.uiLock`、卡/塔罗/Silence 分支 → `modals.show*`、`emitter` → `opts.emitter`：

```ts
import { computed, ref, shallowRef, watch } from 'vue'
import { useWebSocket } from '@vueuse/core'
import confetti from '@/effects/confetti'
import { fetchGame } from '@/arkham/api'
import { useUserStore } from '@/stores/user'
import * as Arkham from '@/arkham/types/Game'
import * as ArkhamGame from '@/arkham/types/Game'
import * as Message from '@/arkham/types/Message'
import type { Question } from '@/arkham/types/Question'
import { loadAllGameImages, preloadGameImages } from '@/arkham/gameImagePreload'
import type { GameModals } from './useGameModals'

// TODO: contents should not be string
export type ServerResult =
  | { tag: 'GameError'; contents: string }
  | { tag: 'GameMessage'; contents: string }
  | { tag: 'GameTarot'; contents: string }
  | { tag: 'GameCard'; contents: string }
  | { tag: 'GameCardOnly'; contents: string }
  | { tag: 'GameUpdate'; contents: string }
  | { tag: 'GameShowDiscard'; contents: string }
  | { tag: 'GameShowUnder'; contents: string }
  | { tag: 'GameUI'; contents: string }

export interface GameEmitter {
  emit(event: string, payload?: unknown): void
}

export interface UseGameSocketOptions {
  gameId: () => string
  spectate: boolean
  modals: GameModals
  emitter: GameEmitter
}

const baseURL = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`

export function useGameSocket(opts: UseGameSocketOptions) {
  const { modals, emitter } = opts
  const userStore = useUserStore()

  const game = shallowRef<Arkham.Game | null>(null)
  const gameLog = shallowRef<readonly string[]>(Object.freeze([]))
  const playerId = ref<string | null>(null)
  const ready = ref(false)
  const solo = ref(false)
  const error = ref<string | null>(null)
  const socketError = ref(false)
  const processing = ref(false)
  const oldQuestion = ref<Record<string, Question> | null>(null)
  const resultQueue = ref<any>([])
  const skipAllPending = ref<Set<string>>(new Set())

  function updateGameLog(nextLog: readonly string[]) {
    const currentLog = gameLog.value
    if (
      currentLog.length === nextLog.length &&
      currentLog[0] === nextLog[0] &&
      currentLog[currentLog.length - 1] === nextLog[nextLog.length - 1]
    ) {
      return
    }

    gameLog.value = Object.freeze([...nextLog])
  }

  function setGameQuestion(question: Record<string, Question>) {
    if (!game.value) return
    game.value = { ...game.value, question }
  }

  function setGame(state: Arkham.Game) {
    game.value = state
  }

  function switchInvestigator(newPlayerId: string) {
    playerId.value = newPlayerId
  }

  const websocketUrl = computed(() => {
    const spectatePrefix = opts.spectate ? '/spectate' : ''
    return `${baseURL}/api/v1/arkham/games/${opts.gameId()}${spectatePrefix}?token=${userStore.token}`
      .replace(/https/, 'wss')
      .replace(/http/, 'ws')
  })

  let qHead = 0
  const qPush = (x: ServerResult) => {
    resultQueue.value.push(x)
  }
  const qPop = (): ServerResult | undefined => {
    if (qHead >= resultQueue.value.length) {
      resultQueue.value = []
      qHead = 0
      return undefined
    }
    return resultQueue.value[qHead++]
  }
  function clearResultQueue() {
    resultQueue.value = []
    qHead = 0
  }

  let decoding = false
  let pendingUpdate: string | null = null

  function scheduleApplyUpdate(payload: string) {
    if (decoding) {
      pendingUpdate = payload
      return
    }
    decoding = true
    Arkham.gameDecoder
      .decodePromise(payload)
      .then((updatedGame) => {
        game.value = updatedGame
        updateGameLog(updatedGame.log)
        preloadGameImages(updatedGame)
        if (solo.value === true) {
          if (Object.keys(game.value.question).length == 1) {
            playerId.value = Object.keys(game.value.question)[0]
          } else if (game.value.activePlayerId !== playerId.value) {
            if (playerId.value && Object.keys(game.value.question).includes(playerId.value)) {
              playerId.value = game.value.activePlayerId
            } else {
              playerId.value = Object.keys(game.value.question)[0]
            }
          } else if (playerId.value && !Object.keys(game.value.question).includes(playerId.value)) {
            playerId.value = Object.keys(game.value.question)[0]
          }
        }
        continueSkipAll()
      })
      .finally(() => {
        decoding = false
        if (pendingUpdate) {
          const p = pendingUpdate
          pendingUpdate = null
          scheduleApplyUpdate(p)
        }
      })
  }

  function skipTriggerEntries(g: Arkham.Game): { playerId: string; choiceIdx: number }[] {
    const result: { playerId: string; choiceIdx: number }[] = []
    for (const pid of Object.keys(g.question)) {
      const cs = ArkhamGame.choices(g, pid)
      const idx = cs.findIndex((c) => c.tag === Message.MessageType.SKIP_TRIGGERS_BUTTON)
      if (idx !== -1) result.push({ playerId: pid, choiceIdx: idx })
    }
    return result
  }

  const skipAllAvailable = computed(() => {
    if (!solo.value || !game.value) return false
    return skipTriggerEntries(game.value).length > 1
  })

  function continueSkipAll() {
    if (skipAllPending.value.size === 0) return
    if (!game.value) return
    const next = skipTriggerEntries(game.value).find((e) => skipAllPending.value.has(e.playerId))
    if (!next) {
      skipAllPending.value = new Set()
      return
    }
    sendSkipFor(next.playerId, next.choiceIdx)
  }

  function sendSkipFor(targetPlayerId: string, choiceIdx: number) {
    if (!game.value || opts.spectate) return
    oldQuestion.value = game.value.question
    const questionVersion = game.value.scenarioSteps
    setGameQuestion({})
    processing.value = true
    send(
      JSON.stringify({
        tag: 'Answer',
        contents: { choice: choiceIdx, playerId: targetPlayerId, questionVersion },
      }),
    )
  }

  function skipAllTriggers() {
    if (!game.value || opts.spectate) return
    const entries = skipTriggerEntries(game.value)
    if (entries.length === 0) return
    skipAllPending.value = new Set(entries.map((e) => e.playerId))
    const first = entries[0]
    sendSkipFor(first.playerId, first.choiceIdx)
  }

  const handleResult = (result: ServerResult) => {
    processing.value = false
    switch (result.tag) {
      case 'GameError':
        if (opts.spectate) return
        error.value = result.contents
        if (game.value && oldQuestion.value) {
          setGameQuestion(oldQuestion.value)
        }
        return
      case 'GameMessage':
        // Store the raw token; GameMessage.vue localizes via handleEmbeddedI18n,
        // which keeps params intact and re-renders reactively on language change.
        gameLog.value = Object.freeze([...gameLog.value, result.contents])
        return
      case 'GameShowDiscard':
        emitter.emit('showDiscards', result.contents)
        return
      case 'GameShowUnder':
        emitter.emit('showUnder', result.contents)
        return
      case 'GameUI':
        if (result.contents.startsWith('theSilence:')) {
          if (opts.spectate) return
          const targetPlayer = result.contents.slice('theSilence:'.length)
          if (!(solo.value === true || targetPlayer === playerId.value)) return
          if (modals.uiLock.value) {
            qPush(result)
            return
          }
          modals.showSilence()
          return
        }
        switch (result.contents) {
          case 'confetti': {
            setTimeout(() => {
              var count = 500
              var defaults = {
                origin: { y: 0.7 },
              }

              function fire(particleRatio: number, opts: Parameters<typeof confetti>[0]) {
                confetti({
                  ...defaults,
                  ...opts,
                  particleCount: Math.floor(count * particleRatio),
                })
              }

              fire(0.25, {
                spread: 26,
                startVelocity: 55,
              })
            }, 500)
          }
          default:
            return
        }
      case 'GameTarot':
        if (opts.spectate) return
        if (modals.uiLock.value) {
          qPush(result)
          return
        }
        modals.showTarot(result.contents)
        return

      case 'GameCard':
        if (opts.spectate) return
        if (modals.uiLock.value) {
          qPush(result)
          return
        }
        modals.showGameCard(result)
        return

      case 'GameCardOnly':
        if (opts.spectate) return
        if (modals.uiLock.value) {
          qPush(result)
          return
        }
        modals.showGameCardOnly(result, (player) => solo.value === true || player === playerId.value)
        return
      case 'GameUpdate':
        if (modals.uiLock.value) {
          qPush(result)
          if (game.value) setGameQuestion({})
        } else {
          scheduleApplyUpdate(result.contents)
        }
        return
    }
  }

  const onError = () => {
    processing.value = false
    if (game.value && oldQuestion.value) {
      setGameQuestion(oldQuestion.value)
    }
    socketError.value = true
  }
  const onConnected = () => {
    socketError.value = false
    processing.value = false
  }
  const onMessage = (_ws: WebSocket, event: MessageEvent) => {
    const result = JSON.parse(event.data)
    handleResult(result)
    oldQuestion.value = null
  }

  const { send, close } = useWebSocket(websocketUrl, {
    autoReconnect: true,
    onError,
    onConnected,
    onMessage,
  })

  watch(modals.uiLock, async () => {
    if (modals.uiLock.value) return
    // drain result queue
    for (;;) {
      const r = qPop()
      if (!r) break
      handleResult(r)
      if (modals.uiLock.value) break
    }
  })

  watch(
    () => opts.gameId(),
    async (newV, oldV) => {
      if (!newV) return
      if (newV === oldV) return
      await fetchGame(opts.gameId(), opts.spectate).then(
        async ({ game: newGame, playerId: newPlayerId, multiplayerMode }) => {
          try {
            await loadAllGameImages(newGame)
          } catch (e) {
            console.error(e)
          }
          ;(window as Window & { g?: Arkham.Game }).g = newGame
          game.value = newGame
          solo.value = multiplayerMode === 'Solo'
          updateGameLog(newGame.log)
          playerId.value = newPlayerId
          ready.value = true
        },
      )
    },
    { immediate: true },
  )

  async function choose(idx: number) {
    if (idx !== -1 && game.value && !opts.spectate) {
      oldQuestion.value = game.value.question
      const questionVersion = game.value.scenarioSteps
      setGameQuestion({})
      processing.value = true
      send(
        JSON.stringify({
          tag: 'Answer',
          contents: { choice: idx, playerId: playerId.value, questionVersion },
        }),
      )
    }
  }

  async function chooseDeck(deckId: string): Promise<void> {
    if (game.value && !opts.spectate) {
      oldQuestion.value = game.value.question
      setGameQuestion({})
      processing.value = true
      send(JSON.stringify({ tag: 'DeckAnswer', deckId, playerId: playerId.value }))
    }
  }

  async function chooseDeckList(deckList: object): Promise<void> {
    if (game.value && !opts.spectate) {
      oldQuestion.value = game.value.question
      setGameQuestion({})
      processing.value = true
      send(JSON.stringify({ tag: 'DeckListAnswer', deckList, playerId: playerId.value }))
    }
  }

  async function choosePaymentAmounts(amounts: Record<string, number>): Promise<void> {
    if (game.value && !opts.spectate) {
      oldQuestion.value = game.value.question
      const questionVersion = game.value.scenarioSteps
      setGameQuestion({})
      processing.value = true
      send(
        JSON.stringify({
          tag: 'PaymentAmountsAnswer',
          contents: { amounts, questionVersion, playerId: playerId.value },
        }),
      )
    }
  }

  async function chooseAmounts(amounts: Record<string, number>): Promise<void> {
    if (game.value && !opts.spectate) {
      oldQuestion.value = game.value.question
      const questionVersion = game.value.scenarioSteps
      setGameQuestion({})
      processing.value = true
      send(
        JSON.stringify({
          tag: 'AmountsAnswer',
          contents: { amounts, questionVersion, playerId: playerId.value },
        }),
      )
    }
  }

  return {
    game,
    gameLog,
    playerId,
    ready,
    solo,
    error,
    socketError,
    processing,
    send,
    close,
    setGame,
    setGameQuestion,
    clearResultQueue,
    choose,
    chooseDeck,
    chooseDeckList,
    choosePaymentAmounts,
    chooseAmounts,
    skipAllTriggers,
    skipAllAvailable,
    switchInvestigator,
  }
}

export type GameSocket = ReturnType<typeof useGameSocket>
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/arkham/composables/useGameSocket.spec.ts
```

- [ ] **Step 5: 接入 Game.vue**

- 删除 Game.vue 中已搬走的全部：`ServerResult`、`baseURL`、`websocketUrl`、q 队列、`scheduleApplyUpdate`、`skipTriggerEntries`/`continueSkipAll`/`sendSkipFor`/`skipAllTriggers`/`skipAllAvailable`/`skipAllPending`、`onError`/`onConnected`/`onMessage`/`handleResult`、`useWebSocket` 调用、uiLock 的 drain watch、gameId 的 fetch watch、`choose*` 五个函数、`update`、`switchInvestigator`、`setGameQuestion`、`updateGameLog`，以及 `game/gameLog/playerId/ready/solo/error/socketError/processing/oldQuestion/resultQueue` 状态。
- 加：

```ts
import { useGameSocket } from '@/arkham/composables/useGameSocket'

const emitter = useEmitter()
const modals = useGameModals()
const { uiLock, gameCard, tarotCards, showTheSilenceModal, continueUI } = modals
const socket = useGameSocket({
  gameId: () => props.gameId,
  spectate: props.spectate,
  modals,
  emitter,
})
const {
  game, gameLog, playerId, ready, solo, error, socketError, processing,
  send, close, choose, chooseDeck, chooseDeckList, choosePaymentAmounts, chooseAmounts,
  setGameQuestion, clearResultQueue, skipAllTriggers, skipAllAvailable, switchInvestigator,
} = socket
```

（`const emitter = useEmitter()` 原本就有，别重复声明。）

- 模板里 `@update="update"` 改为 `@update="socket.setGame"`。
- undo 系列里的 `resultQueue.value = []` 改为 `clearResultQueue()`。
- `onBeforeRouteLeave(() => close())` 与 `onUnmounted` 中的 `close()` 保持。
- provides（`provide('send', send)` 等）暂保持原样，绑定到解构出的新引用——Task 5 再集中搬。
- 清理不再用的 import（`useWebSocket`、`confetti`、`fetchGame`、`cardDecoder` 等），以 `npm run tc` + eslint 报告为准。

- [ ] **Step 6: 全量验证 + 手动回归**

```bash
npm run tc && npx vitest run && npm run lint
```
dev server 手动回归（这步是本计划最大风险点，认真走）：开局 → 点选项 → 抽牌 → 技能检定 → 撤销 → 断网重连提示（DevTools offline 切换看 socketWarning）→ 旁观模式（`/games/:id/spectate`）只读。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/arkham/composables/useGameSocket.ts frontend/src/arkham/composables/useGameSocket.spec.ts frontend/src/arkham/views/Game.vue
git commit -m "Extract useGameSocket from Game.vue"
```

---

### Task 5: `provideGameContext` + `useGameUndo`

**Files:**
- Create: `frontend/src/arkham/composables/provideGameContext.ts`
- Create: `frontend/src/arkham/composables/useGameUndo.ts`
- Modify: `frontend/src/arkham/views/Game.vue`

两个都是纯搬移，无独立单测（行为由 tc + 手动回归覆盖；choices 计算逻辑已有 `useGameChoices` 在管）。

- [ ] **Step 1: 实现 `provideGameContext.ts`**

```ts
import { computed, provide, type Ref } from 'vue'
import * as ArkhamGame from '@/arkham/types/Game'
import type * as Message from '@/arkham/types/Message'
import type { Source } from '@/arkham/types/Source'
import {
  choicesByPlayerKey,
  choicesSourceByPlayerKey,
  choicesTooltipByPlayerKey,
} from '@/arkham/composables/useGameChoices'
import { buildGameIndexes, gameIndexesKey } from '@/arkham/composables/useGameIndexes'
import type { GameSocket } from './useGameSocket'

// 必须在组件 setup 内调用（provide 的要求）。桌面 Game.vue 与未来的手机 shell 各自调用一次。
export function provideGameContext(socket: GameSocket, showOtherPlayersHands: Ref<boolean>) {
  const { game } = socket

  const choicesByPlayer = computed(() => {
    const currentGame = game.value
    if (!currentGame) return new Map<string, readonly Message.Message[]>()

    return new Map(
      Object.keys(currentGame.question).map((pid) => [pid, ArkhamGame.choices(currentGame, pid)]),
    )
  })
  const choicesSourceByPlayer = computed(() => {
    const currentGame = game.value
    if (!currentGame) return new Map<string, Source | null>()

    return new Map(
      Object.keys(currentGame.question).map((pid) => [pid, ArkhamGame.choicesSource(currentGame, pid)]),
    )
  })
  const choicesTooltipByPlayer = computed(() => {
    const currentGame = game.value
    if (!currentGame) return new Map<string, string | null>()

    return new Map(
      Object.keys(currentGame.question).map((pid) => [pid, ArkhamGame.choicesTooltip(currentGame, pid)]),
    )
  })
  const gameIndexes = computed(() => buildGameIndexes(game.value))

  provide(choicesByPlayerKey, choicesByPlayer)
  provide(choicesSourceByPlayerKey, choicesSourceByPlayer)
  provide(choicesTooltipByPlayerKey, choicesTooltipByPlayer)
  provide(gameIndexesKey, gameIndexes)
  provide('chooseDeck', socket.chooseDeck)
  provide('chooseDeckList', socket.chooseDeckList)
  provide('send', socket.send)
  provide('choosePaymentAmounts', socket.choosePaymentAmounts)
  provide('chooseAmounts', socket.chooseAmounts)
  provide('switchInvestigator', socket.switchInvestigator)
  provide('solo', socket.solo)
  provide('skipAllTriggers', socket.skipAllTriggers)
  provide('skipAllAvailable', socket.skipAllAvailable)
  provide('showOtherPlayersHands', showOtherPlayersHands)

  return { choicesByPlayer, gameIndexes }
}
```

- [ ] **Step 2: 实现 `useGameUndo.ts`**

```ts
import { computed, ref, type Ref, type ShallowRef } from 'vue'
import {
  undoChoice,
  undoScenarioChoice,
  undoAction,
  undoTurn,
  undoPhase,
  undoRound,
} from '@/arkham/api'
import type * as Arkham from '@/arkham/types/Game'
import type { Question } from '@/arkham/types/Question'

export interface UseGameUndoOptions {
  gameId: () => string
  game: ShallowRef<Arkham.Game | null>
  processing: Ref<boolean>
  setGameQuestion: (question: Record<string, Question>) => void
  clearResultQueue: () => void
  modals: { resetForUndo: () => void }
  debugActive: () => boolean
}

export function useGameUndo(opts: UseGameUndoOptions) {
  const { game, processing, setGameQuestion, clearResultQueue, modals } = opts

  const canUndoScenario = computed(() => {
    if (!game.value) return false
    return game.value.scenarioSteps > 1
  })

  const canUndoBoundary = (boundary: number | null): boolean => {
    if (!game.value) return false
    if (boundary === null) return false
    return game.value.scenarioSteps > boundary
  }

  const canUndoAction = computed(() => canUndoBoundary(game.value?.undoActionStep ?? null))
  const canUndoTurn = computed(() => canUndoBoundary(game.value?.undoTurnStep ?? null))
  const canUndoPhase = computed(() => canUndoBoundary(game.value?.undoPhaseStep ?? null))
  const canUndoRound = computed(() => canUndoBoundary(game.value?.undoRoundStep ?? null))

  const undoLock = ref(false)

  async function undo() {
    processing.value = true
    const oldQuestion = game.value?.question
    if (game.value) setGameQuestion({})
    clearResultQueue()
    modals.resetForUndo()
    if (undoLock.value) return
    undoLock.value = true
    try {
      await undoChoice(opts.gameId(), opts.debugActive())
    } catch (e) {
      processing.value = false
      if (game.value && oldQuestion) setGameQuestion(oldQuestion)
      console.log(e)
    }
    undoLock.value = false
  }

  // 调用方负责先关确认对话框（原 Game.vue 里 dialog.close() 在前）
  async function undoScenario() {
    processing.value = true
    if (game.value) setGameQuestion({})
    clearResultQueue()
    modals.resetForUndo()
    undoScenarioChoice(opts.gameId())
  }

  async function undoBoundary(call: (gameId: string) => Promise<void>) {
    if (undoLock.value) return
    processing.value = true
    const oldQuestion = game.value?.question
    if (game.value) setGameQuestion({})
    clearResultQueue()
    modals.resetForUndo()
    undoLock.value = true
    try {
      await call(opts.gameId())
    } catch (e) {
      processing.value = false
      if (game.value && oldQuestion) setGameQuestion(oldQuestion)
      console.log(e)
    }
    undoLock.value = false
  }

  const undoActionStart = () => undoBoundary(undoAction)
  const undoTurnStart = () => undoBoundary(undoTurn)
  const undoPhaseStart = () => undoBoundary(undoPhase)
  const undoRoundStart = () => undoBoundary(undoRound)

  return {
    undo,
    undoScenario,
    undoActionStart,
    undoTurnStart,
    undoPhaseStart,
    undoRoundStart,
    canUndoScenario,
    canUndoAction,
    canUndoTurn,
    canUndoPhase,
    canUndoRound,
  }
}
```

注意：原 `undo`/`undoBoundary` 各清各的状态顺序略不同（`uiLock.value = false` 在最后）——`resetForUndo()` 内部顺序为 gameCard → tarot → uiLock，与原顺序等价（中间无别的副作用读这些值）。

- [ ] **Step 3: 接入 Game.vue**

- 删除：三个 choices computed、`gameIndexes` computed、整段 `provide(...)`、`canUndo*` 五个 computed、`canUndoBoundary`、`undoLock`、`undo`/`undoScenario`/`undoBoundary`/`undo*Start`。
- 加：

```ts
import { provideGameContext } from '@/arkham/composables/provideGameContext'
import { useGameUndo } from '@/arkham/composables/useGameUndo'

const { choicesByPlayer } = provideGameContext(socket, showOtherPlayersHands)

const {
  undo, undoScenario, undoActionStart, undoTurnStart, undoPhaseStart, undoRoundStart,
  canUndoScenario, canUndoAction, canUndoTurn, canUndoPhase, canUndoRound,
} = useGameUndo({
  gameId: () => props.gameId,
  game,
  processing,
  setGameQuestion,
  clearResultQueue,
  modals,
  debugActive: () => debug.active,
})
```

注意 `debug.active` 的取值方式以 `@/arkham/debug` 实际类型为准（若是 ref 则 `() => debug.active.value`，与原 `undoChoice(props.gameId, debug.active)` 传的值保持一致）。

- `choices` computed 改为基于返回值：

```ts
const choices = computed(() => {
  if (!playerId.value) return []
  return choicesByPlayer.value.get(playerId.value) ?? []
})
```

- 模板 `undoScenario()` 调用处改为先关 dialog：

```html
<button @click="confirmUndoScenario">{{ $t('Yes') }}</button>
```

```ts
function confirmUndoScenario() {
  undoScenarioDialog.value?.close()
  undoScenario()
}
```

- `(window as any).undo = undo` 与键盘快捷键引用不变（解构后同名）。
- 删除不再用的 import（`undoChoice` 等 6 个 api、`buildGameIndexes` 等）。

- [ ] **Step 4: 验证 + 提交**

```bash
npm run tc && npx vitest run
```
手动回归：u 撤销、U+A/T/P/R 跳撤、U+S 重开剧本（确认对话框先关再执行）、撤销后 question 恢复。

```bash
git add frontend/src/arkham/composables/provideGameContext.ts frontend/src/arkham/composables/useGameUndo.ts frontend/src/arkham/views/Game.vue
git commit -m "Extract provideGameContext and useGameUndo from Game.vue"
```

---

### Task 6: BugReportForm / ShortcutsModal / PlayabilityModal

**Files:**
- Create: `frontend/src/arkham/components/BugReportForm.vue`
- Create: `frontend/src/arkham/components/ShortcutsModal.vue`
- Create: `frontend/src/arkham/components/PlayabilityModal.vue`
- Modify: `frontend/src/arkham/views/Game.vue`

- [ ] **Step 1: 创建 `BugReportForm.vue`**

表单状态（标题/描述）归组件；API 调用与 `submittingBug` 全屏态留在 Game.vue。

```vue
<script lang="ts" setup>
import { ref } from 'vue'
import Draggable from '@/components/Draggable.vue'

const props = withDefaults(defineProps<{ initialDescription?: string }>(), {
  initialDescription: '',
})

const emit = defineEmits<{
  submit: [title: string, description: string]
  cancel: []
}>()

const bugTitle = ref('')
const bugDescription = ref(props.initialDescription)
</script>

<template>
  <Draggable>
    <template #handle>
      <header>
        <h2>{{ $t('gameBar.fileABug') }}</h2>
      </header>
    </template>
    <form @submit.prevent="emit('submit', bugTitle, bugDescription)" class="column bug-form box">
      <p>{{ $t('gameBar.fileBugPart1') }}</p>
      <p class="info">{{ $t('gameBar.fileBugPart2') }}</p>
      <p class="warning">{{ $t('gameBar.fileBugPart3') }}</p>
      <input
        required
        type="text"
        v-model="bugTitle"
        v-bind:placeholder="$t('gameBar.bugTitleholder')"
      />
      <textarea
        required
        v-model="bugDescription"
        v-bind:placeholder="$t('gameBar.bugDescriptionholder')"
      ></textarea>
      <div class="buttons">
        <button type="submit">{{ $t('submit') }}</button>
        <button @click="emit('cancel')">{{ $t('cancel') }}</button>
      </div>
    </form>
  </Draggable>
</template>

<style lang="scss" scoped>
/* 从 Game.vue 逐字搬入：.bug-form、.warning、.info、header（两段 header 样式合并搬入） */
</style>
```

- [ ] **Step 2: 创建 `ShortcutsModal.vue`**

menuItems 经 `useMenu()` 取（模块级共享状态，跨组件同源）。模板 = Game.vue 中 `<Draggable v-if="showShortcuts">` 整块（去掉外层 v-if，由父级控制），footer 按钮改 `@click="$emit('close')"`。

```vue
<script lang="ts" setup>
import Draggable from '@/components/Draggable.vue'
import { useMenu } from '@/composable/menu'

defineEmits<{ close: [] }>()

const { menuItems } = useMenu()
</script>

<template>
  <Draggable>
    <!-- Game.vue 的 .shortcuts-modal 整块模板逐字搬入，
         仅把 <button class="shortcuts-footer" @click="showShortcuts = false"> 改为 @click="$emit('close')" -->
  </Draggable>
</template>

<style lang="scss" scoped>
/* 从 Game.vue 逐字搬入：.shortcuts-modal、.shortcuts-header、.shortcuts-title、.shortcuts-body、
   .shortcuts-section（含 .section-title）、.shortcut-list、.shortcut-row（含 hover）、.shortcut-name、
   .shortcut-keys（含 kbd 与 .chord-arrow）、.shortcuts-footer（含 hover）、@media (max-width: 700px) 整块 */
</style>
```

- [ ] **Step 3: 创建 `PlayabilityModal.vue`**

```vue
<script lang="ts" setup>
import { imgsrc } from '@/arkham/helpers'

export interface PlayabilityInfo {
  cardId: string
  cardCode: string
  checks: [string, string | null][]
}

defineProps<{ info: PlayabilityInfo }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="debug-modal-overlay" @click.self="$emit('close')">
    <div class="debug-playability-modal">
      <h3>{{ $t('game.playabilityChecks') }}</h3>
      <div class="debug-playability-content">
        <img
          class="debug-card-image"
          :src="imgsrc(`cards/${info.cardCode.replace('c', '')}.avif`)"
        />
        <ul class="playability-checks">
          <li
            v-for="[name, detail] in info.checks"
            :key="name"
            :class="detail === null ? 'check-passed' : 'check-failed'"
          >
            <span class="check-icon">{{ detail === null ? '✓' : '✗' }}</span>
            <span class="check-name">{{ name }}</span>
            <span v-if="detail !== null" class="check-detail">{{ detail }}</span>
          </li>
        </ul>
      </div>
      <button @click="$emit('close')">{{ $t('close') }}</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 从 Game.vue 逐字搬入：.debug-modal-overlay、.debug-playability-modal、.debug-playability-content、
   .debug-card-image、.playability-checks、.check-name、.check-detail、.check-passed、.check-failed、.check-icon */
</style>
```

- [ ] **Step 4: 接入 Game.vue**

- script 改动：

```ts
import BugReportForm from '@/arkham/components/BugReportForm.vue'
import ShortcutsModal from '@/arkham/components/ShortcutsModal.vue'
import PlayabilityModal, { type PlayabilityInfo } from '@/arkham/components/PlayabilityModal.vue'

const bugInitialDescription = ref('')

function fileBugFromError() {
  bugInitialDescription.value = error.value ?? ''
  error.value = null
  filingBug.value = true
}

function openBugReport() {
  bugInitialDescription.value = ''
  filingBug.value = true
}

async function fileBug(bugTitle: string, bugDescription: string) {
  submittingBug.value = true
  filingBug.value = false
  Api.fileBug(props.gameId)
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
      alert(t('gameBar.bugSubmittingFail'))
      submittingBug.value = false
    })
}
```

删除旧 `bugTitle`/`bugDescription` ref 与本地 `PlayabilityInfo` 接口（改用组件导出的）。

- 模板替换：

```html
<ShortcutsModal v-if="showShortcuts" @close="showShortcuts = false" />
<BugReportForm
  v-if="filingBug"
  :initial-description="bugInitialDescription"
  @submit="fileBug"
  @cancel="filingBug = false"
/>
...
<PlayabilityModal
  v-if="playabilityInfo && debug.active"
  :info="playabilityInfo"
  @close="playabilityInfo = null"
/>
```

game-bar 里 `@click="filingBug = true"` 改 `@click="openBugReport"`。

- 删除已搬走的模板块与样式。

- [ ] **Step 5: 验证 + 提交**

```bash
npm run tc && npx vitest run
```
手动：`?` 开关快捷键面板、file bug 表单（从按钮与从错误对话框两个入口，后者预填错误文本）、debug 模式点卡看 playability。

```bash
git add frontend/src/arkham/components/BugReportForm.vue frontend/src/arkham/components/ShortcutsModal.vue frontend/src/arkham/components/PlayabilityModal.vue frontend/src/arkham/views/Game.vue
git commit -m "Extract bug report, shortcuts and playability modals from Game.vue"
```

---

### Task 7: `GameBar.vue`

**Files:**
- Create: `frontend/src/arkham/components/GameBar.vue`
- Modify: `frontend/src/arkham/views/Game.vue`

- [ ] **Step 1: 创建 `GameBar.vue`**

`debugExport` 随组件走（只被 game-bar 用）；router/userStore/debug/menuItems 组件内自取；undo 能力经 props、动作经 emits。

```vue
<script lang="ts" setup>
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { MenuItem } from '@headlessui/vue'
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  ArrowUturnLeftIcon,
  BackwardIcon,
  BeakerIcon,
  BoltIcon,
  BugAntIcon,
  ClockIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  FlagIcon,
  RectangleStackIcon,
} from '@heroicons/vue/20/solid'
import api from '@/api'
import { useUserStore } from '@/stores/user'
import { useMenu } from '@/composable/menu'
import { useDebug } from '@/arkham/debug'
import Menu from '@/components/Menu.vue'

const props = defineProps<{
  gameId: string
  showLog: boolean
  undoChordArmed: boolean
  canUndoAction: boolean
  canUndoTurn: boolean
  canUndoPhase: boolean
  canUndoRound: boolean
  canUndoScenario: boolean
}>()

const emit = defineEmits<{
  toggleShortcuts: []
  undo: []
  undoAction: []
  undoTurn: []
  undoPhase: []
  undoRound: []
  undoScenario: []
  fileBug: []
  toggleSidebar: []
}>()

const router = useRouter()
const userStore = useUserStore()
const debug = useDebug()
const { menuItems } = useMenu()
const { t } = useI18n()

type ExportType = 'basic' | 'full' | 'scenario'
function debugExport(exportType: ExportType) {
  api
    .get(
      `arkham/games/${props.gameId}/${exportType == 'full' ? 'full-' : exportType == 'scenario' ? 'scenario-' : ''}export`,
      { responseType: 'blob' },
    )
    .then((resp) => {
      const url = window.URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      // the filename you want
      a.download = 'arkham-debug.json'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
    })
    .catch((e) => {
      console.log(e)
      alert(t('game.unableToDownloadExport'))
    })
}
</script>

<template>
  <div class="game-bar">
    <!-- Game.vue 的 .game-bar 整块模板逐字搬入，做以下事件替换：
         showShortcuts 切换 → $emit('toggleShortcuts')
         @click="undo" → $emit('undo')
         undoActionStart/undoTurnStart/undoPhaseStart/undoRoundStart → $emit('undoAction'|'undoTurn'|'undoPhase'|'undoRound')
         undoScenarioDialog.showModal() → $emit('undoScenario')
         @click="filingBug = true"（原 openBugReport）→ $emit('fileBug')
         @click="toggleSidebar" → $emit('toggleSidebar')
         router.push 保留（router 在本组件内）
         canUndo* / undoChordArmed / showLog 直接用 props -->
  </div>
</template>

<style lang="scss" scoped>
/* 从 Game.vue 逐字搬入：.game-bar（整块嵌套）、.game-bar-item.active/.game-bar-item:hover、
   .undo-jump-group（含 .armed）、.game-bar div .undo-jump-header、.undo-jump-header、
   .chord-prefix（含 kbd/.chord-hint）、.undo-jump-group.armed .chord-prefix kbd、.chord-key、
   .undo-jump:hover .chord-key 等三连、.undo-jump（整块含 scope 变量）、
   .shortcut、button:hover .shortcut */
</style>
```

注意：原 view 菜单里的快捷键面板按钮一行是 `showShortcuts = !showShortcuts`，emit 后由父级翻转。

- [ ] **Step 2: 接入 Game.vue**

```html
<GameBar
  :game-id="gameId"
  :show-log="showLog"
  :undo-chord-armed="undoChordArmed"
  :can-undo-action="canUndoAction"
  :can-undo-turn="canUndoTurn"
  :can-undo-phase="canUndoPhase"
  :can-undo-round="canUndoRound"
  :can-undo-scenario="canUndoScenario"
  @toggle-shortcuts="showShortcuts = !showShortcuts"
  @undo="undo"
  @undo-action="undoActionStart"
  @undo-turn="undoTurnStart"
  @undo-phase="undoPhaseStart"
  @undo-round="undoRoundStart"
  @undo-scenario="undoScenarioDialog?.showModal()"
  @file-bug="openBugReport"
  @toggle-sidebar="toggleSidebar"
/>
```

- 删除原 `.game-bar` 模板块、`debugExport`/`ExportType`、相应样式，清理只剩 GameBar 在用的 import（heroicons 大部分、`MenuItem`、`Menu`、`api`、`useUserStore`——注意 `addEntry` 还需要 `useMenu`，`AdjustmentsHorizontalIcon`/`ClockIcon` 还被 `addEntry` 用，保留）。

- [ ] **Step 3: 验证 + 提交**

```bash
npm run tc && npx vitest run
```
手动：game-bar 各菜单（view/debug/undo）、undo 分级按钮置灰逻辑、debug export 下载、侧边栏开关。

```bash
git add frontend/src/arkham/components/GameBar.vue frontend/src/arkham/views/Game.vue
git commit -m "Extract GameBar from Game.vue"
```

---

### Task 8: 抽出 `useGameKeyboard`

**Files:**
- Create: `frontend/src/arkham/composables/useGameKeyboard.ts`
- Modify: `frontend/src/arkham/views/Game.vue`

键盘层（含 Konami、U-chord、鼠标位置追踪）整体搬走。Game.vue 保留自己的 flashlight mousemove（拆成两个监听，行为不变）。

- [ ] **Step 1: 实现 `useGameKeyboard.ts`**

把 Game.vue 的 `actionMap` 之外的键盘相关代码全部搬入（`undoChordArmed`/`armUndoChord`/`clearUndoChord`、KONAMI 整段、`handleKeyPress`、`mouseX/mouseY` 与其 mousemove 监听、keydown 注册/注销）：

```ts
import { onMounted, onUnmounted, ref, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import { useDebug } from '@/arkham/debug'
import * as Arkham from '@/arkham/types/Game'
import * as Message from '@/arkham/types/Message'

export interface UseGameKeyboardOptions {
  enabled: () => boolean
  game: ShallowRef<Arkham.Game | null>
  playerId: Ref<string | null>
  choices: ComputedRef<readonly Message.Message[]>
  choose: (idx: number) => void
  actionMap: ComputedRef<Map<string, () => void>>
  undo: () => void
  undoActionStart: () => void
  undoTurnStart: () => void
  undoPhaseStart: () => void
  undoRoundStart: () => void
  canUndoAction: ComputedRef<boolean>
  canUndoTurn: ComputedRef<boolean>
  canUndoPhase: ComputedRef<boolean>
  canUndoRound: ComputedRef<boolean>
  canUndoScenario: ComputedRef<boolean>
  openUndoScenarioDialog: () => void
  toggleShortcuts: () => void
  toggleDebug: () => void
}

export function useGameKeyboard(opts: UseGameKeyboardOptions) {
  const debug = useDebug()
  const { game, playerId, choices, choose } = opts

  let mouseX = 0
  let mouseY = 0
  const onMove = (event: MouseEvent) => {
    mouseX = event.clientX
    mouseY = event.clientY
  }

  // Chord state for U + <key> shortcuts (T/R/P/S/A)
  const undoChordArmed = ref(false)
  // …… armUndoChord / clearUndoChord 逐字搬入 ……

  // --- Konami Code support ---
  // …… KONAMI_SEQ / konamiIndex / konamiTimer / onKonami / feedKonami 逐字搬入 ……

  const handleKeyPress = (event: KeyboardEvent) => {
    if (!opts.enabled()) return
    // …… 其余逐字搬入，做如下机械替换：
    //   filingBug.value 判断 → 已被 opts.enabled() 取代（原第一行 if (filingBug.value) return 删除）
    //   undoActionStart() 等 → opts.undoActionStart() 等
    //   canUndoAction.value 等 → opts.canUndoAction.value 等
    //   undoScenarioDialog.value?.showModal() → opts.openUndoScenarioDialog()
    //   undo() → opts.undo()
    //   debug.toggle() → opts.toggleDebug()（'D' 键分支）
    //   showShortcuts.value = !showShortcuts.value → opts.toggleShortcuts()
    //   actionMap.value.get(event.key)?.() → opts.actionMap.value.get(event.key)?.()
    //   'e' 分支里的 debug.active / debug.send 用本 composable 的 debug
  }

  onMounted(() => {
    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('keydown', handleKeyPress)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('mousemove', onMove)
  })

  return { undoChordArmed }
}
```

（`armUndoChord`/`clearUndoChord`/KONAMI/`handleKeyPress` 主体均为逐字搬移，此处省略的部分按 Game.vue 现文照抄；省略仅为版面，执行时必须完整搬入。）

- [ ] **Step 2: 接入 Game.vue**

- 删除：`mouseX/mouseY`（保留 flashlight 两个 ref）、chord 整段、KONAMI 整段、`handleKeyPress`、onMounted/onUnmounted 里 keydown 的注册注销。
- `onMove` 改为只更新 flashlight：

```ts
const onMove = (event: MouseEvent) => {
  flashlightX.value = event.clientX
  flashlightY.value = event.clientY
}
```

- 加：

```ts
import { useGameKeyboard } from '@/arkham/composables/useGameKeyboard'

const { undoChordArmed } = useGameKeyboard({
  enabled: () => !filingBug.value,
  game,
  playerId,
  choices,
  choose,
  actionMap,
  undo,
  undoActionStart,
  undoTurnStart,
  undoPhaseStart,
  undoRoundStart,
  canUndoAction,
  canUndoTurn,
  canUndoPhase,
  canUndoRound,
  canUndoScenario,
  openUndoScenarioDialog: () => undoScenarioDialog.value?.showModal(),
  toggleShortcuts: () => (showShortcuts.value = !showShortcuts.value),
  toggleDebug: () => debug.toggle(),
})
```

- [ ] **Step 3: 验证 + 提交**

```bash
npm run tc && npx vitest run
```
手动：空格跳触发、d 抽牌、r 拿资源、e 结束回合、u / U+A / U+S、? 面板、D 调试开关、Konami 码、bug 表单打开时快捷键失效。

```bash
git add frontend/src/arkham/composables/useGameKeyboard.ts frontend/src/arkham/views/Game.vue
git commit -m "Extract useGameKeyboard from Game.vue"
```

---

### Task 9: 终验与收尾

**Files:**
- Modify: `frontend/src/arkham/views/Game.vue`（仅清理）

- [ ] **Step 1: 核对 Game.vue 终态**

预期 `<script setup>` 只剩下（按序核对，发现漏删的搬移残留就删）：
props、`debug/emitter/router/store/userStore/useMenu`、flashlight、`store.fetchCards()`、`playabilityInfo`、`showLog/showShortcuts/showSettings/showHistory/showSidebar/solo?`（solo 来自 socket）、`showOtherPlayersHands` + watch、`filingBug/submittingBug/bugInitialDescription` + `fileBug/openBugReport/fileBugFromError`、`useDeviceLayout` + `sheetTap`/tapIntercept + `confirmSheetAction`、`modals/socket/undoCtl/keyboard/provideGameContext` 的装配、`addEntry` 两个、`actionMap`、`choices`、`gameOver/question/realityAcidLightActive/cards` computed、`toggleSidebar`、`confirmUndoScenario`、`undoScenarioDialog`、生命周期钩子。

```bash
wc -l src/arkham/views/Game.vue
```
预期 ≈ 900–1100 行（从 2898 降下来；剩余大头是布局模板与未拆样式）。

- [ ] **Step 2: 全套验证**

```bash
npm run tc && npx vitest run && npm run lint && npm run build
```
预期全部通过（lint 若报既有无关警告，与 main 对比确认非新增）。

- [ ] **Step 3: 桌面全流程手动回归（硬约束）**

dev server + 真实游玩一遍：
1. 开新局 → MultiplayerLobby → 开始
2. 调查/移动/打牌/技能检定/混乱袋
3. 遭遇卡揭示弹层、塔罗（debug 触发亦可）
4. u / U+A / U+T / U+P / U+R / U+S 全级撤销
5. game-bar 全菜单、设置、历史、战役日志、侧边栏
6. 快捷键全套 + Konami
7. bug 表单两个入口
8. 旁观模式打开另一局
9. 触屏模拟（Playwright iPhone viewport）：CardActionSheet 两步交互仍正常（uiLock/sheetTap 联动未被破坏）

- [ ] **Step 4: 提交收尾清理（如有）并更新记忆**

如 Step 1–3 产生清理 diff：

```bash
git add frontend/src/arkham/views/Game.vue
git commit -m "Slim down Game.vue after extraction"
```

更新 `memory/mobile-adaptation-progress.md`：Phase 3 完成、新 composable/组件清单、Phase 4（手机 shell）为下一步。

---

## Self-Review 记录

- **Spec 覆盖**：spec §3 四项——`useGameSocket`（Task 4）✓、`useGameModals`（Task 2）✓、各模态独立组件（Task 3/6）✓、Game.vue 变薄壳（Task 5/7/8/9）✓。桌面回归硬约束（spec §验证方式）落在每个 Task 的验证步骤与 Task 9。
- **超出 spec 的扩展**：`useGameUndo`/`useGameKeyboard`/`provideGameContext`/`GameBar`——服务于"薄壳"目标且手机 shell 直接复用（undo/provides 必需；keyboard/GameBar 桌面专属，抽走后 shell 切换才干净）。
- **类型一致性**：`GameModals`/`GameSocket` 类型由 `ReturnType` 导出，Task 4/5 的 opts 引用与 Task 2/4 返回值字段一一对齐（`uiLock/showGameCard/showGameCardOnly/showTarot/showSilence/resetForUndo`；`setGameQuestion/clearResultQueue/processing/game`）。
- **已知风险**：① `useWebSocket` 在 composable 内调用时机与原一致（setup 同步段）；② `debug.active` 的 ref/属性形态需在 Task 5 实地确认；③ tarot 测试数据字段需对 `TarotCard.ts` 校准。均已在对应步骤标注。
