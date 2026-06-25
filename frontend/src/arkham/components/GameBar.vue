<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { MenuItem } from '@headlessui/vue'
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  ArrowUturnLeftIcon,
  BackwardIcon,
  BeakerIcon,
  BoltIcon,
  BugAntIcon,
  ClockIcon,
  DocumentArrowDownIcon,
  DocumentTextIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  FlagIcon,
  RectangleStackIcon,
} from '@heroicons/vue/20/solid'
import api from '@/api'
import { useUserStore } from '@/stores/user'
import { useMenu } from '@/composable/menu'
import { useDebug } from '@/arkham/debug'
import Menu from '@/components/Menu.vue'

const props = defineProps<{
  gameId: string
  showLog: boolean
  undoChordArmed: boolean
  canUndoAction: boolean
  canUndoTurn: boolean
  canUndoPhase: boolean
  canUndoRound: boolean
  canUndoScenario: boolean
}>()

const emit = defineEmits<{
  toggleShortcuts: []
  toggleLog: []
  undo: []
  undoAction: []
  undoTurn: []
  undoPhase: []
  undoRound: []
  undoScenario: []
  fileBug: []
  toggleSidebar: []
}>()

const userStore = useUserStore()
const debug = useDebug()
const { menuItems } = useMenu()
const { t } = useI18n()

type ExportType = 'basic' | 'full' | 'scenario'
function debugExport(exportType: ExportType) {
  api
    .get(
      `arkham/games/${props.gameId}/${exportType == 'full' ? 'full-' : exportType == 'scenario' ? 'scenario-' : ''}export`,
      { responseType: 'blob' },
    )
    .then((resp) => {
      const url = window.URL.createObjectURL(resp.data)
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      // the filename you want
      a.download = 'arkham-debug.json'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
    })
    .catch((e) => {
      console.log(e)
      alert(t('game.unableToDownloadExport'))
    })
}
</script>

<template>
  <div class="game-bar">
    <div class="game-bar-item">
      <div>
        <button @click="emit('toggleLog')">
          <DocumentTextIcon aria-hidden="true" />
          {{ showLog ? $t('gameBar.closeLog') : $t('gameBar.viewLog') }}
        </button>
      </div>
    </div>
    <div>
      <Menu>
        <EyeIcon aria-hidden="true" />
        {{ $t('gameBar.view') }}
        <template #items>
          <MenuItem v-slot="{ active }">
            <button :class="{ active }" @click="emit('toggleShortcuts')">
              <BoltIcon aria-hidden="true" /> {{ $t('gameBar.shortcuts') }}
              <span class="shortcut">?</span>
            </button>
          </MenuItem>
          <template v-for="item in menuItems" :key="item.id">
            <MenuItem v-if="item.nested === 'view'" v-slot="{ active }">
              <button :class="{ active }" @click="item.action">
                <component v-if="item.icon" v-bind:is="item.icon"></component>
                {{ item.content }}
                <span v-if="item.shortcut" class="shortcut">{{ item.shortcut }}</span>
              </button>
            </MenuItem>
          </template>
        </template>
      </Menu>
    </div>
    <div>
      <Menu>
        <BeakerIcon aria-hidden="true" />
        {{ $t('gameBar.debug') }}
        <template #items>
          <MenuItem v-slot="{ active }">
            <button :class="{ active }" @click="debug.toggle">
              <BugAntIcon aria-hidden="true" /> {{ $t('gameBar.toggleDebug') }}
              <span class="shortcut">D</span>
            </button>
          </MenuItem>
          <MenuItem v-slot="{ active }">
            <button :class="{ active }" @click="debugExport('basic')">
              <DocumentArrowDownIcon aria-hidden="true" /> {{ $t('gameBar.debugExport') }}
            </button>
          </MenuItem>
          <MenuItem v-if="userStore.isAdmin" v-slot="{ active }">
            <button :class="{ active }" @click="debugExport('scenario')">
              <DocumentArrowDownIcon aria-hidden="true" /> {{ $t('gameBar.debugExportScenario') }}
            </button>
          </MenuItem>
          <MenuItem v-if="userStore.isAdmin" v-slot="{ active }">
            <button :class="{ active }" @click="debugExport('full')">
              <DocumentArrowDownIcon aria-hidden="true" /> {{ $t('gameBar.debugExportFull') }}
            </button>
          </MenuItem>
        </template>
      </Menu>
    </div>
    <div>
      <Menu>
        <BackwardIcon aria-hidden="true" />
        {{ $t('gameBar.undo') }}
        <template #items>
          <MenuItem v-slot="{ active }">
            <button :class="{ active }" @click="emit('undo')">
              <BackwardIcon aria-hidden="true" /> {{ $t('gameBar.undo') }}
              <span class="shortcut">u</span>
            </button>
          </MenuItem>
          <div
            v-if="canUndoAction || canUndoTurn || canUndoPhase || canUndoRound || canUndoScenario"
            class="undo-jump-group"
            :class="{ armed: undoChordArmed }"
          >
            <div class="undo-jump-header">
              <span>{{ $t('game.undoTo') }}</span>
              <span class="chord-prefix"><kbd>U</kbd> + <span class="chord-hint">…</span></span>
            </div>
            <MenuItem v-if="canUndoAction" v-slot="{ active }">
              <button class="undo-jump scope-action" :class="{ active }" @click="emit('undoAction')">
                <ArrowUturnLeftIcon aria-hidden="true" />
                <span class="undo-jump-label">{{ $t('game.startOfAction') }}</span>
                <kbd class="chord-key">A</kbd>
              </button>
            </MenuItem>
            <MenuItem v-if="canUndoTurn" v-slot="{ active }">
              <button class="undo-jump scope-turn" :class="{ active }" @click="emit('undoTurn')">
                <ClockIcon aria-hidden="true" />
                <span class="undo-jump-label">{{ $t('game.startOfTurn') }}</span>
                <kbd class="chord-key">T</kbd>
              </button>
            </MenuItem>
            <MenuItem v-if="canUndoPhase" v-slot="{ active }">
              <button class="undo-jump scope-phase" :class="{ active }" @click="emit('undoPhase')">
                <RectangleStackIcon aria-hidden="true" />
                <span class="undo-jump-label">{{ $t('game.startOfPhase') }}</span>
                <kbd class="chord-key">P</kbd>
              </button>
            </MenuItem>
            <MenuItem v-if="canUndoRound" v-slot="{ active }">
              <button class="undo-jump scope-round" :class="{ active }" @click="emit('undoRound')">
                <ArrowPathIcon aria-hidden="true" />
                <span class="undo-jump-label">{{ $t('game.startOfRound') }}</span>
                <kbd class="chord-key">R</kbd>
              </button>
            </MenuItem>
            <MenuItem v-if="canUndoScenario" v-slot="{ active }">
              <button
                class="undo-jump scope-scenario"
                :class="{ active }"
                @click="emit('undoScenario')"
              >
                <FlagIcon aria-hidden="true" />
                <span class="undo-jump-label">{{ $t('gameBar.restartScenario') }}</span>
                <kbd class="chord-key">S</kbd>
              </button>
            </MenuItem>
          </div>
        </template>
      </Menu>
    </div>
    <div>
      <button @click="emit('fileBug')">
        <ExclamationTriangleIcon aria-hidden="true" /> {{ $t('fileBug') }}
      </button>
    </div>
    <div v-for="item in menuItems" :key="item.id">
      <template v-if="item.nested === null || item.nested === undefined">
        <button @click="item.action">
          <component v-if="item.icon" v-bind:is="item.icon"></component>
          {{ item.content }}
        </button>
      </template>
    </div>
    <div class="right">
      <button @click="emit('toggleSidebar')">
        <ArrowsRightLeftIcon aria-hidden="true" /> {{ $t('gameBar.toggleSidebar') }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.game-bar {
  display: flex;
  margin: 0;
  padding: 0;
  background: var(--background-mid);
  div {
    &.right {
      margin-left: auto;
    }
    display: inline;
    transition: 0.3s;
    height: 100%;
    a {
      display: inline;
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
  }
  justify-content: flex-start;
}

.game-bar-item.active,
.game-bar-item:hover {
  background: rgba(0, 0, 0, 0.21);
  color: var(--title);
}

.undo-jump-group {
  background: rgba(0, 0, 0, 0.22);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;
  overflow: hidden;
  transition:
    box-shadow 0.2s ease,
    background 0.2s ease;

  &.armed {
    background: rgba(0, 0, 0, 0.35);
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.3),
      0 0 0 1px rgba(127, 184, 212, 0.6),
      0 0 12px rgba(127, 184, 212, 0.35);
  }
}

.game-bar div .undo-jump-header {
  display: flex;
}

.undo-jump-header {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: rgba(255, 255, 255, 0.55);
  padding: 8px 10px 6px 10px;
  user-select: none;
  pointer-events: none;
  align-items: center;
  gap: 8px;
}

.chord-prefix {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  letter-spacing: normal;
  text-transform: none;

  kbd {
    font-family: inherit;
    font-size: inherit;
    font-weight: bold;
    padding: 2px 5px;
    border-radius: 4px;
    background-color: var(--box-background);
    border: 1px solid var(--title);
    color: white;
    line-height: 1;
  }

  .chord-hint {
    opacity: 0.6;
  }
}

.undo-jump-group.armed .chord-prefix kbd {
  background-color: var(--box-border);
}

.chord-key {
  font-family: inherit;
  font-size: inherit;
  font-weight: bold;
  margin-left: auto;
  padding: 2px 5px;
  border-radius: 4px;
  background-color: var(--box-background);
  border: 1px solid var(--title);
  color: white;
  line-height: 1;
}

.undo-jump:hover .chord-key,
.undo-jump.active .chord-key,
.undo-jump-group.armed .chord-key {
  background-color: var(--box-border);
}

.undo-jump {
  position: relative;
  width: 100%;
  padding: 5px 10px 5px 18px !important;
  background: rgba(0, 0, 0, 0.4);

  &::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 2px;
    background: var(--undo-scope);
    opacity: 0.55;
    transition:
      opacity 0.15s ease,
      transform 0.15s ease;
  }

  svg {
    color: var(--undo-scope);
  }

  &.scope-action {
    --undo-scope: #7fb8d4;
  }
  &.scope-turn {
    --undo-scope: #6cc28d;
  }
  &.scope-phase {
    --undo-scope: #e0b256;
  }
  &.scope-round {
    --undo-scope: #c97aa8;
  }
  &.scope-scenario {
    --undo-scope: #d96a6a;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.6);
  }

  &:hover::before,
  &.active::before {
    opacity: 1;
    transform: scaleX(1.5);
  }
}

.shortcut {
  margin-left: auto;
  border: 1px solid var(--title);
  background-color: var(--box-background);
  padding: 2px 5px;
  border-radius: 4px;
}

button:hover .shortcut {
  background-color: var(--box-border);
}
</style>
