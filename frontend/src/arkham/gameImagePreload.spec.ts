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

  it('onerror 也标记为已加载（不无限重试），且 promise 仍 resolve（不 reject）', async () => {
    class ErrorImage extends FakeImage {
      set src(value: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', ErrorImage)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 预加载失败不应让 promise reject（否则会阻塞/报错），只 console.warn
    await expect(
      loadAllGameImages(fakeGame({ a: { cardCode: 'c01001', isFlipped: false } })),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not preload'))
    warn.mockRestore()
    FakeImage.created = []
    vi.stubGlobal('Image', FakeImage)
    await loadAllGameImages(fakeGame({ a: { cardCode: 'c01001', isFlipped: false } }))
    expect(FakeImage.created).toHaveLength(0) // 错误的也进了 preloaded 集合
  })
})
