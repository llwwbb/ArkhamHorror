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
  provide('scenarioSpecificAnswer', socket.scenarioSpecificAnswer)
  provide('switchInvestigator', socket.switchInvestigator)
  provide('solo', socket.solo)
  provide('skipAllTriggers', socket.skipAllTriggers)
  provide('skipAllAvailable', socket.skipAllAvailable)
  provide('showOtherPlayersHands', showOtherPlayersHands)

  return { choicesByPlayer, gameIndexes }
}
