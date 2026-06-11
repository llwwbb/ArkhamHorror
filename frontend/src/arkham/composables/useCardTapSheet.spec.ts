import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createApp, defineComponent, h, shallowRef, nextTick, type App, type ShallowRef } from 'vue'
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

let apps: App[] = []

afterEach(() => {
  apps.forEach((a) => {
    try {
      a.unmount()
    } catch {
      // 已被用例自行卸载，忽略
    }
  })
  apps = []
})

// 无 @vue/test-utils：用 createApp 宿主组件驱动生命周期
function mountWith(game: ShallowRef<Arkham.Game | null>) {
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
  apps.push(app)
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
