<script lang="ts" setup>
// 手机 shell（spec §4）：全屏地图为底，顶部 阶段条+撤销+汉堡，底部导航，统一浮层。
// 逻辑（socket/undo/modals）全在 Game.vue，这里只做 chrome 与编排。
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bars3Icon,
  BackwardIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  MapIcon,
} from '@heroicons/vue/20/solid'
import type { Game } from '@/arkham/types/Game'
import type { GameModals } from '@/arkham/composables/useGameModals'
import type { GameUndoApi } from '@/arkham/composables/useGameUndo'
import { providePhoneShell } from '@/arkham/composables/phoneShell'
import { useMenu } from '@/composable/menu'
import { useDebug } from '@/arkham/debug'
import MobilePhaseBar from '@/arkham/components/MobilePhaseBar.vue'
import ActiveGameModals from '@/arkham/components/ActiveGameModals.vue'
import GameMain from '@/arkham/components/GameMain.vue'
import GameLog from '@/arkham/components/GameLog.vue'
import OverlayDrawer from '@/components/OverlayDrawer.vue'

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
}
function closeAllDrawers() {
  for (const d of Object.values(drawers)) d.value = false
  menuOpen.value = false
}

const inPlay = computed(() => props.game.gameState.tag === 'IsActive' && props.game.scenario !== null)
// 待办指示：轮到本玩家选择时高亮（Task 11 起配合 Question 停靠使用）
const hasQuestion = computed(() => !!props.game.question[props.playerId])

// 技能检定开始时自动展开手牌（对齐原 Player.vue 移动浮层行为）——Task 10 启用手牌抽屉后生效
watch(
  () => props.game.skillTest,
  (st) => {
    handOpen.value = !!st
  },
)

function runMenuItem(action: () => void) {
  menuOpen.value = false
  action()
}
</script>

<template>
  <!-- mobile-play--question：Task 11 Question 停靠的样式钩子，当前无消费者 -->
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
      <button type="button" :class="{ active: logOpen }" @click="toggleDrawer('log')">
        <DocumentTextIcon aria-hidden="true" />{{ $t('mobileShell.log') }}
      </button>
    </nav>

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
