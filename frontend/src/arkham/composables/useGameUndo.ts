import { computed, ref, type Ref, type ShallowRef } from 'vue'
import {
  undoChoice,
  undoScenarioChoice,
  undoAction,
  undoTurn,
  undoPhase,
  undoRound,
} from '@/arkham/api'
import type * as Arkham from '@/arkham/types/Game'
import type { Question } from '@/arkham/types/Question'

export interface UseGameUndoOptions {
  gameId: () => string
  game: ShallowRef<Arkham.Game | null>
  processing: Ref<boolean>
  setGameQuestion: (question: Record<string, Question>) => void
  clearResultQueue: () => void
  modals: { resetForUndo: () => void }
  debugActive: () => boolean
}

export function useGameUndo(opts: UseGameUndoOptions) {
  const { game, processing, setGameQuestion, clearResultQueue, modals } = opts

  const canUndoScenario = computed(() => {
    if (!game.value) return false
    return game.value.scenarioSteps > 1
  })

  const canUndoBoundary = (boundary: number | null): boolean => {
    if (!game.value) return false
    if (boundary === null) return false
    return game.value.scenarioSteps > boundary
  }

  const canUndoAction = computed(() => canUndoBoundary(game.value?.undoActionStep ?? null))
  const canUndoTurn = computed(() => canUndoBoundary(game.value?.undoTurnStep ?? null))
  const canUndoPhase = computed(() => canUndoBoundary(game.value?.undoPhaseStep ?? null))
  const canUndoRound = computed(() => canUndoBoundary(game.value?.undoRoundStep ?? null))

  const undoLock = ref(false)

  async function undo() {
    processing.value = true
    const oldQuestion = game.value?.question
    if (game.value) setGameQuestion({})
    clearResultQueue()
    modals.resetForUndo()
    if (undoLock.value) return
    undoLock.value = true
    try {
      await undoChoice(opts.gameId(), opts.debugActive())
    } catch (e) {
      processing.value = false
      if (game.value && oldQuestion) setGameQuestion(oldQuestion)
      console.log(e)
    }
    undoLock.value = false
  }

  async function undoScenario() {
    processing.value = true
    if (game.value) setGameQuestion({})
    clearResultQueue()
    modals.resetForUndo()
    undoScenarioChoice(opts.gameId())
  }

  async function undoBoundary(call: (gameId: string) => Promise<void>) {
    if (undoLock.value) return
    processing.value = true
    const oldQuestion = game.value?.question
    if (game.value) setGameQuestion({})
    clearResultQueue()
    modals.resetForUndo()
    undoLock.value = true
    try {
      await call(opts.gameId())
    } catch (e) {
      processing.value = false
      if (game.value && oldQuestion) setGameQuestion(oldQuestion)
      console.log(e)
    }
    undoLock.value = false
  }

  const undoActionStart = () => undoBoundary(undoAction)
  const undoTurnStart = () => undoBoundary(undoTurn)
  const undoPhaseStart = () => undoBoundary(undoPhase)
  const undoRoundStart = () => undoBoundary(undoRound)

  return {
    undo,
    undoScenario,
    undoActionStart,
    undoTurnStart,
    undoPhaseStart,
    undoRoundStart,
    canUndoScenario,
    canUndoAction,
    canUndoTurn,
    canUndoPhase,
    canUndoRound,
  }
}
