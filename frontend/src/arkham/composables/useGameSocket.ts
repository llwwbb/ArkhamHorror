import { computed, ref, shallowRef, watch } from 'vue'
import { useWebSocket } from '@vueuse/core'
import confetti from '@/effects/confetti'
import { fetchGame } from '@/arkham/api'
import { useUserStore } from '@/stores/user'
import * as Arkham from '@/arkham/types/Game'
import * as ArkhamGame from '@/arkham/types/Game'
import * as Message from '@/arkham/types/Message'
import type { Question } from '@/arkham/types/Question'
import { preloadGameImages } from '@/arkham/gameImagePreload'
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
  const qPush = (x: any) => {
    resultQueue.value.push(x)
  }
  const qPop = () => {
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
              // eslint-disable-next-line no-var -- 原 Game.vue 逐字搬运（.vue 不查 no-var）
              var count = 500
              // eslint-disable-next-line no-var
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

  // Socket Handling
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

  // 排空结果队列：uiLock 锁住时 handleResult 各分支把结果 qPush 入队，
  // 解锁后这里按序重放。若重放中某条结果再次上锁（modals.show* 是同步上锁）
  // 就立即 break，剩余队列原地保留，等下次解锁时从 qHead 继续排空。
  watch(modals.uiLock, async () => {
    if (modals.uiLock.value) return
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
          // 非阻塞预加载：不再 await，避免 spectate/切换游戏时被图片加载卡住
          preloadGameImages(newGame)
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

  // Callbacks
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

  async function scenarioSpecificAnswer(key: string, value: unknown): Promise<void> {
    if (game.value && !opts.spectate) {
      oldQuestion.value = game.value.question
      setGameQuestion({})
      processing.value = true
      send(JSON.stringify({ tag: 'ScenarioSpecificAnswer', contents: [key, value] }))
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
    scenarioSpecificAnswer,
    skipAllTriggers,
    skipAllAvailable,
    switchInvestigator,
  }
}

export type GameSocket = ReturnType<typeof useGameSocket>
