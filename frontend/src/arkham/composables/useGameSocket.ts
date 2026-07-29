import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useWebSocket } from '@vueuse/core'
import confetti from '@/effects/confetti'
import { fetchGame } from '@/arkham/api'
import { useUserStore } from '@/stores/user'
import * as Arkham from '@/arkham/types/Game'
import * as ArkhamGame from '@/arkham/types/Game'
import * as Message from '@/arkham/types/Message'
import type { SharedEventState } from '@/arkham/types/EpicEvent'
import type { Question } from '@/arkham/types/Question'
import { preloadGameImages } from '@/arkham/gameImagePreload'
import type { GameModals } from './useGameModals'

// TODO: contents should not be string
export type ServerResult =
  | { tag: 'GameError'; contents: string }
  | { tag: 'GameMessage'; contents: string }
  | { tag: 'GameTarot'; contents: string }
  | { tag: 'GameAchievement'; contents: string }
  | { tag: 'GameCard'; contents: string }
  | { tag: 'GameCardOnly'; contents: string }
  | { tag: 'GameUpdate'; contents: string }
  | { tag: 'GameShowDiscard'; contents: string }
  | { tag: 'GameShowUnder'; contents: string }
  | { tag: 'GameUI'; contents: string }
  | { tag: 'GameAudio'; contents: string }
  | { tag: 'SharedStateUpdate'; contents: SharedEventState }

export interface GameEmitter {
  emit(event: string, payload?: unknown): void
}

export interface UseGameSocketOptions {
  gameId: () => string
  spectate: boolean
  modals: GameModals
  emitter: GameEmitter
  onSharedStateUpdate?: (state: SharedEventState) => void
  onAchievement?: (tag: string) => void
}

const baseURL = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`

export function useGameSocket(opts: UseGameSocketOptions) {
  const { modals, emitter } = opts
  const userStore = useUserStore()

  const game = shallowRef<Arkham.Game | null>(null)
  const gameLog = shallowRef<readonly string[]>(Object.freeze([]))
  const playerId = ref<string | null>(null)
  const eventId = ref<string | null>(null)
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

  function entitiesMoved(previous: Arkham.Game, current: Arkham.Game) {
    const placementChanged = (
      previousEntities: Record<string, { placement: unknown }> | undefined,
      currentEntities: Record<string, { placement: unknown }> | undefined,
    ) => Object.entries(currentEntities ?? {}).some(([id, entity]) => {
      const previousEntity = previousEntities?.[id]
      return previousEntity && JSON.stringify(previousEntity.placement) !== JSON.stringify(entity.placement)
    })

    return placementChanged(previous.investigators, current.investigators)
      || placementChanged(previous.enemies, current.enemies)
  }

  function applyGameUpdate(updatedGame: Arkham.Game, locked: boolean) {
    const nextGame = locked ? { ...updatedGame, question: {} } : updatedGame
    const previousGame = game.value
    const apply = async () => {
      game.value = nextGame
      await nextTick()
    }
    const transitionDocument = document as Document & {
      startViewTransition?: (callback: () => Promise<void>) => unknown
    }

    if (previousGame && entitiesMoved(previousGame, nextGame) && transitionDocument.startViewTransition) {
      transitionDocument.startViewTransition(apply)
    } else {
      void apply()
    }
  }

  function scheduleApplyUpdate(payload: string) {
    if (decoding) {
      pendingUpdate = payload
      return
    }
    decoding = true
    Arkham.gameDecoder
      .decodePromise(payload)
      .then((updatedGame) => {
        const locked = modals.uiLock.value
        applyGameUpdate(updatedGame, locked)
        updateGameLog(updatedGame.log)
        preloadGameImages(updatedGame)
        if (!locked && solo.value === true && Object.keys(updatedGame.question).length > 0) {
          if (Object.keys(updatedGame.question).length == 1) {
            playerId.value = Object.keys(updatedGame.question)[0]
          } else if (updatedGame.activePlayerId !== playerId.value) {
            if (playerId.value && Object.keys(updatedGame.question).includes(playerId.value)) {
              playerId.value = updatedGame.activePlayerId
            } else {
              playerId.value = Object.keys(updatedGame.question)[0]
            }
          } else if (playerId.value && !Object.keys(updatedGame.question).includes(playerId.value)) {
            playerId.value = Object.keys(updatedGame.question)[0]
          }
        }
        if (!locked) continueSkipAll()
      })
      .catch(async (err) => {
        // A dropped update used to be an unhandled rejection: the board silently stayed on
        // the previous state, which looks exactly like "the server ignored me" and invites
        // the player to submit the same action again (#5256). Re-fetch instead.
        console.error('Failed to decode game update, refetching', err)
        await fetchGame(opts.gameId(), opts.spectate)
          .then(({ game: refetched }) => {
            applyGameUpdate(refetched, modals.uiLock.value)
            updateGameLog(refetched.log)
          })
          .catch(() => {
            socketError.value = true
          })
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

  type SkipTriggerEntry = { playerId: string; choiceIdx: number; investigatorId: string }

  function skipTriggerEntries(g: Arkham.Game): SkipTriggerEntry[] {
    const result: SkipTriggerEntry[] = []
    for (const pid of Object.keys(g.question)) {
      const cs = ArkhamGame.choices(g, pid)
      const idx = cs.findIndex((c) => c.tag === Message.MessageType.SKIP_TRIGGERS_BUTTON)
      const choice = idx === -1 ? null : cs[idx]
      if (choice?.tag === Message.MessageType.SKIP_TRIGGERS_BUTTON) {
        result.push({ playerId: pid, choiceIdx: idx, investigatorId: choice.investigatorId })
      }
    }
    return result
  }

  function investigatorBelongsToPlayer(g: Arkham.Game, investigatorId: string, targetPlayerId: string) {
    return g.investigators[investigatorId]?.playerId === targetPlayerId
  }

  function isInvestigatorTurn(g: Arkham.Game) {
    return g.phaseStep?.tag === 'InvestigationPhaseStep'
      && [
        'NextInvestigatorsTurnBeginsStep',
        'NextInvestigatorsTurnBeginsWindow',
        'InvestigatorTakesActionStep',
        'InvestigatorsTurnEndsStep',
      ].includes(g.phaseStep.contents)
  }

  function canCurrentPlayerSkipAllWindows(g: Arkham.Game, currentPlayerId: string) {
    if (solo.value) return true

    if (g.skillTest) {
      return investigatorBelongsToPlayer(g, g.skillTest.investigator, currentPlayerId)
    }

    if (isInvestigatorTurn(g)) {
      return investigatorBelongsToPlayer(g, g.activeInvestigatorId, currentPlayerId)
    }

    return true
  }

  function authorizedSkipTriggerEntries(g: Arkham.Game): SkipTriggerEntry[] {
    if (!playerId.value) return []
    if (!canCurrentPlayerSkipAllWindows(g, playerId.value)) return []
    return skipTriggerEntries(g)
  }

  const skipAllAvailable = computed(() => {
    if (!game.value) return false
    if (skipAllPending.value.size > 0) return true

    const entries = authorizedSkipTriggerEntries(game.value)
    const distinct = new Set(entries.map((entry) => entry.playerId))
    if (distinct.size > 1) return true
    // The authorized player (e.g. the skill-test owner) may be waiting on a
    // single other player's fast trigger with no window of their own to skip;
    // let them skip that lone window too. Solo keeps the stricter rule.
    return !solo.value && distinct.size === 1 && !distinct.has(playerId.value ?? '')
  })

  function continueSkipAll() {
    if (skipAllPending.value.size === 0) return
    if (!game.value) return
    const next = authorizedSkipTriggerEntries(game.value).find((e) => skipAllPending.value.has(e.playerId))
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
    if (skipAllPending.value.size > 0) {
      if (!processing.value) continueSkipAll()
      return
    }

    const entries = authorizedSkipTriggerEntries(game.value)
    if (entries.length === 0) return
    skipAllPending.value = new Set(entries.map((e) => e.playerId))
    const first = entries[0]
    sendSkipFor(first.playerId, first.choiceIdx)
  }

  function playAudioFile(fileName: string) {
    if (localStorage.getItem('arkhamSoundsDisabled') === 'true') return
    if (!/^[a-zA-Z0-9_.-]+\.(ogg|mp3|wav)$/i.test(fileName)) return

    const audio = new Audio(`/audio/${fileName}`)
    audio.play().catch((error) => console.warn(`Unable to play audio file: ${fileName}`, error))
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
      case 'GameAchievement':
        opts.onAchievement?.(result.contents)
        return
      case 'GameShowDiscard':
        emitter.emit('showDiscards', result.contents)
        return
      case 'GameShowUnder':
        emitter.emit('showUnder', result.contents)
        return
      case 'GameAudio':
        playAudioFile(result.contents)
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
      case 'SharedStateUpdate':
        opts.onSharedStateUpdate?.(result.contents)
        return
      case 'GameUpdate':
        if (modals.uiLock.value) qPush(result)
        scheduleApplyUpdate(result.contents)
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
    () => [opts.gameId(), opts.spectate] as const,
    async (newVals, oldVals) => {
      const [newGameId] = newVals
      if (!newGameId) return
      if (oldVals && newGameId === oldVals[0] && newVals[1] === oldVals[1]) return
      await fetchGame(opts.gameId(), opts.spectate).then(
        async ({ game: newGame, playerId: newPlayerId, multiplayerMode, eventId: newEventId }) => {
          // 非阻塞预加载：不再 await，避免 spectate/切换游戏时被图片加载卡住
          preloadGameImages(newGame)
          ;(window as Window & { g?: Arkham.Game }).g = newGame
          game.value = newGame
          solo.value = multiplayerMode === 'Solo'
          updateGameLog(newGame.log)
          playerId.value = newPlayerId
          eventId.value = newEventId
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
    eventId,
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
