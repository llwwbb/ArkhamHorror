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
    m.showTarot([{ arcana: 'TheFool0', facing: 'Upright', scope: { tag: 'GlobalTarot' } }] as unknown as string)
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
