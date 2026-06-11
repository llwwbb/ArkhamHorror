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
  'GameCardOnly',
)

// uiLock 协议：show* 立即上锁（异步解码期间挡住后续 UI 结果），解码失败回滚；
// 排队（锁住时 qPush）由调用方负责，见 useGameSocket 的 handleResult 与 drain watcher。
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
