<script lang="ts" setup>
// 手机顶部紧凑阶段条：替代桌面 .phases 侧栏（竖屏 ≤768px 下本就被 Scenario.vue 隐藏）。
// 只到阶段粒度；子步骤 tooltip 在触屏不可用，不搬。
import { computed } from 'vue'
import type { Game } from '@/arkham/types/Game'

const props = defineProps<{ game: Game }>()
const phase = computed(() => props.game.phase)

const PHASES: { key: string; label: string }[] = [
  { key: 'MythosPhase', label: 'phase.mythosPhase' },
  { key: 'InvestigationPhase', label: 'phase.investigationPhase' },
  { key: 'EnemyPhase', label: 'phase.enemyPhase' },
  { key: 'UpkeepPhase', label: 'phase.upkeepPhase' },
]
</script>

<template>
  <div class="mobile-phase-bar">
    <div
      v-for="p in PHASES"
      :key="p.key"
      class="phase-chip"
      :class="{ 'phase-chip--active': phase === p.key }"
    >
      {{ $t(p.label) }}
    </div>
  </div>
</template>

<style scoped>
.mobile-phase-bar {
  display: flex;
  gap: 4px;
  align-items: center;
  overflow-x: auto;
  min-width: 0;
}

.phase-chip {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.06);
  white-space: nowrap;
}

.phase-chip--active {
  color: #fff;
  background: var(--select, #6f42c1);
  font-weight: 700;
}
</style>
