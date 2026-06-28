import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { useAi } from '@/arkham/ai'
import type { Game } from '@/arkham/types/Game'
import type { Question } from '@/arkham/types/Question'

interface UseAiDriverOptions {
  game: Ref<Game | null>
  spectate: () => boolean
  aiDevEnabled: Ref<boolean>
  send: (message: string) => void
}

// Setup/lobby questions the AI must never touch (it has no decision model for
// these). Tags are read after unwrapping QuestionLabel/PayCostQuestion/QuestionWithSource.
const AI_SETUP_DENYLIST = new Set<string>([
  'ChooseDeck',
  'ChooseUpgradeDeck',
  'PickScenarioSettings',
  'PickCampaignSettings',
  'PickCampaignSpecific',
  'PickScenarioSpecific',
  'ContinueCampaign',
  'PickDestiny',
])

export function useAiDriver(opts: UseAiDriverOptions) {
  const ai = useAi()

  // Pending scheduled sends, keyed by playerId; tracks the questionVersion the
  // send was armed for so a question change cancels/reschedules instead of
  // firing stale.
  const aiScheduled = new Map<string, { version: number; timer: ReturnType<typeof setTimeout> }>()
  // The (playerId -> questionVersion) we last actually sent an AiAnswer for.
  // Drives the loop-guard: if the same (seat, version) is still pending after
  // our send, the AI could not resolve it, so we stop and hand it to the human.
  const aiSentVersion = new Map<string, number>()
  const aiStuckSeats = ref<Set<string>>(new Set())

  const aiSeatIds = computed(() =>
    opts.game.value ? Object.keys(opts.game.value.settings.aiPlayers) : [],
  )

  function innerQuestionTag(q: Question | undefined): string | null {
    let cur: Question | undefined = q
    while (
      cur &&
      (cur.tag === 'QuestionLabel' || cur.tag === 'PayCostQuestion' || cur.tag === 'QuestionWithSource')
    ) {
      cur = 'question' in cur ? cur.question : undefined
    }
    return cur ? cur.tag : null
  }

  function enabledAiSeats(g: Game): string[] {
    const seats = g.settings.aiPlayers
    return Object.keys(seats).filter((pid) => seats[pid]?.aiEnabled)
  }

  function aiSeatInvestigatorId(g: Game, pid: string): string | null {
    for (const investigator of Object.values(g.investigators)) {
      if (investigator.playerId === pid) return investigator.id
    }
    return null
  }

  function isAiAssistWindow(g: Game, pid: string): boolean {
    if (!g.skillTest) return false
    if (!(pid in g.question)) return false
    const invId = aiSeatInvestigatorId(g, pid)
    return invId !== null && invId !== g.skillTest.investigator
  }

  function cancelAiTimer(pid: string) {
    const sched = aiScheduled.get(pid)
    if (sched) {
      clearTimeout(sched.timer)
      aiScheduled.delete(pid)
    }
  }

  function cancelAllAiTimers() {
    for (const { timer } of aiScheduled.values()) clearTimeout(timer)
    aiScheduled.clear()
  }

  function setAiStuck(pid: string, stuck: boolean) {
    if (stuck === aiStuckSeats.value.has(pid)) return
    const next = new Set(aiStuckSeats.value)
    if (stuck) next.add(pid)
    else next.delete(pid)
    aiStuckSeats.value = next
  }

  function driveAi() {
    if (!opts.aiDevEnabled.value || opts.spectate()) {
      cancelAllAiTimers()
      return
    }
    const g = opts.game.value
    if (!g) {
      cancelAllAiTimers()
      return
    }

    if (!ai.enabled || g.gameState.tag !== 'IsActive') {
      cancelAllAiTimers()
      return
    }

    const seats = enabledAiSeats(g)
    if (seats.length === 0) {
      cancelAllAiTimers()
      return
    }

    const version = g.scenarioSteps

    for (const pid of [...aiScheduled.keys()]) {
      if (!(pid in g.question) || !seats.includes(pid)) cancelAiTimer(pid)
    }
    for (const pid of [...aiStuckSeats.value]) {
      if (!(pid in g.question) || aiSentVersion.get(pid) !== version) setAiStuck(pid, false)
    }

    for (const pid of seats) {
      const q = g.question[pid]
      if (!q) continue

      const tag = innerQuestionTag(q)
      if (tag && AI_SETUP_DENYLIST.has(tag)) continue

      if (isAiAssistWindow(g, pid)) {
        cancelAiTimer(pid)
        continue
      }

      if (aiSentVersion.get(pid) === version) {
        setAiStuck(pid, true)
        cancelAiTimer(pid)
        continue
      }
      setAiStuck(pid, false)

      const existing = aiScheduled.get(pid)
      if (existing) {
        if (existing.version === version) continue
        cancelAiTimer(pid)
      }

      const delay = g.settings.aiPlayers[pid]?.aiResponseDelayMs ?? 1500
      const timer = setTimeout(() => {
        aiScheduled.delete(pid)
        const cur = opts.game.value
        if (!cur || !ai.enabled || opts.spectate()) return
        if (cur.gameState.tag !== 'IsActive') return
        if (cur.scenarioSteps !== version) return
        if (!(pid in cur.question)) return
        if (!enabledAiSeats(cur).includes(pid)) return
        if (isAiAssistWindow(cur, pid)) return
        aiSentVersion.set(pid, version)
        opts.send(JSON.stringify({ tag: 'AiAnswer', playerId: pid }))
      }, Math.max(0, delay))
      aiScheduled.set(pid, { version, timer })
    }
  }

  watch(opts.game, () => driveAi())
  watch(() => ai.enabled, () => driveAi())
  watch(opts.aiDevEnabled, () => driveAi())
  onUnmounted(cancelAllAiTimers)

  return { aiSeatIds, aiStuckSeats, cancelAllAiTimers }
}
