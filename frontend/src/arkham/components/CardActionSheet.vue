<script lang="ts" setup>
import { computed } from 'vue'
import { getCardImage } from '@/arkham/cardImageLookup'
import OverlayDrawer from '@/components/OverlayDrawer.vue'

const props = defineProps<{
  target: HTMLElement
  actionable: boolean
}>()

const emit = defineEmits<{
  confirm: []
  close: []
}>()

const image = computed(() => getCardImage(props.target))
</script>

<template>
  <!-- .card-action-sheet 类被 touchTapIntercept 的放行判断引用，保留 -->
  <OverlayDrawer :open="true" side="bottom" panel-max-width="480px" :z-index="10002" @close="emit('close')">
    <div class="card-action-sheet no-overlay">
      <img v-if="image" :src="image" class="sheet-card" />
      <div class="sheet-actions">
        <button v-if="actionable" class="sheet-confirm" @click="emit('confirm')">
          {{ $t('cardSheet.perform') }}
        </button>
        <button class="sheet-cancel" @click="emit('close')">{{ $t('cancel') }}</button>
      </div>
    </div>
  </OverlayDrawer>
</template>

<style scoped>
.card-action-sheet {
  width: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.sheet-card {
  max-height: 50dvh;
  max-width: 100%;
  border-radius: 8px;
  object-fit: contain;
}

.sheet-actions {
  display: flex;
  gap: 10px;
  width: 100%;
}

.sheet-actions button {
  flex: 1;
  min-height: 48px;
  border: none;
  border-radius: 8px;
  font-size: 1em;
  cursor: pointer;
}

.sheet-confirm {
  background: var(--select, #ff00ff);
  color: white;
  font-weight: 700;
}

.sheet-cancel {
  background: rgba(255, 255, 255, 0.12);
  color: var(--title, #cecece);
}
</style>
