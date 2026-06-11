<script lang="ts" setup>
// 手机 shell（spec §4）：全屏地图为底，顶部 阶段条+撤销+汉堡，底部导航，统一浮层。
// 逻辑（socket/undo/modals）全在 Game.vue，这里只做 chrome 与编排。
import { computed, nextTick, reactive, ref, watch } from 'vue'
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
import { useMenu } from '@/composable/menu'
import { useDebug } from '@/arkham/debug'
import MobilePhaseBar from '@/arkham/components/MobilePhaseBar.vue'
import ActiveGameModals from '@/arkham/components/ActiveGameModals.vue'
import ChoiceModal from '@/arkham/components/ChoiceModal.vue'
import GameMain from '@/arkham/components/GameMain.vue'
import GameLog from '@/arkham/components/GameLog.vue'
import OverlayDrawer from '@/components/OverlayDrawer.vue'
import PlayerHandCards from '@/arkham/components/PlayerHandCards.vue'
import Draw from '@/arkham/components/Draw.vue'

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
providePhoneShell({ handOpen, playersOpen })

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
// 待办指示：轮到本玩家选择时高亮（Task 11 起配合 Question 停靠使用）
const hasQuestion = computed(() => !!props.game.question[props.playerId])

// 自己的 investigator：手牌抽屉只对在场玩家渲染（旁观时为 null，不出手牌 tab）
const gameIndexes = useGameIndexes(() => props.game)
const ownInvestigator = computed(
  () => gameIndexes.value.investigatorByPlayerId.get(props.playerId) ?? null,
)

// 技能检定开始自动展开手牌便于投入；结束自动收起。
// 经 toggleDrawer 同款互斥逻辑，避免与其他抽屉叠层。
watch(
  () => props.game.skillTest,
  (st, prev) => {
    if (st && !prev) {
      for (const d of Object.values(drawers)) d.value = false
      handOpen.value = true
    } else if (!st && prev) {
      handOpen.value = false
    }
  },
)

// 抽屉自动联动：可操作元素只在单一区域时自动打开对应抽屉，离开时自动收起。
// DOM 探测（与 touchTapIntercept 的类约定一致）：keep-mounted 抽屉关闭时内容仍挂载
// （v-show），querySelector 可达，无需解析 Question 模型。
const ACTIONABLE = '[class*="--can-interact"], [class*="--can-progress"], .can-interact'

// autoOpened: 当前由自动逻辑打开的抽屉名，null 表示未自动打开任何抽屉。
const autoOpened = ref<'hand' | 'players' | null>(null)
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
    // 技能检定期间手牌抽屉的 watch 优先，不做自动开/收
    if (props.game.skillTest) return
    const zones = scanActionableZones()

    // 刷新红点（抽屉已开时不亮）
    attention.players = zones.players && !playersOpen.value
    attention.hand = zones.hand && !handOpen.value

    if (!hasQuestion.value || zones.elsewhere) return

    // 恰好一个抽屉区有可操作元素 → 自动打开
    const onlyPlayers = zones.players && !zones.hand
    const onlyHand = zones.hand && !zones.players

    if (onlyPlayers && !playersOpen.value) {
      for (const d of Object.values(drawers)) d.value = false
      playersOpen.value = true
      autoOpened.value = 'players'
      attention.players = false
    } else if (onlyHand && !handOpen.value) {
      for (const d of Object.values(drawers)) d.value = false
      handOpen.value = true
      autoOpened.value = 'hand'
      attention.hand = false
    } else if (autoOpened.value) {
      // 条件不再满足（两区同时有、或对应区消失、或 question 消失）→ 自动收起
      const wasOpen = autoOpened.value
      const stillActive =
        (wasOpen === 'players' && zones.players) || (wasOpen === 'hand' && zones.hand)
      if (!stillActive) {
        drawers[wasOpen].value = false
        autoOpened.value = null
      }
    }
  },
  { flush: 'post' },
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

function runMenuItem(action: () => void) {
  menuOpen.value = false
  action()
}
</script>

<template>
  <!-- mobile-play--question：有待选 Question 时的样式钩子，当前无消费者（停靠版 ChoiceModal 自带 fixed 定位） -->
  <div class="mobile-play" :class="{ 'mobile-play--question': hasQuestion }">
    <header class="mobile-top-bar">
      <MobilePhaseBar v-if="inPlay" :game="game" class="top-bar-phases" />
      <span v-else class="top-bar-spacer"></span>
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

    <!-- 停靠版 Question：镜像桌面的挂载语义——只为本玩家渲染（旁观者无，桌面 Player 内
         ChoiceModal 同理），且战役间章（CampaignPhase）不渲染（桌面此时 Player 未挂载，
         问题由 StoryQuestion/Campaign UI 呈现，停靠版会重复）。 -->
    <ChoiceModal
      v-if="ownInvestigator && game.phase !== 'CampaignPhase'"
      docked
      :game="game"
      :playerId="playerId"
      @choose="emit('choose', $event)"
    />

    <OverlayDrawer
      v-if="ownInvestigator"
      :open="handOpen"
      keep-mounted
      side="bottom"
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
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.mobile-nav {
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
</style>
