<script lang="ts" setup>
import { cardImg } from '@/arkham/helpers'

export interface PlayabilityInfo {
  cardId: string
  cardCode: string
  checks: [string, string | null][]
}

defineProps<{ info: PlayabilityInfo }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="debug-modal-overlay" @click.self="$emit('close')">
    <div class="debug-playability-modal">
      <h3>{{ $t('game.playabilityChecks') }}</h3>
      <div class="debug-playability-content">
        <img
          class="debug-card-image"
          :src="cardImg(info.cardCode.replace('c', ''))"
        />
        <ul class="playability-checks">
          <li
            v-for="[name, detail] in info.checks"
            :key="name"
            :class="detail === null ? 'check-passed' : 'check-failed'"
          >
            <span class="check-icon">{{ detail === null ? '✓' : '✗' }}</span>
            <span class="check-name">{{ name }}</span>
            <span v-if="detail !== null" class="check-detail">{{ detail }}</span>
          </li>
        </ul>
      </div>
      <button @click="$emit('close')">{{ $t('close') }}</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.debug-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.debug-playability-modal {
  background: #1a1a2e;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 1.5rem;
  min-width: 300px;
  max-width: 700px;
  color: #eee;

  h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    color: #adf;
  }

  button {
    margin-top: 1rem;
  }
}

.debug-playability-content {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

.debug-card-image {
  width: 150px;
  border-radius: 6px;
  flex-shrink: 0;
}

.playability-checks {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;

  li {
    padding: 0.3rem 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
}

.check-name {
  font-weight: 500;
}
.check-detail {
  font-size: 0.85rem;
  opacity: 0.8;
  font-style: italic;
}
.check-passed {
  color: #4f4;
}
.check-failed {
  color: #f44;
}
.check-icon {
  font-weight: bold;
  width: 1rem;
  flex-shrink: 0;
}
</style>
