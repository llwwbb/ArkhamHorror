import { onMounted, onUnmounted, ref, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import { useDebug } from '@/arkham/debug'
import type * as Arkham from '@/arkham/types/Game'
import * as Message from '@/arkham/types/Message'

// 桌面 shell 专用——手机 shell 不挂键盘快捷键，无需调用本 composable。
export interface UseGameKeyboardOptions {
  // 返回 false 时临时禁用全部快捷键（如 bug 表单等文本输入打开期间）
  enabled: () => boolean
  game: ShallowRef<Arkham.Game | null>
  playerId: Ref<string | null>
  choices: ComputedRef<readonly Message.Message[]>
  choose: (idx: number) => void
  actionMap: ComputedRef<Map<string, () => void>>
  undo: () => void
  undoActionStart: () => void
  undoTurnStart: () => void
  undoPhaseStart: () => void
  undoRoundStart: () => void
  canUndoAction: ComputedRef<boolean>
  canUndoTurn: ComputedRef<boolean>
  canUndoPhase: ComputedRef<boolean>
  canUndoRound: ComputedRef<boolean>
  canUndoScenario: ComputedRef<boolean>
  openUndoScenarioDialog: () => void
  toggleShortcuts: () => void
  toggleDebug: () => void
}

export function useGameKeyboard(opts: UseGameKeyboardOptions) {
  const debug = useDebug()
  const { game, playerId, choices, choose } = opts

  // 'e' 调试快捷键需要鼠标位置做 elementFromPoint；与 Game.vue 里 flashlight 的
  // mousemove 监听并存（两个独立 listener，有意为之，勿合并删除）
  let mouseX = 0
  let mouseY = 0
  const onMove = (event: MouseEvent) => {
    mouseX = event.clientX
    mouseY = event.clientY
  }

  // Chord state for U + <key> shortcuts (T/R/P/S/A)
  const undoChordArmed = ref(false)
  let undoChordTimer: number | null = null
  const UNDO_CHORD_TIMEOUT_MS = 1500

  const armUndoChord = () => {
    undoChordArmed.value = true
    if (undoChordTimer) clearTimeout(undoChordTimer)
    undoChordTimer = window.setTimeout(() => {
      undoChordArmed.value = false
      undoChordTimer = null
    }, UNDO_CHORD_TIMEOUT_MS)
  }

  const clearUndoChord = () => {
    undoChordArmed.value = false
    if (undoChordTimer) {
      clearTimeout(undoChordTimer)
      undoChordTimer = null
    }
  }

  // --- Konami Code support ---
  const KONAMI_SEQ = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a',
  ] as const

  let konamiIndex = 0
  let konamiTimer: number | null = null
  const KONAMI_TIMEOUT_MS = 5000 // reset if user pauses too long

  const onKonami = () => {
    if (!game.value) return
    debug.send(game.value.id, { tag: 'KonamiCode', contents: playerId.value })
  }

  const feedKonami = (rawKey: string): boolean => {
    const key = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey

    // match current step
    if (key === KONAMI_SEQ[konamiIndex]) {
      konamiIndex++
      if (konamiIndex === KONAMI_SEQ.length) {
        // success!
        konamiIndex = 0
        if (konamiTimer) {
          clearTimeout(konamiTimer)
          konamiTimer = null
        }
        onKonami()
        return true
      }
      // keep a rolling timeout while the user is entering
      if (konamiTimer) clearTimeout(konamiTimer)
      konamiTimer = window.setTimeout(() => {
        konamiIndex = 0
        konamiTimer = null
      }, KONAMI_TIMEOUT_MS)
      return false
    }

    // mismatch: allow overlap if this key is the first symbol of the sequence
    if (key === KONAMI_SEQ[0]) {
      konamiIndex = 1
      if (konamiTimer) clearTimeout(konamiTimer)
      konamiTimer = window.setTimeout(() => {
        konamiIndex = 0
        konamiTimer = null
      }, KONAMI_TIMEOUT_MS)
    } else {
      konamiIndex = 0
      if (konamiTimer) {
        clearTimeout(konamiTimer)
        konamiTimer = null
      }
    }

    return false
  }

  // Keyboard Shortcuts
  const handleKeyPress = (event: KeyboardEvent) => {
    if (!opts.enabled()) return
    if (event.ctrlKey) return
    if (event.metaKey) return
    if (event.altKey) return

    if (feedKonami(event.key)) return

    // Chord: when U is armed, the next key chooses the undo level
    if (undoChordArmed.value) {
      const k = event.key.toLowerCase()
      if (k === 'a' && opts.canUndoAction.value) {
        clearUndoChord()
        opts.undoActionStart()
        return
      }
      if (k === 't' && opts.canUndoTurn.value) {
        clearUndoChord()
        opts.undoTurnStart()
        return
      }
      if (k === 'p' && opts.canUndoPhase.value) {
        clearUndoChord()
        opts.undoPhaseStart()
        return
      }
      if (k === 'r' && opts.canUndoRound.value) {
        clearUndoChord()
        opts.undoRoundStart()
        return
      }
      if (k === 's' && opts.canUndoScenario.value) {
        clearUndoChord()
        opts.openUndoScenarioDialog()
        return
      }
      // Pressing U again while armed = single undo (re-pressing the prefix)
      if (k === 'u') {
        clearUndoChord()
        opts.undo()
        return
      }
      // Any other key cancels the chord and falls through
      clearUndoChord()
    }

    if (event.key === 'u') {
      opts.undo()
      return
    }

    if (event.key === 'U') {
      armUndoChord()
      return
    }

    if (event.key === 'D') {
      opts.toggleDebug()
      return
    }

    if (event.key === '?') {
      opts.toggleShortcuts()
      return
    }

    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault()

      const skipTriggers = choices.value.findIndex(
        (c) => c.tag === Message.MessageType.SKIP_TRIGGERS_BUTTON,
      )
      if (skipTriggers !== -1) {
        choose(skipTriggers)
        return
      }

      const doneCommitting = choices.value.findIndex((c) => {
        if (c.tag === Message.MessageType.START_SKILL_TEST_BUTTON) return true
        if (c.tag !== Message.MessageType.LABEL && c.tag !== Message.MessageType.DONE) return false
        return c.label === '$label.doneCommitting' || c.label.endsWith('doneCommitting')
      })
      if (doneCommitting !== -1) {
        choose(doneCommitting)
        return
      }

      const validIndices = choices.value
        .map((c, i) =>
          ![Message.MessageType.INVALID_LABEL, Message.MessageType.INFO].includes(c.tag) ? i : -1,
        )
        .filter((i) => i !== -1)

      if (validIndices.length === 1) {
        choose(validIndices[0])
        return
      }

      if (choices.value.length === 1) {
        choose(0)
        return
      }
      return
    }

    if (event.key === 'd') {
      const draw = choices.value.findIndex((c) => {
        if (c.tag !== Message.MessageType.COMPONENT_LABEL) return false
        if (c.component.tag !== 'InvestigatorDeckComponent') return false
        if (!playerId.value) return false
        return game.value?.investigators[c.component.investigatorId]?.playerId === playerId.value
      })
      if (draw !== -1) {
        choose(draw)
      } else {
        const drawEncounter = choices.value.findIndex((c) => {
          if (c.tag !== Message.MessageType.TARGET_LABEL) return false
          return c.target.tag === 'EncounterDeckTarget'
        })

        if (drawEncounter !== -1) choose(drawEncounter)
      }
      return
    }

    if (event.key === 'r') {
      const resource = choices.value.findIndex((c) => {
        if (c.tag !== Message.MessageType.COMPONENT_LABEL) return false
        if (c.component.tag !== 'InvestigatorComponent') return false
        if (c.component.tokenType !== 'ResourceToken') return false
        if (!playerId.value) return false
        return game.value?.investigators[c.component.investigatorId]?.playerId === playerId.value
      })
      if (resource !== -1) choose(resource)
      return
    }

    if (event.key === 'e') {
      if (!game.value || !playerId.value) return
      const elementUnderMouse = document.elementFromPoint(mouseX, mouseY)
      if (debug.active && elementUnderMouse) {
        const dataId = elementUnderMouse.getAttribute('data-id')
        if (dataId && game.value.assets[dataId]) {
          const exhausted = elementUnderMouse.classList.contains('exhausted')
          if (exhausted) {
            debug.send(game.value.id, {
              tag: 'Ready',
              contents: { tag: 'AssetTarget', contents: dataId },
            })
          } else {
            debug.send(game.value.id, {
              tag: 'Exhaust',
              contents: { tag: 'AssetTarget', contents: dataId },
            })
          }
          return
        }
      }
      const endTurn = choices.value.findIndex((c) => {
        if (c.tag !== Message.MessageType.END_TURN_BUTTON) return false
        return game.value?.investigators[c.investigatorId]?.playerId === playerId.value
      })
      if (endTurn !== -1) choose(endTurn)
      return
    }

    opts.actionMap.value.get(event.key)?.()
  }

  onMounted(() => {
    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('keydown', handleKeyPress)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('mousemove', onMove)
  })

  return { undoChordArmed }
}
