<script lang="ts" setup>
// 手机 shell（spec §4）：全屏地图为底，顶部 阶段条+撤销+汉堡，底部导航，统一浮层。
// 逻辑（socket/undo/modals）全在 Game.vue，这里只做 chrome 与编排。
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bars3Icon,
  BackwardIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  HandRaisedIcon,
  MapIcon,
  UserGroupIcon,
} from '@heroicons/vue/20/solid'
import type { Game } from '@/arkham/types/Game'
import type { GameModals } from '@/arkham/composables/useGameModals'
import type { GameUndoApi } from '@/arkham/composables/useGameUndo'
import { providePhoneShell } from '@/arkham/composables/phoneShell'
import { useGameIndexes } from '@/arkham/composables/useGameIndexes'
import { choicesByPlayerKey } from '@/arkham/composables/useGameChoices'
import { MessageType } from '@/arkham/types/Message'
import { useMenu } from '@/composable/menu'
import { useDebug } from '@/arkham/debug'
import MobilePhaseBar from '@/arkham/components/MobilePhaseBar.vue'
import ActiveGameModals from '@/arkham/components/ActiveGameModals.vue'
import ChoiceModal from '@/arkham/components/ChoiceModal.vue'
import GameMain from '@/arkham/components/GameMain.vue'
import GameLog from '@/arkham/components/GameLog.vue'
import OverlayDrawer from '@/components/OverlayDrawer.vue'
import PlayerHandCards from '@/arkham/components/PlayerHandCards.vue'
import PoolItem from '@/arkham/components/PoolItem.vue'
import Draw from '@/arkham/components/Draw.vue'
import { isScenarioBoardActive, quickActionsBottomOffset } from '@/arkham/mobileShellLayout'

const props = defineProps<{
  game: Game
  gameId: string
  playerId: string
  gameLog: readonly string[]
  modals: GameModals
  undoApi: GameUndoApi
}>()

const emit = defineEmits<{
  choose: [number]
  update: [Game]
  fileBug: []
  undoScenario: []
}>()

const router = useRouter()
const debug = useDebug()
const { menuItems } = useMenu()

// 平铺全部菜单项，但跳过 nested:'hidden'（仅快捷键触发的隐藏项）
const visibleMenuItems = computed(() => menuItems.value.filter((m) => m.nested !== 'hidden'))

const canUndoAny = computed(
  () =>
    props.undoApi.canUndoAction.value ||
    props.undoApi.canUndoTurn.value ||
    props.undoApi.canUndoPhase.value ||
    props.undoApi.canUndoRound.value ||
    props.undoApi.canUndoScenario.value,
)

const menuOpen = ref(false)
const logOpen = ref(false)
const handOpen = ref(false)
const playersOpen = ref(false)
const bottomDockTarget = '#mobile-bottom-drawer-dock'
providePhoneShell({ handOpen, playersOpen, bottomDockTarget })
const bottomDockEl = ref<HTMLElement | null>(null)
const choiceDockEl = ref<HTMLElement | null>(null)
const bottomDockHeight = ref(0)
const choiceDockHeight = ref(0)
let dockResizeObserver: ResizeObserver | null = null
// 跳过/结束回合快捷条浮在底部整叠（选择浮窗 + 抽屉）之上：偏移取两者高度之和
const quickActionsBottom = computed(() =>
  quickActionsBottomOffset(bottomDockHeight.value + choiceDockHeight.value),
)

function updateDockHeights() {
  bottomDockHeight.value = bottomDockEl.value?.getBoundingClientRect().height ?? 0
  choiceDockHeight.value = choiceDockEl.value?.getBoundingClientRect().height ?? 0
}

type DrawerName = 'log' | 'hand' | 'players'
const drawers: Record<DrawerName, typeof logOpen> = {
  log: logOpen,
  hand: handOpen,
  players: playersOpen,
}
function toggleDrawer(name: DrawerName) {
  const next = !drawers[name].value
  for (const d of Object.values(drawers)) d.value = false
  drawers[name].value = next
  autoOpened.value = null
}
function closeAllDrawers() {
  for (const d of Object.values(drawers)) d.value = false
  menuOpen.value = false
  autoOpened.value = null
}

const inPlay = computed(() => props.game.gameState.tag === 'IsActive' && props.game.scenario !== null)

// 顶部条 totals：桌面版 #totals 在角色抽屉里、收起即不可见，手机 shell 常驻顶部条
const chaosTokenCount = (face: string) =>
  props.game.scenario?.chaosBag.chaosTokens.filter((t) => t.face === face).length ?? 0
const blessTokens = computed(() => chaosTokenCount('BlessToken'))
const curseTokens = computed(() => chaosTokenCount('CurseToken'))
const frostTokens = computed(() => chaosTokenCount('FrostToken'))
// 待办指示：轮到本玩家选择时高亮（Task 11 起配合 Question 停靠使用）
const hasQuestion = computed(() => !!props.game.question[props.playerId])

// 自己的 investigator：手牌抽屉只对在场玩家渲染（旁观时为 null，不出手牌 tab）
const gameIndexes = useGameIndexes(() => props.game)
const ownInvestigator = computed(
  () => gameIndexes.value.investigatorByPlayerId.get(props.playerId) ?? null,
)

// 快捷操作条：注入 choices，提取 skip / endTurn 索引，在 shell 层一步直达。
// autoOpened 扫描器只识别 ACTIONABLE CSS 类（见下方），不扫描普通 <button>，
// 所以快捷条里的按钮不会干扰红点逻辑，无需额外排除。
const choicesByPlayer = inject(choicesByPlayerKey)
const myChoices = computed(() => choicesByPlayer?.value.get(props.playerId) ?? [])
const skipIdx = computed(() => {
  const id = ownInvestigator.value?.id
  if (!id) return -1
  return myChoices.value.findIndex(
    (c) => c.tag === MessageType.SKIP_TRIGGERS_BUTTON && c.investigatorId === id,
  )
})
const endTurnIdx = computed(() => {
  const id = ownInvestigator.value?.id
  if (!id) return -1
  return myChoices.value.findIndex(
    (c) => c.tag === MessageType.END_TURN_BUTTON && c.investigatorId === id,
  )
})
const skipAllTriggers = inject<() => void>('skipAllTriggers')
const skipAllAvailable = inject<Ref<boolean>>('skipAllAvailable')

// 技能检定开始自动展开手牌便于投入；展开后保持，交给玩家手动收起。
// 经 toggleDrawer 同款互斥逻辑，避免与其他抽屉叠层。
watch(
  () => props.game.skillTest,
  (st, prev) => {
    if (st && !prev) {
      for (const d of Object.values(drawers)) d.value = false
      autoOpened.value = null
      handOpen.value = true
    }
  },
)

// 抽屉自动联动：可操作元素只在单一区域时自动打开对应抽屉；打开后保持，交给玩家手动收起。
// DOM 探测（与 touchTapIntercept 的类约定一致）：keep-mounted 抽屉关闭时内容仍挂载
// （v-show），querySelector 可达，无需解析 Question 模型。
const ACTIONABLE = '[class*="--can-interact"], [class*="--can-progress"], .can-interact'

// autoOpened: 当前由自动逻辑打开的抽屉名，null 表示未自动打开任何抽屉。
const autoOpened = ref<'hand' | 'players' | null>(null)
// 与 GameMain/Campaign/StandaloneScenario 的分支保持一致：只有真正渲染战局 Scenario 时，
// 手机 shell 才补上停靠版 ChoiceModal；幕间/战役剧情由 StoryQuestion 自己渲染。
const scenarioBoardActive = computed(() => {
  return isScenarioBoardActive(props.game)
})
// attention: 各 tab 的红点——区内有可操作元素但对应抽屉未开。
const attention = reactive({ hand: false, players: false })

function scanActionableZones() {
  const all = [...document.querySelectorAll<HTMLElement>(ACTIONABLE)]
  const inPlayers = all.some((el) => el.closest('#player-zone'))
  const inHand = all.some((el) => el.closest('.mobile-hand'))
  const elsewhere = all.some((el) => !el.closest('#player-zone') && !el.closest('.mobile-hand'))
  return { players: inPlayers, hand: inHand, elsewhere }
}

watch(
  () => [props.game, hasQuestion.value] as const,
  async () => {
    await nextTick()
    // 技能检定期间：仍然扫描并刷新红点；但 hand 抽屉的自动打开由 skillTest watch 专管。
    const inSkillTest = !!props.game.skillTest
    const zones = scanActionableZones()

    // 刷新红点（抽屉已开时不亮）
    attention.players = zones.players && !playersOpen.value
    attention.hand = zones.hand && !handOpen.value

    if (!hasQuestion.value || zones.elsewhere) {
      return
    }

    // 恰好一个抽屉区有可操作元素 → 自动打开
    const onlyPlayers = zones.players && !zones.hand
    const onlyHand = zones.hand && !zones.players
    const anyDrawerOpen = logOpen.value || handOpen.value || playersOpen.value

    if (onlyPlayers && !playersOpen.value && !anyDrawerOpen) {
      for (const d of Object.values(drawers)) d.value = false
      playersOpen.value = true
      autoOpened.value = 'players'
      attention.players = false
    } else if (onlyHand && !handOpen.value && !inSkillTest && !anyDrawerOpen) {
      // 技能检定期间不自动弹手牌抽屉（skillTest watch 专管）
      for (const d of Object.values(drawers)) d.value = false
      handOpen.value = true
      autoOpened.value = 'hand'
      attention.hand = false
    }
  },
  // immediate：刷新页面落在待选状态时，首个状态也要触发联动（不等下一次推送）
  { flush: 'post', immediate: true },
)

// 手动关闭路径兜底（Scenario 内抽屉 @close 直接置 false，不经 toggleDrawer）：
// 关闭即清自动标志；开合后刷新指示点，避免抽屉打开时灯还亮着。
watch(playersOpen, (open) => {
  if (!open && autoOpened.value === 'players') autoOpened.value = null
  attention.players = !open && scanActionableZones().players
})
watch(handOpen, (open) => {
  if (!open && autoOpened.value === 'hand') autoOpened.value = null
  attention.hand = !open && scanActionableZones().hand
})

watch([handOpen, playersOpen], async () => {
  await nextTick()
  updateDockHeights()
})

onMounted(() => {
  updateDockHeights()
  dockResizeObserver = new ResizeObserver(updateDockHeights)
  if (bottomDockEl.value) dockResizeObserver.observe(bottomDockEl.value)
  if (choiceDockEl.value) dockResizeObserver.observe(choiceDockEl.value)
})

onUnmounted(() => {
  dockResizeObserver?.disconnect()
  dockResizeObserver = null
})

function runMenuItem(action: () => void) {
  menuOpen.value = false
  action()
}
</script>

<template>
  <!-- mobile-play--question：有待选 Question 时的样式钩子，当前无消费者（停靠版 ChoiceModal 入流停靠，不占浮层） -->
  <div class="mobile-play" :class="{ 'mobile-play--question': hasQuestion }">
    <header class="mobile-top-bar">
      <MobilePhaseBar v-if="inPlay" :game="game" class="top-bar-phases" />
      <span v-else class="top-bar-spacer"></span>
      <div v-if="inPlay" class="top-bar-totals">
        <PoolItem type="doom" :amount="game.totalDoom" />
        <PoolItem type="clue" :amount="game.totalClues" />
        <PoolItem v-if="blessTokens > 0" type="ct_bless" :amount="blessTokens" />
        <PoolItem v-if="curseTokens > 0" type="ct_curse" :amount="curseTokens" />
        <PoolItem v-if="frostTokens > 0" type="ct_frost" :amount="frostTokens" />
      </div>
      <button
        type="button"
        class="top-bar-btn"
        :aria-label="$t('gameBar.undo')"
        @click="undoApi.undo()"
      >
        <BackwardIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        class="top-bar-btn"
        :class="{ 'top-bar-btn--attention': hasQuestion }"
        :aria-label="$t('mobileShell.menu')"
        @click="menuOpen = true"
      >
        <Bars3Icon aria-hidden="true" />
      </button>
    </header>

    <div id="mobile-bottom-drawer-dock" ref="bottomDockEl" class="mobile-bottom-drawer-dock"></div>

    <main class="mobile-main">
      <ActiveGameModals :game="game" :playerId="playerId" :modals="modals" />
      <GameMain
        :game="game"
        :game-id="gameId"
        :player-id="playerId"
        :game-log="gameLog"
        @choose="emit('choose', $event)"
        @update="emit('update', $event)"
      />
    </main>

    <!-- 停靠版 Question：入流停靠在底部抽屉之上（不再 fixed 浮层，避免遮住手牌/角色抽屉，spec §4）。
         镜像桌面挂载语义——只为本玩家渲染（旁观者无，桌面 Player 内 ChoiceModal 同理），且战役
         间章（CampaignPhase）不渲染（桌面此时 Player 未挂载，问题由 StoryQuestion/Campaign UI 呈现）。 -->
    <div ref="choiceDockEl" class="mobile-choice-dock">
      <ChoiceModal
        v-if="ownInvestigator && scenarioBoardActive"
        docked
        :game="game"
        :playerId="playerId"
        @choose="emit('choose', $event)"
      />
    </div>

    <nav class="mobile-nav">
      <button
        type="button"
        :class="{ active: !logOpen && !handOpen && !playersOpen }"
        @click="closeAllDrawers"
      >
        <MapIcon aria-hidden="true" />{{ $t('mobileShell.map') }}
      </button>
      <button
        v-if="ownInvestigator"
        type="button"
        :class="{ active: handOpen }"
        @click="toggleDrawer('hand')"
      >
        <HandRaisedIcon aria-hidden="true" />{{ $t('mobileShell.hand') }}
        <span v-if="attention.hand" class="nav-dot" aria-hidden="true"></span>
      </button>
      <button type="button" :class="{ active: playersOpen }" @click="toggleDrawer('players')">
        <UserGroupIcon aria-hidden="true" />{{ $t('mobileShell.players') }}
        <span v-if="attention.players" class="nav-dot" aria-hidden="true"></span>
      </button>
      <button type="button" :class="{ active: logOpen }" @click="toggleDrawer('log')">
        <DocumentTextIcon aria-hidden="true" />{{ $t('mobileShell.log') }}
      </button>
    </nav>

    <OverlayDrawer
      v-if="ownInvestigator"
      :open="handOpen"
      keep-mounted
      side="bottom"
      :dock-target="bottomDockTarget"
      @close="handOpen = false"
    >
      <div class="mobile-hand">
        <Draw
          :game="game"
          :playerId="playerId"
          :investigator="ownInvestigator"
          @choose="emit('choose', $event)"
        />
        <PlayerHandCards
          class="mobile-hand-cards"
          :game="game"
          :playerId="playerId"
          :investigator="ownInvestigator"
          treachery-in-hand
          @choose="emit('choose', $event)"
        />
      </div>
    </OverlayDrawer>

    <OverlayDrawer :open="logOpen" side="right" @close="logOpen = false">
      <div class="mobile-log">
        <GameLog :game="game" :gameLog="gameLog" @undo="undoApi.undo" />
      </div>
    </OverlayDrawer>

    <!-- 快捷操作条：把藏在角色抽屉里的高频文字选项（跳过/结束回合）提到 shell 层（文字按钮一步直达原则）。
         bottom 偏移 = 选择浮窗高度 + 抽屉高度，浮在底部整叠之上，不与入流的 choice-dock/抽屉重叠。 -->
    <div
      v-if="skipIdx !== -1 || endTurnIdx !== -1"
      class="quick-actions"
      :style="{ bottom: quickActionsBottom }"
    >
      <button v-if="skipIdx !== -1" type="button" @click="emit('choose', skipIdx)">{{ $t('skip') }}</button>
      <button
        v-if="skipIdx !== -1 && skipAllAvailable"
        type="button"
        @click="skipAllTriggers && skipAllTriggers()"
      >{{ $t('investigator.skipAllTriggers') }}</button>
      <button v-if="endTurnIdx !== -1" type="button" @click="emit('choose', endTurnIdx)">{{ $t('investigator.endTurnShort') }}</button>
    </div>

    <OverlayDrawer :open="menuOpen" side="bottom" @close="menuOpen = false">
      <div class="mobile-menu">
        <button
          type="button"
          @click="runMenuItem(() => router.push({ name: 'CampaignLog', params: { gameId } }))"
        >
          <DocumentTextIcon aria-hidden="true" /> {{ $t('gameBar.viewLog') }}
        </button>
        <button
          v-for="item in visibleMenuItems"
          :key="item.id"
          type="button"
          @click="runMenuItem(item.action)"
        >
          <component v-if="item.icon" :is="item.icon" /> {{ item.content }}
        </button>
        <div v-if="canUndoAny" class="menu-undo-group">
          <span class="menu-section-title">{{ $t('game.undoTo') }}</span>
          <button
            v-if="undoApi.canUndoAction.value"
            type="button"
            @click="runMenuItem(undoApi.undoActionStart)"
          >
            {{ $t('game.startOfAction') }}
          </button>
          <button
            v-if="undoApi.canUndoTurn.value"
            type="button"
            @click="runMenuItem(undoApi.undoTurnStart)"
          >
            {{ $t('game.startOfTurn') }}
          </button>
          <button
            v-if="undoApi.canUndoPhase.value"
            type="button"
            @click="runMenuItem(undoApi.undoPhaseStart)"
          >
            {{ $t('game.startOfPhase') }}
          </button>
          <button
            v-if="undoApi.canUndoRound.value"
            type="button"
            @click="runMenuItem(undoApi.undoRoundStart)"
          >
            {{ $t('game.startOfRound') }}
          </button>
          <button
            v-if="undoApi.canUndoScenario.value"
            type="button"
            @click="runMenuItem(() => emit('undoScenario'))"
          >
            {{ $t('gameBar.restartScenario') }}
          </button>
        </div>
        <button type="button" @click="runMenuItem(debug.toggle)">
          {{ $t('gameBar.toggleDebug') }}
        </button>
        <button type="button" @click="runMenuItem(() => emit('fileBug'))">
          <ExclamationTriangleIcon aria-hidden="true" /> {{ $t('fileBug') }}
        </button>
      </div>
    </OverlayDrawer>
  </div>
</template>

<style lang="scss" scoped>
.mobile-play {
  --mobile-nav-height: 56px;
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
}

.mobile-top-bar {
  order: 0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  padding-top: calc(6px + env(safe-area-inset-top, 0px));
  background: var(--background-mid);
}

.top-bar-phases,
.top-bar-spacer {
  flex: 1;
  min-width: 0;
}

.top-bar-totals {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  /* PoolItem 的字号是 1.7em，按顶部条高度缩小 token */
  --pool-token-width: 22px;
  font-size: 0.6rem;
}

.top-bar-btn {
  flex-shrink: 0;
  width: 44px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--title);

  svg {
    width: 20px;
  }

  &--attention {
    box-shadow: 0 0 0 2px var(--select);
  }
}

.mobile-main {
  order: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  /* 战局中 Scenario 自身 height:100% 不溢出（地图滚动由内部 scroller 管）；
     整页内容（选补给/选牌组/战役间章等）超高时由这里纵向滚动。 */
  overflow-y: auto;
  overflow-x: hidden;
}

/* 选择浮窗入流停靠：排在底部抽屉之上、地图之下。空间紧张时先于抽屉收缩（自身滚动），
   保证 nav/header 不被挤出。空（无待选）时高度为 0，不占位。 */
.mobile-choice-dock {
  order: 2;
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mobile-bottom-drawer-dock {
  order: 3;
  flex: 0 0 auto;
  min-height: 0;
}

.mobile-nav {
  order: 4;
  flex-shrink: 0;
  display: flex;
  height: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--background-mid);
  border-top: 1px solid rgba(255, 255, 255, 0.08);

  button {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: 0;
    background: none;
    color: rgba(255, 255, 255, 0.55);
    font-size: 11px;

    svg {
      width: 20px;
    }

    &.active {
      color: var(--select);
    }
  }

  .nav-dot {
    position: absolute;
    top: 8px;
    right: 50%;
    transform: translateX(16px);
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--select);
  }
}

.mobile-hand {
  display: flex;
  gap: 8px;
  padding: 10px;
  align-items: flex-start;

  .mobile-hand-cards {
    flex: 1;
    min-width: 0;
    /* 手牌在抽屉里放大便于触控（对齐原浮层 4 倍卡宽的意图） */
    :deep(.card) {
      width: calc(var(--card-width) * 3);
      min-width: calc(var(--card-width) * 3);
    }
  }
}

.mobile-log {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #d0d9dc;

  @media (prefers-color-scheme: dark) {
    background: #1c1c1c;
  }
}

.mobile-menu {
  display: flex;
  flex-direction: column;
  padding: 8px;

  > button,
  .menu-undo-group button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 12px;
    border: 0;
    background: none;
    color: var(--title);
    font-size: 1em;
    text-align: left;

    svg {
      width: 18px;
    }
  }

  .menu-undo-group {
    display: flex;
    flex-direction: column;
    margin-block: 4px;
    border-block: 1px solid rgba(255, 255, 255, 0.1);
  }

  .menu-section-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: rgba(255, 255, 255, 0.5);
    padding: 8px 12px 2px;
  }
}

.quick-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px));
  z-index: 5001; /* 入流的 choice-dock/抽屉之上、body 浮层抽屉(10000) 之下 */
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  justify-content: center;
  pointer-events: none;

  button {
    pointer-events: auto;
    min-height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: 20px;
    background: var(--select);
    color: #fff;
    font-weight: 700;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }
}
</style>
