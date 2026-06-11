<script lang="ts" setup>
// 统一浮层系统（spec §4）：底部 sheet / 右侧抽屉，带遮罩与滑入动画。
// - keepMounted：v-show 切换，保留内部组件状态（如 PlayerTabs 选中页）
// - inline：透传模式，原地渲染 slot 不做浮层（桌面与手机复用同一段模板时用）
// - panelMaxWidth：约束面板宽度（如平板上的 bottom sheet 保持浮窗感），背景遮罩不受影响
// - zIndex：覆盖默认 10000；同 z 层 teleport 按 DOM 顺序覆盖，二步确认 sheet 须高于抽屉
withDefaults(
  defineProps<{
    open: boolean
    side?: 'bottom' | 'right'
    keepMounted?: boolean
    inline?: boolean
    panelMaxWidth?: string
    zIndex?: number
  }>(),
  { side: 'bottom', keepMounted: false, inline: false },
)
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <slot v-if="inline" />
  <Teleport v-else to="body">
    <Transition name="overlay-drawer" appear>
      <div
        v-if="keepMounted || open"
        v-show="open"
        class="overlay-drawer-backdrop"
        :class="`overlay-drawer-backdrop--${side}`"
        :style="zIndex ? { zIndex } : undefined"
        @click.self="emit('close')"
      >
        <div
          class="overlay-drawer"
          :class="`overlay-drawer--${side}`"
          :style="panelMaxWidth ? { maxWidth: panelMaxWidth } : undefined"
        >
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
}

.overlay-drawer-backdrop--bottom {
  align-items: flex-end;
  justify-content: center;
}

.overlay-drawer-backdrop--right {
  justify-content: flex-end;
}

.overlay-drawer {
  background: var(--background, #1c1c1c);
  overflow: auto;
  overscroll-behavior: contain;
}

.overlay-drawer--bottom {
  width: 100%;
  max-height: 85dvh;
  border-radius: 12px 12px 0 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.overlay-drawer--right {
  height: 100dvh;
  width: min(85vw, 360px);
  box-shadow: -2px 0 16px rgba(0, 0, 0, 0.45);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.overlay-drawer-enter-active,
.overlay-drawer-leave-active {
  transition: opacity 0.18s ease;
}

.overlay-drawer-enter-active .overlay-drawer,
.overlay-drawer-leave-active .overlay-drawer {
  transition: transform 0.18s ease;
}

.overlay-drawer-enter-from,
.overlay-drawer-leave-to {
  opacity: 0;
}

.overlay-drawer-enter-from .overlay-drawer--bottom,
.overlay-drawer-leave-to .overlay-drawer--bottom {
  transform: translateY(100%);
}

.overlay-drawer-enter-from .overlay-drawer--right,
.overlay-drawer-leave-to .overlay-drawer--right {
  transform: translateX(100%);
}
</style>
