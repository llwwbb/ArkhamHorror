import { describe, expect, it } from 'vitest'
import { usePlayerHand } from './usePlayerHand'
import type { Card } from '@/arkham/types/Card'
import type { Game } from '@/arkham/types/Game'
import type { Investigator } from '@/arkham/types/Investigator'

// 最小假数据：只填 usePlayerHand 实际读取的字段
const card = (id: string, code = 'c1') =>
  ({ tag: 'PlayerCard', contents: { id, cardCode: code } }) as unknown as Card

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
    expect(
      h.playerHand.value.map((c) => (c as unknown as { contents: { id: string } }).contents.id),
    ).toEqual(['b'])
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
