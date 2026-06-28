<script lang="ts" setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  AdjustmentsHorizontalIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/20/solid'
import { LottieAnimation } from 'lottie-web-vue'
import processingJSON from '@/assets/processing.json'
import { useCardStore } from '@/stores/cards'
import { useSettings } from '@/stores/settings'
import { useEventStore } from '@/arkham/stores/event'
import { useMenu } from '@/composable/menu'
import useEmitter from '@/composable/useEmitter'
import { useDebug } from '@/arkham/debug'
import { getGameLocalStorageItem, setGameLocalStorageItem } from '@/arkham/localStorage'
import { useGameModals } from '@/arkham/composables/useGameModals'
import { useGameSocket } from '@/arkham/composables/useGameSocket'
import { provideGameContext } from '@/arkham/composables/provideGameContext'
import { useGameUndo } from '@/arkham/composables/useGameUndo'
import { useGameKeyboard } from '@/arkham/composables/useGameKeyboard'
import { useBugReport } from '@/arkham/composables/useBugReport'
import { useTurnNotification } from '@/arkham/composables/useTurnNotification'
import { useAiDriver } from '@/arkham/composables/useAiDriver'
import CampaignLog from '@/arkham/components/CampaignLog.vue'
import CardOverlay from '@/arkham/components/CardOverlay.vue'
import CardActionSheet from '@/arkham/components/CardActionSheet.vue'
import { useDeviceLayout } from '@/arkham/composables/useDeviceLayout'
import { useCardTapSheet } from '@/arkham/composables/useCardTapSheet'
import ActiveGameModals from '@/arkham/components/ActiveGameModals.vue'
import MultiplayerLobby from '@/arkham/components/MultiplayerLobby.vue'
import GameLog from '@/arkham/components/GameLog.vue'
import HistoryPanel from '@/arkham/components/HistoryPanel.vue'
import Settings from '@/arkham/components/Settings.vue'
import OrganizerBar from '@/arkham/components/OrganizerBar.vue'
import AiControlPanel from '@/arkham/components/AiControlPanel.vue'
import Draggable from '@/components/Draggable.vue'
import GameBar from '@/arkham/components/GameBar.vue'
import BugReportForm from '@/arkham/components/BugReportForm.vue'
import ShortcutsModal from '@/arkham/components/ShortcutsModal.vue'
import PlayabilityModal, { type PlayabilityInfo } from '@/arkham/components/PlayabilityModal.vue'
import GameMain from '@/arkham/components/GameMain.vue'
import MobilePlayLayout from '@/arkham/components/MobilePlayLayout.vue'

export interface Props {
  gameId: string
  spectate?: boolean
}

const props = withDefaults(defineProps<Props>(), { spectate: false })

const debug = useDebug()
const emitter = useEmitter()
const route = useRoute()
const store = useCardStore()
const settings = useSettings()
const eventStore = useEventStore()
const { addEntry, menuItems } = useMenu()
const aiDevEnabled = computed(() => settings.aiInvestigatorsEnabled)
const flashlightX = ref(0)
const flashlightY = ref(0)
const focusLightX = ref(-1000)
const focusLightY = ref(-1000)
let focusLightObserver: MutationObserver | null = null
let focusLightAnimationFrame: number | null = null

store.fetchCards()

const modals = useGameModals()
const socket = useGameSocket({
  gameId: () => props.gameId,
  spectate: props.spectate,
  modals,
  emitter,
  onSharedStateUpdate: (state) => eventStore.applySharedState(state),
})
// send/choose* 等其余字段经 provideGameContext 注入给子组件，这里只解构 Game.vue 自用的
const {
  game,
  gameLog,
  playerId,
  ready,
  solo,
  error,
  socketError,
  processing,
  close,
  choose,
  setGameQuestion,
  clearResultQueue,
} = socket
const playabilityInfo = ref<PlayabilityInfo | null>(null)
const showLog = ref(false)
const showShortcuts = ref(false)
const { isTouch, size, shell } = useDeviceLayout()
const phoneShell = computed(() => shell.value === 'phone')
const isMobileViewport = () => size.value === 'phone'
const showSidebar = ref(
  isMobileViewport() ? false : JSON.parse(getGameLocalStorageItem(props.gameId, 'showSidebar') ?? 'true'),
)
const showOtherPlayersHands = ref(getGameLocalStorageItem(props.gameId, 'showOtherPlayersHands') === 'true')
watch(showOtherPlayersHands, (v) => {
  setGameLocalStorageItem(props.gameId, 'showOtherPlayersHands', v ? 'true' : 'false')
})
const showSettings = ref(false)
const showHistory = ref(false)
const { t } = useI18n()
const { sheetTap, confirmSheetAction, closeSheet } = useCardTapSheet({
  isTouch: () => isTouch.value,
  game,
})

addEntry({
  id: 'viewSettings',
  icon: AdjustmentsHorizontalIcon,
  content: t('gameBar.viewSettings'),
  shortcut: 'S',
  nested: 'view',
  action: () => (showSettings.value = !showSettings.value),
})

addEntry({
  id: 'viewHistory',
  icon: ClockIcon,
  content: t('gameBar.viewHistory'),
  shortcut: 'H',
  nested: 'view',
  action: () => (showHistory.value = !showHistory.value),
})

const { choicesByPlayer } = provideGameContext(socket, showOtherPlayersHands)
const { aiSeatIds, aiStuckSeats } = useAiDriver({
  game,
  spectate: () => props.spectate,
  aiDevEnabled,
  send: socket.send,
})

const eventQueryId = computed(() => {
  const q = route.query.event
  return typeof q === 'string' && q !== '' ? q : null
})

const organizerEventId = computed(() => {
  const eid = eventQueryId.value
  if (!eid) return null
  const ev = eventStore.event
  return ev && ev.id === eid && ev.role === 'organizer' ? eid : null
})

watch(
  eventQueryId,
  (eid) => {
    if (!eid) return
    if (eventStore.event?.id === eid) return
    eventStore.load(eid).catch((e) => console.error(e))
  },
  { immediate: true },
)

const undoApi = useGameUndo({
  gameId: () => props.gameId,
  game,
  processing,
  setGameQuestion,
  clearResultQueue,
  modals,
  debugActive: () => debug.active,
})
const {
  undo, undoScenario, undoActionStart, undoTurnStart, undoPhaseStart, undoRoundStart,
  canUndoScenario, canUndoAction, canUndoTurn, canUndoPhase, canUndoRound,
} = undoApi

// Computed
const cards = computed(() => store.cards)
const choices = computed(() => {
  if (!playerId.value) return []
  return choicesByPlayer.value.get(playerId.value) ?? []
})
useTurnNotification({ pendingChoices: computed(() => choices.value.length) })

const realityAcidLightActive = computed(() => {
  const scenario = game.value?.scenario
  return scenario?.id === 'c85001' && scenario.meta?.lightActive === true
})

const undoScenarioDialog = useTemplateRef<HTMLDialogElement>('undoScenarioDialog')

const actionMap = computed<Map<string, () => void>>(() => {
  const map = new Map<string, () => void>()
  for (const item of menuItems.value) {
    if (item.shortcut) map.set(item.shortcut, item.action)
  }
  return map
})

const { filingBug, submittingBug, bugInitialDescription, openBugReport, fileBug } = useBugReport({
  gameId: () => props.gameId,
  onFail: () => alert(t('gameBar.bugSubmittingFail')),
})

const { undoChordArmed } = useGameKeyboard({
  enabled: () => !filingBug.value,
  game,
  playerId,
  choices,
  choose,
  actionMap,
  undo,
  undoActionStart,
  undoTurnStart,
  undoPhaseStart,
  undoRoundStart,
  canUndoAction,
  canUndoTurn,
  canUndoPhase,
  canUndoRound,
  canUndoScenario,
  openUndoScenarioDialog: () => undoScenarioDialog.value?.showModal(),
  toggleShortcuts: () => (showShortcuts.value = !showShortcuts.value),
  toggleDebug: () => debug.toggle(),
})

// Sidebar
const toggleSidebar = function () {
  showSidebar.value = !showSidebar.value
  if (!isMobileViewport()) {
    setGameLocalStorageItem(props.gameId, 'showSidebar', JSON.stringify(showSidebar.value))
  }
}

function confirmUndoScenario() {
  undoScenarioDialog.value?.close()
  undoScenario()
}

function fileBugFromError() {
  const description = error.value ?? ''
  error.value = null
  openBugReport(description)
}

function updateFocusLight() {
  const highlighted = [...document.querySelectorAll<HTMLElement>(
    '.source-highlight, .ability-target, .card-frame-inner.highlighted, .cards-under-indicator--highlighted',
  )].find((el) => {
    if (el.closest('.scenario-cards')) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0
      && rect.top <= window.innerHeight && rect.left <= window.innerWidth
  })

  if (!highlighted) {
    focusLightX.value = -1000
    focusLightY.value = -1000
    return
  }

  const rect = highlighted.getBoundingClientRect()
  focusLightX.value = rect.left + rect.width / 2
  focusLightY.value = rect.top + rect.height / 2
}

function scheduleFocusLightUpdate() {
  if (focusLightAnimationFrame !== null) return
  focusLightAnimationFrame = requestAnimationFrame(() => {
    focusLightAnimationFrame = null
    updateFocusLight()
  })
}

watch(
  () => game.value?.question,
  async () => {
    await nextTick()
    updateFocusLight()
  },
)

const onMove = (event: MouseEvent) => {
  flashlightX.value = event.clientX
  flashlightY.value = event.clientY
  scheduleFocusLightUpdate()
}

// callbacks
const onPlayabilityResult = (result: any) => {
  if (!debug.active) return
  playabilityInfo.value = {
    cardId: result.cardId,
    cardCode: result.cardCode,
    checks: result.checks,
  }
}
emitter.on('playabilityResult', onPlayabilityResult)

onMounted(() => {
  flashlightX.value = window.innerWidth / 2
  flashlightY.value = window.innerHeight / 2
  ;(window as any).sendDebug = async (msg: any) => {
    if (game.value) await debug.send(game.value.id, msg)
  }
  ;(window as any).undo = undo
  ;(window as any).debugChoose = choose
  document.addEventListener('mousemove', onMove, { passive: true })
  focusLightObserver = new MutationObserver(scheduleFocusLightUpdate)
  focusLightObserver.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true })
  scheduleFocusLightUpdate()
})

onBeforeRouteLeave(() => close())
onUnmounted(() => {
  document.removeEventListener('mousemove', onMove)
  focusLightObserver?.disconnect()
  focusLightObserver = null
  if (focusLightAnimationFrame !== null) cancelAnimationFrame(focusLightAnimationFrame)
  delete (window as any).sendDebug
  delete (window as any).undo
  delete (window as any).debugChoose
  emitter.off('playabilityResult', onPlayabilityResult)
  close()
})
</script>

<template>
  <div v-if="submittingBug" class="column page-container">
    <div class="page-content column">
      <h2 class="title">{{ $t('gameBar.bugSubmittingTitle') }}</h2>
      <section class="box">
        {{ $t('gameBar.bugSubmittingContent') }}
      </section>
    </div>
  </div>
  <div id="game" v-else-if="ready && game && playerId">
    <AiControlPanel
      v-if="aiDevEnabled && aiSeatIds.length > 0"
      :game="game"
      :stuck-seats="aiStuckSeats"
    />
    <dialog v-if="error" class="error-dialog">
      <h2>{{ $t('error') }}</h2>
      <p class="error-message">{{ error }}</p>
      <p>{{ $t('errorContent') }}</p>
      <div class="buttons">
        <button @click="fileBugFromError">
          <ExclamationTriangleIcon aria-hidden="true" /> {{ $t('fileBug') }}
        </button>
        <button @click="error = null">{{ $t('close') }}</button>
      </div>
    </dialog>
    <div v-if="processing" class="processing">
      <LottieAnimation
        :animation-data="processingJSON"
        :auto-play="true"
        :loop="true"
        :speed="1"
        ref="anim"
      />
    </div>
    <CardOverlay />
    <CardActionSheet
      v-if="sheetTap"
      :target="sheetTap.target"
      :actionable="sheetTap.actionable"
      @confirm="confirmSheetAction"
      @close="closeSheet"
    />
    <div
      v-if="realityAcidLightActive"
      class="reality-acid-flashlight"
      :style="{ '--flashlight-x': `${flashlightX}px`, '--flashlight-y': `${flashlightY}px` }"
      aria-hidden="true"
    ></div>
    <div
      v-if="realityAcidLightActive"
      class="reality-acid-focus-light"
      :style="{ '--focus-light-x': `${focusLightX}px`, '--focus-light-y': `${focusLightY}px` }"
      aria-hidden="true"
    ></div>
    <ShortcutsModal v-if="showShortcuts" @close="showShortcuts = false" />
    <HistoryPanel
      v-if="showHistory && game && playerId"
      :game="game"
      :playerId="playerId"
      @close="showHistory = false"
    />
    <PlayabilityModal
      v-if="playabilityInfo && debug.active"
      :info="playabilityInfo"
      @close="playabilityInfo = null"
    />
    <BugReportForm
      v-if="filingBug"
      :initial-description="bugInitialDescription"
      @submit="fileBug"
      @cancel="filingBug = false"
    />
    <div v-if="socketError" class="socketWarning">
      <!-- frontend/src/locales/en/gameBoard/base.json -->
      <p>{{ $t('outOfSyncHint') }}</p>
    </div>
    <GameBar
      v-if="!phoneShell"
      :game-id="gameId"
      :show-log="showLog"
      :undo-chord-armed="undoChordArmed"
      :can-undo-action="canUndoAction"
      :can-undo-turn="canUndoTurn"
      :can-undo-phase="canUndoPhase"
      :can-undo-round="canUndoRound"
      :can-undo-scenario="canUndoScenario"
      @toggle-shortcuts="showShortcuts = !showShortcuts"
      @toggle-log="showLog = !showLog"
      @undo="undo"
      @undo-action="undoActionStart"
      @undo-turn="undoTurnStart"
      @undo-phase="undoPhaseStart"
      @undo-round="undoRoundStart"
      @undo-scenario="undoScenarioDialog?.showModal()"
      @file-bug="openBugReport()"
      @toggle-sidebar="toggleSidebar"
    />
    <OrganizerBar
      v-if="organizerEventId"
      :event-id="organizerEventId"
      :current-game-id="gameId"
      :spectate="spectate"
    />
    <MultiplayerLobby
      v-if="game.gameState.tag === 'IsPending'"
      :game-id="gameId"
      :game="game"
      :player-id="playerId"
    />
    <template v-else>
      <Draggable v-if="showSettings">
        <Settings
          :game="game"
          :playerId="playerId"
          :solo="solo"
          v-model:showOtherPlayersHands="showOtherPlayersHands"
          :closeSettings="() => (showSettings = false)"
        />
      </Draggable>
      <CampaignLog
        v-if="showLog && game !== null"
        :game="game"
        :cards="cards"
        :playerId="playerId"
      >
        <template #header-leading>
          <button class="back-button" @click="showLog = false">
            <font-awesome-icon icon="arrow-left" class="back-icon" />
            <span>{{ $t('back') }}</span>
          </button>
        </template>
      </CampaignLog>
      <MobilePlayLayout
        v-else-if="phoneShell"
        :game="game"
        :game-id="gameId"
        :player-id="playerId"
        :game-log="gameLog"
        :modals="modals"
        :undo-api="undoApi"
        @choose="choose"
        @update="socket.setGame"
        @file-bug="openBugReport()"
        @undo-scenario="undoScenarioDialog?.showModal()"
      />
      <div v-else class="game-main">
        <ActiveGameModals :game="game" :playerId="playerId" :modals="modals" />
        <GameMain
          :game="game"
          :game-id="gameId"
          :player-id="playerId"
          :game-log="gameLog"
          @choose="choose"
          @update="socket.setGame"
        />
        <div
          class="sidebar"
          v-if="
            showSidebar &&
            game.scenario !== null &&
            (game.gameState.tag === 'IsActive' || game.gameState.tag === 'IsOver')
          "
        >
          <GameLog :game="game" :gameLog="gameLog" @undo="undo" />
        </div>
        <div class="sidebar" v-if="showSidebar && game.scenario === null">
          <GameLog :game="game" :gameLog="gameLog" @undo="undo" />
        </div>
        <div
          v-if="showSidebar"
          class="sidebar-backdrop"
          @click="toggleSidebar"
          aria-hidden="true"
        ></div>
      </div>
    </template>
    <dialog id="undoScenarioDialog" ref="undoScenarioDialog">
      <p>{{ $t('game.areYouSureUndoScenario') }}</p>
      <div class="buttons">
        <button @click="confirmUndoScenario">{{ $t('Yes') }}</button>
        <button @click="undoScenarioDialog?.close()">{{ $t('No') }}</button>
      </div>
    </dialog>
  </div>
</template>

<style lang="scss" scoped>
.back-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  font-family: teutonic, sans-serif;
  font-size: 0.95em;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  .back-icon {
    font-size: 0.85em;
    transition: transform 0.15s;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    color: #f0f0f0;

    .back-icon {
      transform: translateX(-3px);
    }
  }
}

.reality-acid-flashlight {
  --flashlight-x: 50vw;
  --flashlight-y: 50vh;
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
  background: radial-gradient(
    circle 330px at var(--flashlight-x) var(--flashlight-y),
    rgba(0, 0, 0, 0) 0 52%,
    rgba(0, 0, 0, 0.12) 68%,
    rgba(0, 0, 0, 0.82) 100%
  );
}

.reality-acid-focus-light {
  --focus-light-x: -1000px;
  --focus-light-y: -1000px;
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  background: radial-gradient(
    circle 205px at var(--focus-light-x) var(--focus-light-y),
    rgba(255, 248, 190, 0.72) 0 18%,
    rgba(255, 230, 128, 0.42) 46%,
    rgba(255, 226, 120, 0) 76%
  );
  mix-blend-mode: screen;
  opacity: 0.95;
}

.action {
  border: 5px solid var(--select);
  border-radius: 15px;
}

#game {
  width: 100vw;
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  &:has(.scroll-container) {
    overflow: auto;
  }
}

.game-main {
  width: 100vw;
  height: calc(100vh - 80px);
  display: flex;
  flex: 1;
}

.socketWarning {
  backdrop-filter: blur(3px);
  background-color: rgba(0, 0, 0, 0.8);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  z-index: 100;

  justify-content: center;
  align-items: center;
  justify-self: center;
  align-self: center;

  p {
    padding: 10px;
    background: #fff;
    border-radius: 4px;
  }
}

.sidebar {
  height: 100%;
  width: 25vw;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  background: #d0d9dc;

  @media (max-width: 800px) {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    height: 100dvh;
    width: min(85vw, 360px);
    max-width: none;
    z-index: 200;
    box-shadow: -2px 0 16px rgba(0, 0, 0, 0.45);
    animation: sidebar-slide-in 0.18s ease-out;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  @media (prefers-color-scheme: dark) {
    background: #1c1c1c;
  }
}

.sidebar-backdrop {
  display: none;

  @media (max-width: 800px) {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 199;
    animation: sidebar-fade-in 0.18s ease-out;
  }
}

@keyframes sidebar-slide-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes sidebar-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

#invite {
  background-color: #15192c;
  color: white;
  width: 800px;
  margin: 0 auto;
  margin-top: 20px;
  border-radius: 5px;
  text-align: center;
  p {
    margin: 0;
    padding: 0;
    margin-bottom: 20px;
    font-size: 1.3em;
  }
  @media (max-width: 800px) and (orientation: portrait) {
    width: 100%;
  }
}

.invite-container {
  margin-top: 50px;
  h2 {
    color: #656a84;
    margin-left: 10px;
    text-transform: uppercase;
    padding: 0;
    margin: 0;
  }
}

.invite-link {
  flex: 1;
  input {
    font-size: 1.3em;
    width: 60%;
    border-right: 0;
    border-radius: 3px 0 0 3px;
    padding: 5px;
  }
  button {
    font-size: 1.3em;
    border-radius: 0 3px 3px 0;
    padding: 5px 10px;
    position: relative;

    &:before {
      content: '';
      display: none;
      position: absolute;
      z-index: 9998;
      top: 35px;
      left: 15px;
      width: 0;
      height: 0;

      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-bottom: 5px solid rgba(0, 0, 0, 0.72);
    }

    &:after {
      content: 'Copied!';
      display: none;
      position: absolute;
      z-index: 9999;
      top: var(--nav-height);
      left: -37px;
      width: 114px;
      height: 36px;

      color: #fff;
      font-size: 10px;
      line-height: 36px;
      text-align: center;

      background: rgba(0, 0, 0, 0.72);
      border-radius: 3px;
    }

    &:active,
    &:focus {
      outline: none;

      &:hover {
        background-color: #eee;

        &:before,
        &:after {
          display: block;
        }
      }
    }
  }
}

.button-link {
  display: block;
  width: 100%;
  text-decoration: none;
  button {
    display: block;
    width: 100%;
  }
}


.full-width {
  flex: 1;
  padding-bottom: 10px;
}

.error-dialog {
  backdrop-filter: blur(3px);
  background-color: rgba(0, 0, 0, 0.8);
  position: absolute;
  padding: 0;
  padding-block: 10px;
  width: 50%;
  display: flex;
  z-index: 100;
  display: flex;
  flex-direction: column;
  border: 0;
  border-radius: 10px;
  top: 50%;

  p {
    padding: 10px;
    margin: 0;
  }

  h2 {
    font-family: Teutonic;
    font-size: 2em;
  }

  button {
    background: none;
    border: 0;
    display: inline;
    padding: 5px 10px;
    display: flex;
    gap: 5px;
    height: 100%;
    align-items: center;
    svg {
      width: 15px;
    }
    &:hover {
      background: rgba(0, 0, 0, 0.4);
    }
    height: 100%;
  }

  justify-content: center;
  align-items: center;
  justify-self: center;
  align-self: center;

  .error-message {
    max-height: 50vh;
    overflow: auto;
    padding-inline: 20px;
  }
}
.loader {
  z-index: 1000;
  position: absolute;
  top: 50px;
  left: 20px;
  width: 60px;
  aspect-ratio: 1;
  display: flex;
  color: #d0d0d099;
  border: 4px solid;
  box-sizing: border-box;
  border-radius: 50%;
  background:
    radial-gradient(circle 5px, currentColor 95%, #0000),
    linear-gradient(currentColor 50%, #0000 0) 50%/4px 60% no-repeat;
  animation: l1 30s infinite linear;
}
.loader:before {
  content: '';
  flex: 1;
  background: linear-gradient(currentColor 50%, #0000 0) 50%/4px 80% no-repeat;
  animation: inherit;
}
@keyframes l1 {
  100% {
    transform: rotate(1turn);
  }
}

.processing {
  z-index: 1000;
  position: absolute;
  top: 5px;
  left: 00px;
  width: 80px;
  filter: invert(48%) sepia(32%) saturate(393%) hue-rotate(37deg) brightness(92%) contrast(89%);
  aspect-ratio: 1;
}

dialog {
  width: 400px;
  max-width: 90vw;
  padding: 20px;
  border-radius: 10px;
  background-color: var(--background);
  color: var(--title);
  font-size: 1.2em;
  margin: 0 auto;

  position: absolute;
  top: 50%;
  transform: translateY(-50%);

  &::backdrop {
    backdrop-filter: blur(3px);
    background-color: rgba(0, 0, 0, 0.8);
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 10px;

    button {
      padding: 5px 10px;
      font-size: 1.2em;
    }
  }
}

</style>
