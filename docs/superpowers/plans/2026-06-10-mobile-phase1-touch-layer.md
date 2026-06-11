# 移动端第一阶段：设备模型 + 触控交互层 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现统一设备模型 `useDeviceLayout`，以及触控交互层（CardActionSheet 两步交互、地图 pinch-to-zoom、safe-area/热区修缮），使平板（桌面布局 + 触控）基本可玩。

**Architecture:** 设备检测收敛为单一 composable（触控能力 × 屏幕尺寸两轴）。触屏「图像两步、文字按钮一步」通过 document 捕获阶段的 click 拦截器实现——零侵入现有几十个组件的 `choose` 事件流，确认后程序化重放 click。pinch 缩放复用 `Scenario.vue` 已有的 `locationsZoom` + pointer-event 基建。

**Tech Stack:** Vue 3 Composition API、TypeScript、vitest + jsdom（本计划新增，仓库目前零测试）、vue-i18n。

**上下文（执行者必读）:**
- 工作目录：前端代码在 `frontend/`，所有 npm 命令在 `frontend/` 下执行。
- 本仓库规则：**只提交代码**，本计划/设计文档不提交。
- git 身份：提交前确认 `git config user.email` 是 `llwwbb7@gmail.com`（全局是公司邮箱，本仓库应有 local 覆盖）。
- 分支：在 `zh` 分支上新建 `feature/mobile-touch-layer`，完成后 merge 回 `zh`（仓库惯例：永远 merge、从不 rebase）。
- 设计 spec：`docs/superpowers/specs/2026-06-10-mobile-friendly-design.md`。
- 现有交互模式：可交互元素统一用 `*--can-interact` 或 `can-interact` class 标记（如 `card--can-interact`、`location--can-interact`），点击 `$emit('choose', index)` 逐层冒泡到 `Game.vue` 发给后端。文字按钮（`AbilityButton.vue` 渲染 `<button class="button">`、`Question.vue` 的选项按钮）不在拦截范围。
- 样式约定：仓库刚迁移到 CSS `@layer`（commit 8a098bccb）。本计划新增的覆盖样式**不放进 layer**（unlayered 优先级高于 layered，正好用于触控覆盖）。

---

### Task 0: 分支与环境准备

**Files:** 无代码改动

- [ ] **Step 1: 确认 git 身份与分支**

```bash
cd /Users/siwei/project/ArkhamHorror
git config user.email   # 期望: llwwbb7@gmail.com
git checkout zh && git pull origin zh
git checkout -b feature/mobile-touch-layer
```

- [ ] **Step 2: 确认前端可启动**

```bash
cd frontend && npm install && npm run tc
```
Expected: vue-tsc 通过，无类型错误。

---

### Task 1: vitest 测试设施

仓库目前没有任何前端测试。本任务搭最小测试设施：vitest + jsdom。

**Files:**
- Create: `frontend/vitest.config.ts`
- Modify: `frontend/package.json`（scripts + devDependencies）

- [ ] **Step 1: 安装依赖**

```bash
cd frontend && npm install -D vitest jsdom
```

- [ ] **Step 2: 创建 vitest 配置**

`frontend/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 3: 加 npm script**

`frontend/package.json` 的 `scripts` 中加：

```json
"test": "vitest run",
```

- [ ] **Step 4: 验证设施工作**

```bash
npm run test
```
Expected: `No test files found`（退出码非 0 没关系，说明 vitest 本身已能运行）。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add vitest test infrastructure"
```

---

### Task 2: useDeviceLayout 设备模型

两轴模型：`isTouch`（hover/pointer 媒体查询）× `size`（phone ≤800px / tablet / desktop）。替换两套矛盾检测：`isMobile.ts`（宽度 resize 监听）改为薄包装保持 API 兼容；`CardOverlay.vue` 内部 mq 迁移过来。

**Files:**
- Create: `frontend/src/arkham/composables/useDeviceLayout.ts`
- Test: `frontend/src/arkham/composables/useDeviceLayout.spec.ts`
- Modify: `frontend/src/arkham/isMobile.ts`（整文件重写为薄包装）
- Modify: `frontend/src/arkham/components/CardOverlay.vue:55,162-166`

- [ ] **Step 1: 写失败测试**

`frontend/src/arkham/composables/useDeviceLayout.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeviceLayout, _resetForTests, TOUCH_QUERY, PHONE_QUERY } from './useDeviceLayout'

type Listener = (e: { matches: boolean }) => void

function mockMatchMedia(initial: Record<string, boolean>) {
  const listeners = new Map<string, Listener[]>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: initial[query] ?? false,
      addEventListener: (_event: string, cb: Listener) => {
        listeners.set(query, [...(listeners.get(query) ?? []), cb])
      },
    })),
  )
  return {
    fire(query: string, matches: boolean) {
      for (const cb of listeners.get(query) ?? []) cb({ matches })
    },
  }
}

describe('useDeviceLayout', () => {
  beforeEach(() => {
    _resetForTests()
    vi.unstubAllGlobals()
  })

  it('窄屏 → phone，shell 为 phone', () => {
    mockMatchMedia({ [PHONE_QUERY]: true, [TOUCH_QUERY]: true })
    const { size, shell } = useDeviceLayout()
    expect(size.value).toBe('phone')
    expect(shell.value).toBe('phone')
  })

  it('宽屏 + 触控 → tablet，shell 为 desktop', () => {
    mockMatchMedia({ [PHONE_QUERY]: false, [TOUCH_QUERY]: true })
    const { size, shell, isTouch } = useDeviceLayout()
    expect(size.value).toBe('tablet')
    expect(shell.value).toBe('desktop')
    expect(isTouch.value).toBe(true)
  })

  it('宽屏 + 鼠标 → desktop', () => {
    mockMatchMedia({ [PHONE_QUERY]: false, [TOUCH_QUERY]: false })
    const { size, isTouch } = useDeviceLayout()
    expect(size.value).toBe('desktop')
    expect(isTouch.value).toBe(false)
  })

  it('媒体查询变化时响应式更新', () => {
    const mq = mockMatchMedia({ [PHONE_QUERY]: false, [TOUCH_QUERY]: false })
    const { size } = useDeviceLayout()
    expect(size.value).toBe('desktop')
    mq.fire(PHONE_QUERY, true)
    expect(size.value).toBe('phone')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/arkham/composables/useDeviceLayout.spec.ts
```
Expected: FAIL — `Cannot find module './useDeviceLayout'`。

- [ ] **Step 3: 实现 composable**

`frontend/src/arkham/composables/useDeviceLayout.ts`:

```ts
import { computed, ref, type Ref } from 'vue'

export type DeviceSize = 'phone' | 'tablet' | 'desktop'

export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'
export const PHONE_QUERY = '(max-width: 800px)'

// 模块级单例：全应用共享一份媒体查询监听，任意位置可调用（不依赖组件生命周期）。
const isTouchState = ref(false)
const isPhoneWidth = ref(false)
let installed = false

function track(query: string, target: Ref<boolean>) {
  const mq = window.matchMedia(query)
  target.value = mq.matches
  mq.addEventListener('change', (e) => (target.value = e.matches))
}

function ensureInstalled() {
  if (installed || typeof window === 'undefined') return
  installed = true
  track(TOUCH_QUERY, isTouchState)
  track(PHONE_QUERY, isPhoneWidth)
}

export function useDeviceLayout() {
  ensureInstalled()
  const size = computed<DeviceSize>(() =>
    isPhoneWidth.value ? 'phone' : isTouchState.value ? 'tablet' : 'desktop',
  )
  return {
    isTouch: computed(() => isTouchState.value),
    size,
    shell: computed<'phone' | 'desktop'>(() => (size.value === 'phone' ? 'phone' : 'desktop')),
  }
}

export function _resetForTests() {
  installed = false
  isTouchState.value = false
  isPhoneWidth.value = false
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/arkham/composables/useDeviceLayout.spec.ts
```
Expected: 4 passed。

- [ ] **Step 5: isMobile.ts 改为薄包装（API 不变，8 个调用点零改动）**

`frontend/src/arkham/isMobile.ts` 整文件替换为：

```ts
import { computed } from 'vue'
import { useDeviceLayout } from '@/arkham/composables/useDeviceLayout'

// 兼容包装：语义不变（视口宽度 ≤ 800px）。新代码请直接用 useDeviceLayout。
export function IsMobile() {
  const { size } = useDeviceLayout()
  return { isMobile: computed(() => size.value === 'phone') }
}
```

注意：旧实现依赖 `onMounted`/`onUnmounted`（只能在 setup 中调用），新实现无生命周期依赖，所有现有调用点（均在 setup 中）行为不变。

- [ ] **Step 6: CardOverlay.vue 迁移内部检测**

`frontend/src/arkham/components/CardOverlay.vue`，删除第 55 行：

```ts
const isMobile = ref(false)
```

删除第 162–166 行：

```ts
const mq = window.matchMedia('(hover: none) and (pointer: coarse)')
const updateIsMobile = () => (isMobile.value = mq.matches)
updateIsMobile()
onMounted(() => mq.addEventListener?.('change', updateIsMobile))
onUnmounted(() => mq.removeEventListener?.('change', updateIsMobile))
```

在 import 区加：

```ts
import { useDeviceLayout } from '@/arkham/composables/useDeviceLayout'
```

在原第 55 行位置加（模板里 `:class="{ ..., isMobile }"` 对 ComputedRef 自动解包，无需改模板）：

```ts
const { isTouch: isMobile } = useDeviceLayout()
```

注意检查删除后 `onMounted`/`onUnmounted`/`ref` import 是否仍被其他代码使用，未使用则从 import 中移除。

- [ ] **Step 7: 类型检查 + 全量测试**

```bash
npm run tc && npm run test
```
Expected: 均通过。

- [ ] **Step 8: 手动冒烟（开发服已跑在 :8080 的话）**

Chrome DevTools 设备模拟 iPhone：打开一局游戏，确认手牌仍是底部抽屉（isMobile 行为未变）；触屏模拟下长按卡牌仍出预览（CardOverlay isTouch 生效）。

- [ ] **Step 9: Commit**

```bash
git add src/arkham/composables/useDeviceLayout.ts src/arkham/composables/useDeviceLayout.spec.ts src/arkham/isMobile.ts src/arkham/components/CardOverlay.vue
git commit -m "Add useDeviceLayout composable unifying device detection"
```

---

### Task 3: 触屏 tap 拦截模块

「图像两步、文字按钮一步」的核心：document 捕获阶段拦截可交互图像元素的 click，交给上层（Task 5 的 CardActionSheet）展示；确认后程序化重放 click 放行。纯 DOM 模块，不碰任何组件。

**Files:**
- Create: `frontend/src/arkham/touchTapIntercept.ts`
- Test: `frontend/src/arkham/touchTapIntercept.spec.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/arkham/touchTapIntercept.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTapIntercept, type TapIntercept, type InterceptedTap } from './touchTapIntercept'

describe('installTapIntercept', () => {
  let intercept: TapIntercept | null = null
  let isTouch = true
  let intercepted: InterceptedTap[] = []

  beforeEach(() => {
    document.body.innerHTML = ''
    isTouch = true
    intercepted = []
    intercept = installTapIntercept({
      isTouch: () => isTouch,
      onIntercept: (tap) => intercepted.push(tap),
    })
  })

  afterEach(() => {
    intercept?.uninstall()
    intercept = null
  })

  function makeCard(className: string): { el: HTMLElement; onClick: ReturnType<typeof vi.fn> } {
    const el = document.createElement('img')
    el.className = className
    const onClick = vi.fn()
    el.addEventListener('click', onClick)
    document.body.appendChild(el)
    return { el, onClick }
  }

  it('触屏下拦截可交互卡牌的 click，不触发原 handler', () => {
    const { el, onClick } = makeCard('card card--can-interact')
    el.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(intercepted).toHaveLength(1)
    expect(intercepted[0].target).toBe(el)
    expect(intercepted[0].actionable).toBe(true)
  })

  it('approve 后重放 click，原 handler 执行一次', () => {
    const { el, onClick } = makeCard('card card--can-interact')
    el.click()
    intercept!.approve(intercepted[0])
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('非触屏不拦截', () => {
    isTouch = false
    const { el, onClick } = makeCard('card card--can-interact')
    el.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)
  })

  it('plain can-interact class（如牌堆）也拦截', () => {
    const { el, onClick } = makeCard('can-interact')
    el.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(intercepted[0].actionable).toBe(true)
  })

  it('文字按钮不拦截（一步直达）', () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'card-wrapper asset--can-interact'
    const button = document.createElement('button')
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    wrapper.appendChild(button)
    document.body.appendChild(wrapper)
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)
  })

  it('非交互卡牌图像拦截为纯预览（actionable=false）', () => {
    const { el, onClick } = makeCard('card')
    el.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(intercepted[0].actionable).toBe(false)
  })

  it('no-overlay 卡牌不拦截', () => {
    const { onClick } = makeCard('card no-overlay')
    document.body.querySelector('img')!.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/arkham/touchTapIntercept.spec.ts
```
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现模块**

`frontend/src/arkham/touchTapIntercept.ts`:

```ts
// 触屏「图像两步、文字按钮一步」拦截器。
// 在 document 捕获阶段拦截可交互图像元素的 click（Vue 的 @click 绑定在元素自身，
// 捕获阶段 stopPropagation 即可阻断），交由 CardActionSheet 预览；
// approve() 程序化重放 click 放行一次。

// 可交互标记：仓库统一用 `*--can-interact`（card/location/enemy/asset…）或 plain `can-interact`（牌堆等）。
const ACTIONABLE_SELECTOR = '.can-interact, [class*="--can-interact"]'
// 纯预览候选：无动作的卡牌图像，tap 也应能看大图（取代不可发现的长按）。
const PREVIEW_SELECTOR = 'img.card'
// 一步直达的真实控件，永不拦截。
const PASSTHROUGH_SELECTOR = 'button, a, input, select, textarea, [role="button"]'

export interface InterceptedTap {
  /** 命中的可交互容器（或预览图像本身） */
  el: HTMLElement
  /** 原始 click 目标，approve 时对它重放 click */
  target: HTMLElement
  /** true = 有直接动作需确认；false = 纯预览 */
  actionable: boolean
}

export interface TapIntercept {
  approve(tap: InterceptedTap): void
  uninstall(): void
}

export function installTapIntercept(opts: {
  isTouch: () => boolean
  onIntercept: (tap: InterceptedTap) => void
}): TapIntercept {
  let approvedTarget: HTMLElement | null = null

  const onClick = (event: MouseEvent) => {
    if (!opts.isTouch()) return
    const target = event.target as HTMLElement | null
    if (!target) return
    if (approvedTarget === target) {
      approvedTarget = null
      return
    }
    if (target.closest(PASSTHROUGH_SELECTOR)) return
    if (target.closest('.no-overlay, .card-action-sheet')) return

    const actionableEl = target.closest<HTMLElement>(ACTIONABLE_SELECTOR)
    if (actionableEl) {
      event.preventDefault()
      event.stopPropagation()
      opts.onIntercept({ el: actionableEl, target, actionable: true })
      return
    }

    const previewEl = target.closest<HTMLElement>(PREVIEW_SELECTOR)
    if (previewEl) {
      event.preventDefault()
      event.stopPropagation()
      opts.onIntercept({ el: previewEl, target: previewEl, actionable: false })
    }
  }

  document.addEventListener('click', onClick, { capture: true })
  return {
    approve(tap) {
      approvedTarget = tap.target
      tap.target.click()
    },
    uninstall() {
      document.removeEventListener('click', onClick, { capture: true })
    },
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/arkham/touchTapIntercept.spec.ts
```
Expected: 7 passed。

- [ ] **Step 5: Commit**

```bash
git add src/arkham/touchTapIntercept.ts src/arkham/touchTapIntercept.spec.ts
git commit -m "Add touch tap interceptor for two-step card interaction"
```

---

### Task 4: 抽取 getCardImage 共享 helper

`CardOverlay.vue:321-343` 的 `getImage`（从任意 DOM 元素解析出卡图 URL）要被 CardActionSheet 复用，抽成共享模块。

**Files:**
- Create: `frontend/src/arkham/cardImageLookup.ts`
- Test: `frontend/src/arkham/cardImageLookup.spec.ts`
- Modify: `frontend/src/arkham/components/CardOverlay.vue:321-343`

- [ ] **Step 1: 写失败测试**

`frontend/src/arkham/cardImageLookup.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { getCardImage } from './cardImageLookup'

describe('getCardImage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('img.card 直接取 src', () => {
    const img = document.createElement('img')
    img.className = 'card'
    img.src = 'http://localhost/cards/01001.avif'
    document.body.appendChild(img)
    expect(getCardImage(img)).toBe('http://localhost/cards/01001.avif')
  })

  it('data-image-id 拼接卡图路径', () => {
    const el = document.createElement('div')
    el.dataset.imageId = '01001'
    expect(getCardImage(el)).toContain('cards/01001.avif')
  })

  it('data-target 跟随到目标元素', () => {
    const targetEl = document.createElement('div')
    targetEl.dataset.id = 'abc'
    targetEl.dataset.imageId = '01002'
    document.body.appendChild(targetEl)
    const el = document.createElement('div')
    el.dataset.target = 'abc'
    expect(getCardImage(el)).toContain('cards/01002.avif')
  })

  it('无图元素返回 null', () => {
    const el = document.createElement('div')
    expect(getCardImage(el)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/arkham/cardImageLookup.spec.ts
```
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 创建模块（逻辑从 CardOverlay 原样搬移，仅改名）**

`frontend/src/arkham/cardImageLookup.ts`:

```ts
import { imgsrc } from '@/arkham/helpers'

// 从任意 DOM 元素解析卡图 URL（原 CardOverlay.getImage 抽取而来，
// CardOverlay 与 CardActionSheet 共用）。
export const getCardImage = (el: HTMLElement, depth = 0): string | null => {
  if (depth > 3) return null // avoid runaway recursion

  if (el.dataset.imageId) return imgsrc(`cards/${el.dataset.imageId}.avif`)

  if (el instanceof HTMLImageElement && el.classList.contains('card') && !el.closest('.revelation')) {
    return el.src || null
  }

  if (el instanceof HTMLDivElement && el.classList.contains('card')) {
    const bg = el.style.backgroundImage
    if (!bg || bg === 'none') return null
    return bg.slice(4, -1).replaceAll('"', '') // strip url("...")
  }

  if (el.dataset.target) {
    const target = document.querySelector<HTMLElement>(`[data-id="${el.dataset.target}"]`)
    return target ? getCardImage(target, depth + 1) : null
  }

  return el.dataset.image ?? null
}
```

注意：若 `imgsrc` 在 jsdom 下因环境变量报错，在测试里 `vi.mock('@/arkham/helpers', () => ({ imgsrc: (p: string) => `/img/${p}` }))`。

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/arkham/cardImageLookup.spec.ts
```
Expected: 4 passed。

- [ ] **Step 5: CardOverlay.vue 改用共享模块**

删除 `CardOverlay.vue` 中整个 `getImage` 函数定义（原 321–343 行），import 区加：

```ts
import { getCardImage } from '@/arkham/cardImageLookup'
```

原 344 行的使用处改为：

```ts
const card = computed<string | null>(() => (hoveredElement.value ? getCardImage(hoveredElement.value) : null))
```

文件内其他 `getImage(` 引用（如有）一并改名为 `getCardImage(`，用 `grep -n "getImage" src/arkham/components/CardOverlay.vue` 确认清零。

- [ ] **Step 6: 类型检查 + 全量测试**

```bash
npm run tc && npm run test
```
Expected: 均通过。

- [ ] **Step 7: Commit**

```bash
git add src/arkham/cardImageLookup.ts src/arkham/cardImageLookup.spec.ts src/arkham/components/CardOverlay.vue
git commit -m "Extract getCardImage helper from CardOverlay"
```

---

### Task 5: CardActionSheet 组件与 Game.vue 接线

底部抽屉：大图预览 + 「执行动作」/「取消」按钮。挂在 `Game.vue`（`<CardOverlay />` 旁），由 Task 3 拦截器驱动。

**Files:**
- Create: `frontend/src/arkham/components/CardActionSheet.vue`
- Modify: `frontend/src/arkham/views/Game.vue`（import 区、setup、模板 `<CardOverlay />` 处）
- Modify: `frontend/src/locales/en/base.json`、`frontend/src/locales/zh/base.json`

- [ ] **Step 1: 加 i18n key**

`frontend/src/locales/en/base.json` 顶层加（注意 JSON 逗号）：

```json
"cardSheet": {
  "perform": "Perform action"
},
```

`frontend/src/locales/zh/base.json` 顶层加：

```json
"cardSheet": {
  "perform": "执行动作"
},
```

其余语言（es/fr/it/ko）缺失时回退英文，不加。

- [ ] **Step 2: 创建组件**

`frontend/src/arkham/components/CardActionSheet.vue`:

```vue
<script lang="ts" setup>
import { computed } from 'vue'
import { getCardImage } from '@/arkham/cardImageLookup'

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
  <div class="card-action-sheet-backdrop" @click.self="emit('close')">
    <div class="card-action-sheet no-overlay">
      <img v-if="image" :src="image" class="sheet-card" />
      <div class="sheet-actions">
        <button v-if="actionable" class="sheet-confirm" @click="emit('confirm')">
          {{ $t('cardSheet.perform') }}
        </button>
        <button class="sheet-cancel" @click="emit('close')">{{ $t('cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-action-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.card-action-sheet {
  width: 100%;
  max-width: 480px;
  background: var(--background, #1c1c1c);
  border-radius: 12px 12px 0 0;
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
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

- [ ] **Step 3: Game.vue 接线**

`frontend/src/arkham/views/Game.vue` import 区加：

```ts
import CardActionSheet from '@/arkham/components/CardActionSheet.vue'
import { useDeviceLayout } from '@/arkham/composables/useDeviceLayout'
import {
  installTapIntercept,
  type InterceptedTap,
  type TapIntercept,
} from '@/arkham/touchTapIntercept'
```

setup 中（`const { t } = useI18n()` 附近）加：

```ts
const { isTouch } = useDeviceLayout()
const sheetTap = ref<InterceptedTap | null>(null)
let tapIntercept: TapIntercept | null = null

onMounted(() => {
  tapIntercept = installTapIntercept({
    isTouch: () => isTouch.value,
    onIntercept: (tap) => {
      // 纯预览但解析不出卡图时不弹空面板
      if (!tap.actionable && !getCardImage(tap.target)) return
      // 关掉长按预览浮层，避免两层叠加
      document.dispatchEvent(new Event('arkham:clear-card-overlay'))
      sheetTap.value = tap
    },
  })
})

onUnmounted(() => {
  tapIntercept?.uninstall()
  tapIntercept = null
})

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

并在 import 区补：

```ts
import { getCardImage } from '@/arkham/cardImageLookup'
```

（`onMounted`/`onUnmounted`/`watch`/`ref` 已在 Game.vue 的 vue import 里。）

模板中 `<CardOverlay />`（1169 行附近）后加：

```html
    <CardActionSheet
      v-if="sheetTap"
      :target="sheetTap.target"
      :actionable="sheetTap.actionable"
      @confirm="confirmSheetAction"
      @close="sheetTap = null"
    />
```

- [ ] **Step 4: 类型检查**

```bash
npm run tc
```
Expected: 通过。

- [ ] **Step 5: 手动验证（核心交互，务必走完）**

`make api.watch`（后端已跑则跳过）+ `npm run dev`，Chrome DevTools 设备模拟 iPhone（触屏模式），开一局：

1. tap 高亮（可交互）手牌 → 弹底部面板，显示大图 +「执行动作」+「取消」
2. 点「执行动作」→ 卡牌动作真正执行（与桌面点击等效）
3. 点「取消」或背景 → 面板关闭，无动作发生
4. tap 无动作的在场卡牌 → 纯预览面板（无「执行动作」按钮）
5. 文字按钮（能力按钮、选项列表、「继续」）→ 单步直达，不弹面板
6. 桌面模式（关闭触屏模拟）→ 一切如旧，hover 预览、单击执行

- [ ] **Step 6: Commit**

```bash
git add src/arkham/components/CardActionSheet.vue src/arkham/views/Game.vue src/locales/en/base.json src/locales/zh/base.json
git commit -m "Add CardActionSheet two-step touch interaction"
```

---

### Task 6: 地图 pinch-to-zoom

`Scenario.vue` 已有 `locationsZoom`（transform: scale 驱动）与 pointer-event 基建。补双指捏合：纯函数 `pinchedZoom` 算缩放值（可测），`usePinchZoom` 负责 DOM 接线。不做捏合中心锚定（跟随 transform-origin），体验不佳再作为后续优化。

**Files:**
- Create: `frontend/src/arkham/composables/usePinchZoom.ts`
- Test: `frontend/src/arkham/composables/usePinchZoom.spec.ts`
- Modify: `frontend/src/arkham/components/Scenario.vue`（setup 接线 + `.location-cards-scroller` 的 `touch-action`，约 2350 行）

- [ ] **Step 1: 写失败测试（纯函数部分）**

`frontend/src/arkham/composables/usePinchZoom.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pinchedZoom } from './usePinchZoom'

describe('pinchedZoom', () => {
  it('双指距离比例缩放', () => {
    expect(pinchedZoom(1, 100, 200)).toBe(2)
    expect(pinchedZoom(2, 200, 100)).toBe(1)
  })

  it('夹在 [0.25, 6] 区间', () => {
    expect(pinchedZoom(1, 100, 1000)).toBe(6)
    expect(pinchedZoom(0.3, 100, 10)).toBe(0.25)
  })

  it('初始距离为 0 时返回原值', () => {
    expect(pinchedZoom(1.5, 0, 100)).toBe(1.5)
  })

  it('保留三位小数', () => {
    expect(pinchedZoom(1, 300, 100)).toBe(0.333)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/arkham/composables/usePinchZoom.spec.ts
```
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现**

`frontend/src/arkham/composables/usePinchZoom.ts`:

```ts
import { onUnmounted, watch, type Ref } from 'vue'

// 区间与缩放滑杆一致（Scenario.vue zoom-slider: min 0.25 / max 6）。
export function pinchedZoom(
  initialZoom: number,
  initialDistance: number,
  currentDistance: number,
  min = 0.25,
  max = 6,
): number {
  if (initialDistance <= 0) return initialZoom
  const next = initialZoom * (currentDistance / initialDistance)
  return Math.min(max, Math.max(min, parseFloat(next.toFixed(3))))
}

// 双指捏合驱动 zoom ref。pointerdown 绑在目标元素上，move/up 绑在 window
// （与 Scenario 的地点拖拽同一模式），手指滑出元素也不丢事件。
export function usePinchZoom(target: Ref<HTMLElement | null>, zoom: Ref<number>) {
  const pointers = new Map<number, { x: number; y: number }>()
  let initialDistance = 0
  let initialZoom = 1

  const currentDistance = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 2) {
      initialDistance = currentDistance()
      initialZoom = zoom.value || 1
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerEnd)
      window.addEventListener('pointercancel', onPointerEnd)
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 2 && initialDistance > 0) {
      zoom.value = pinchedZoom(initialZoom, initialDistance, currentDistance())
    }
  }

  const onPointerEnd = (e: PointerEvent) => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) {
      initialDistance = 0
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
    }
  }

  watch(
    target,
    (el, _old, onCleanup) => {
      if (!el) return
      el.addEventListener('pointerdown', onPointerDown)
      onCleanup(() => el.removeEventListener('pointerdown', onPointerDown))
    },
    { immediate: true },
  )

  onUnmounted(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerEnd)
    window.removeEventListener('pointercancel', onPointerEnd)
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run src/arkham/composables/usePinchZoom.spec.ts
```
Expected: 4 passed。

- [ ] **Step 5: Scenario.vue 接线**

import 区加：

```ts
import { usePinchZoom } from '@/arkham/composables/usePinchZoom'
```

setup 中（`scrollerRef` 与 `locationsZoom` 都已定义之后，如 509 行 `IsMobile()` 附近）加：

```ts
usePinchZoom(scrollerRef, locationsZoom)
```

`.location-cards-scroller` 样式（约 2350 行）中：

```css
touch-action: manipulation;
```

改为（`manipulation` 允许浏览器自己消费双指捏合去缩放页面，必须收紧为仅平移，捏合才会以 pointer 事件交给我们）：

```css
touch-action: pan-x pan-y;
```

- [ ] **Step 6: 类型检查 + 手动验证**

```bash
npm run tc
```

Chrome DevTools 设备模拟（触屏）开一局：双指捏合地图 → 平滑缩放，区间 0.25–6；单指拖动 → 仍正常平移滚动；双击缩放 → 仍工作。真机（iPhone/iPad Safari）同样手势确认页面本身不被捏合缩放。

- [ ] **Step 7: Commit**

```bash
git add src/arkham/composables/usePinchZoom.ts src/arkham/composables/usePinchZoom.spec.ts src/arkham/components/Scenario.vue
git commit -m "Add pinch-to-zoom for location map on touch devices"
```

---

### Task 7: safe-area insets 与 100dvh 修缮

刘海屏/home bar 适配。`viewport-fit=cover` 让页面延伸进安全区，再用 `env(safe-area-inset-*)` 给贴边元素留白。游戏内的 `100vh` 换 `100dvh`（移动端地址栏伸缩时 vh 不准）。

**Files:**
- Modify: `frontend/index.html:6`
- Modify: `frontend/src/arkham/components/Player.vue`（`.hand-area-IsMobile`，约 956 行）
- Modify: `frontend/src/arkham/components/GameLog.vue:58`
- Modify: `frontend/src/arkham/components/StoryQuestion.vue:338`
- Modify: `frontend/src/arkham/views/Game.vue`（`.sidebar` 移动端分支，约 1827 行）

- [ ] **Step 1: viewport meta**

`frontend/index.html:6`:

```html
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover">
```

- [ ] **Step 2: 手牌抽屉避开 home bar**

`Player.vue` 的 `.hand-area-IsMobile` 规则块（约 956 行）内加一行：

```css
padding-bottom: env(safe-area-inset-bottom, 0px);
```

- [ ] **Step 3: 侧边栏抽屉避开 home bar**

`Game.vue` 的 `.sidebar` 内 `@media (max-width: 800px)` 分支（约 1827–1838 行）加一行：

```css
padding-bottom: env(safe-area-inset-bottom, 0px);
```

- [ ] **Step 4: vh → dvh**

- `GameLog.vue:58`: `height: calc(100vh - 60px);` → `height: calc(100dvh - 60px);`
- `StoryQuestion.vue:338`: `height: 100vh;` → `height: 100dvh;`

（`DeckList.vue`/`Cards.vue`/`Admin` 等游戏外页面不在本阶段范围。）

- [ ] **Step 5: 手动验证 + 类型检查**

```bash
npm run tc
```

Chrome DevTools 模拟 iPhone 14 Pro（有安全区）：手牌抽屉与侧边栏底部不被 home bar 遮挡；游戏日志高度随地址栏伸缩正确。

- [ ] **Step 6: Commit**

```bash
git add index.html src/arkham/components/Player.vue src/arkham/components/GameLog.vue src/arkham/components/StoryQuestion.vue src/arkham/views/Game.vue
git commit -m "Add safe-area insets and dvh units for mobile game UI"
```

---

### Task 8: 触控热区修缮

触控目标最小 44px（Apple HIG）。集中一段 unlayered `@media (pointer: coarse)` 覆盖（仓库样式已用 `@layer`，unlayered 优先级天然更高，正好做触控覆盖）。

**Files:**
- Modify: `frontend/src/styles/components.css`（文件末尾追加）

- [ ] **Step 1: 追加触控热区规则**

`frontend/src/styles/components.css` 末尾追加：

```css
/* 触控热区：触屏下交互控件最小 44px（Apple HIG）。
   故意不放进 @layer——unlayered 规则优先级高于所有 layer，确保覆盖生效。 */
@media (pointer: coarse) {
  .game-bar button {
    min-height: 44px;
  }

  /* AbilityButton 及其他 .button 通用按钮 */
  button.button {
    min-height: 40px;
    padding-block: 6px;
  }

  /* 手牌抽屉关闭按钮 */
  .hand-close-button {
    min-width: 44px;
    min-height: 44px;
  }
}
```

- [ ] **Step 2: 手动验证**

触屏模拟下检查：game-bar 按钮、卡牌能力按钮、手牌关闭按钮可轻松点中；桌面（细指针)样式不变。若发现 game-bar 按钮变高后小屏溢出，在同一 media block 中给 `.game-bar` 加 `flex-wrap: wrap;`。

- [ ] **Step 3: Commit**

```bash
git add src/styles/components.css
git commit -m "Increase touch target sizes for coarse pointers"
```

---

### Task 9: 收尾验证

**Files:** 无新改动（只验证）

- [ ] **Step 1: 全量检查**

```bash
cd frontend && npm run test && npm run tc && npm run lint
```
Expected: 全部通过（lint 如有本计划文件的告警则修复）。

- [ ] **Step 2: 桌面回归（硬约束：桌面零回归）**

非触屏正常浏览器开一局走完整流程：开局 → hover 预览卡牌 → 单击打牌 → 调查/移动 → 过回合 → 撤销。所有行为与改动前一致。

- [ ] **Step 3: 触屏全流程**

设备模拟 iPhone（竖屏）+ iPad（横屏）各走一遍 Task 5 Step 5 的 6 项检查 + pinch 缩放 + safe-area。真机可用时优先真机。

- [ ] **Step 4: 合并回 zh**

确认用户验收后：

```bash
git checkout zh
git merge feature/mobile-touch-layer
git push origin zh
```

---

## Spec 覆盖对照（自查）

| Spec 要求 | Task |
|---|---|
| §1 useDeviceLayout 两轴模型、替换两套检测 | Task 2 |
| §2a 图像两步（拦截 + CardActionSheet）、文字按钮一步、无动作卡 tap 预览、长按保留 | Task 3 + 5（长按路径未动，自然保留） |
| §2b pinch-to-zoom、双击缩放保留 | Task 6 |
| §2c safe-area / dvh / 热区 | Task 7 + 8 |
| 桌面零回归 | 每个任务的验证步 + Task 9 |
| AbilityMenu 合并进面板（spec 2a） | **本阶段不做**：能力按钮已是文字按钮（一步直达），合并进面板属于手机 shell 阶段的体验优化，YAGNI |
| 地点移动两步规则可调点 | 默认两步（拦截器统一覆盖），实测后再调 |
