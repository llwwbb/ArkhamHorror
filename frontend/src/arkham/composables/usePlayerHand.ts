import { computed } from 'vue'
import * as CardT from '@/arkham/types/Card'
import { toCardContents } from '@/arkham/types/Card'
import type { Game } from '@/arkham/types/Game'
import type { Investigator } from '@/arkham/types/Investigator'
import type { Modifier } from '@/arkham/types/Modifier'

// 手牌相关派生状态（Player.vue 桌面手牌区 / 手机 shell 手牌抽屉共用）
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
    const onlyCountFirstCopy = opts
      .investigator()
      .modifiers?.some(
        (m: Modifier) =>
          m.type.tag === 'OtherModifier' &&
          m.type.contents === 'OnlyFirstCopyCardCountsTowardMaximumHandSize',
      )

    const sizeModifiers: Record<string, number> = opts.game().modifiers.reduce((a, m) => {
      if (m[1][0].type?.tag === 'HandSizeCardCount') {
        if (m[0].tag === 'CardIdTarget') {
          if (typeof m[0].contents === 'string') {
            return { ...a, [m[0].contents]: m[1][0].type.contents }
          }
        }
      }
      return a
    }, {})

    // if onlyCountFirstCopy is true, we need to filter the hand to only count the first copy of each card
    const hand = onlyCountFirstCopy
      ? playerHand.value.filter((c, i) => {
          return playerHand.value.findIndex((cc) => CardT.asCardCode(cc) === CardT.asCardCode(c)) === i
        })
      : playerHand.value

    const playerHandSize = hand.reduce((a, c) => {
      return a + (sizeModifiers[toCardContents(c).id] ?? 1)
    }, 0)

    const treacheryHandSize = inHandTreacheries.value.reduce((a, c) => {
      return a + (sizeModifiers[c.cardId] ?? 1)
    }, 0)

    const enemyHandSize = inHandEnemies.value.reduce((a, c) => {
      return a + (sizeModifiers[c.cardId] ?? 1)
    }, 0)

    return playerHandSize + treacheryHandSize + enemyHandSize
  })

  const actualHandSize = computed(() => {
    return playerHand.value.length + inHandTreacheries.value.length + inHandEnemies.value.length
  })

  const handSizeClasses = computed(() => ({
    'hand-size-ok': (opts.investigator().handSize ?? 8) > totalHandSize.value,
    'hand-size-warn': (opts.investigator().handSize ?? 8) == totalHandSize.value,
    'hand-size-alert': (opts.investigator().handSize ?? 8) < totalHandSize.value,
  }))

  return { playerHand, inHandEnemies, inHandTreacheries, totalHandSize, actualHandSize, handSizeClasses }
}
