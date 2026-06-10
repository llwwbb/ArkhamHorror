<script lang="ts" setup>
import Draggable from '@/components/Draggable.vue'
import { useMenu } from '@/composable/menu'

defineEmits<{ close: [] }>()

const { menuItems } = useMenu()
</script>

<template>
  <Draggable>
    <div class="shortcuts-modal">
      <div class="shortcuts-header">
        <h2 class="shortcuts-title">{{ $t('gameBar.shortcutsTitle') }}</h2>
      </div>

      <div class="shortcuts-body">
        <section class="shortcuts-section">
          <h3 class="section-title">{{ $t('game.shortcutSection.game') }}</h3>
          <div class="shortcut-list">
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('gameBar.shortcutSkipTriggers') }}</div>
              <div class="shortcut-keys"><kbd> </kbd></div>
            </div>
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('gameBar.shortcutEndTurn') }}</div>
              <div class="shortcut-keys"><kbd>e</kbd></div>
            </div>
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('gameBar.shortcutDraw') }}</div>
              <div class="shortcut-keys"><kbd>d</kbd></div>
            </div>
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('gameBar.shortcutTakeResources') }}</div>
              <div class="shortcut-keys"><kbd>r</kbd></div>
            </div>
          </div>
        </section>

        <section class="shortcuts-section">
          <h3 class="section-title">{{ $t('game.shortcutSection.undo') }}</h3>
          <div class="shortcut-list">
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('gameBar.shortcutUndo') }}</div>
              <div class="shortcut-keys"><kbd>u</kbd></div>
            </div>
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('game.shortcutUndoActionStart') }}</div>
              <div class="shortcut-keys">
                <kbd>U</kbd><span class="chord-arrow">+</span><kbd>A</kbd>
              </div>
            </div>
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('game.shortcutUndoTurnStart') }}</div>
              <div class="shortcut-keys">
                <kbd>U</kbd><span class="chord-arrow">+</span><kbd>T</kbd>
              </div>
            </div>
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('game.shortcutUndoPhaseStart') }}</div>
              <div class="shortcut-keys">
                <kbd>U</kbd><span class="chord-arrow">+</span><kbd>P</kbd>
              </div>
            </div>
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('game.shortcutUndoRoundStart') }}</div>
              <div class="shortcut-keys">
                <kbd>U</kbd><span class="chord-arrow">+</span><kbd>R</kbd>
              </div>
            </div>
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('gameBar.shortcutRestartScenario') }}</div>
              <div class="shortcut-keys">
                <kbd>U</kbd><span class="chord-arrow">+</span><kbd>S</kbd>
              </div>
            </div>
          </div>
        </section>

        <section class="shortcuts-section">
          <h3 class="section-title">{{ $t('game.shortcutSection.view') }}</h3>
          <div class="shortcut-list">
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('gameBar.shortcutShowOrHideShortcuts') }}</div>
              <div class="shortcut-keys"><kbd>?</kbd></div>
            </div>
            <div class="shortcut-row">
              <div class="shortcut-name">{{ $t('gameBar.shortcutToggleDebug') }}</div>
              <div class="shortcut-keys"><kbd>D</kbd></div>
            </div>
            <template v-for="item in menuItems" :key="item.id">
              <div v-if="item.shortcut" class="shortcut-row">
                <div class="shortcut-name">{{ item.content }}</div>
                <div class="shortcut-keys">
                  <kbd>{{ item.shortcut }}</kbd>
                </div>
              </div>
            </template>
          </div>
        </section>
      </div>

      <button class="shortcuts-footer" @click="$emit('close')">{{ $t('close') }}</button>
    </div>
  </Draggable>
</template>

<style lang="scss" scoped>
.shortcuts-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 75vh;
  background: var(--background);
  color: var(--text);
}

.shortcuts-header {
  flex-shrink: 0;
  padding: 8px 16px;
  background: var(--background-dark);
  border-bottom: 1px solid var(--box-border);
}

.shortcuts-title {
  margin: 0;
  font-family: Teutonic, serif;
  font-size: 20px;
  color: var(--text);
  text-transform: none;
}

.shortcuts-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.shortcuts-section {
  display: flex;
  flex-direction: column;

  .section-title {
    margin: 0 0 10px;
    padding-bottom: 6px;
    font-family: Teutonic, serif;
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--title);
    border-bottom: 1px solid var(--box-border);
  }
}

.shortcut-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 6px;
}

.shortcut-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 10px 14px;
  background: var(--box-background);
  border: 1px solid var(--box-border);
  border-radius: 5px;
}

.shortcut-row:hover {
  background: var(--background-mid);
}

.shortcut-name {
  font-size: 14px;
  color: var(--text);
  min-width: 0;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;

  kbd {
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 26px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 700;
    border-radius: 4px;
    background: var(--background-dark);
    border: 1px solid var(--box-border);
    color: var(--text);
    line-height: 1;
  }

  .chord-arrow {
    opacity: 0.5;
    font-size: 12px;
  }
}

.shortcuts-footer {
  flex-shrink: 0;
  width: 100%;
  padding: 8px 16px;
  border: none;
  border-top: 1px solid var(--box-border);
  background: var(--button-2);
  color: var(--text);
  font-family: Teutonic, serif;
  font-size: 14px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  text-align: center;
}

.shortcuts-footer:hover {
  background: var(--button-2-highlight);
}

@media (max-width: 700px) {
  .shortcuts-header,
  .shortcuts-footer {
    padding-left: 16px;
    padding-right: 16px;
  }
  .shortcuts-body {
    padding: 14px 16px;
  }
}
</style>
