<script lang="ts" setup>
import { imgsrc } from '@/arkham/helpers'

defineEmits<{ continue: [] }>()
</script>

<template>
  <div class="the-silence-modal-backdrop">
    <div class="the-silence-modal" role="dialog" aria-modal="true" aria-labelledby="the-silence-modal-title">
      <img class="the-silence-modal__agenda no-overlay" :src="imgsrc('cards/10652.avif')" alt="The Silence" />
      <div class="the-silence-modal__body">
        <h2 id="the-silence-modal-title">The Silence</h2>
        <p>If you look at the Cosmic Emissary enemy for more than 15 seconds at a time, you are <strong>driven insane</strong>.</p>
        <div class="the-silence-modal__actions">
          <button type="button" class="the-silence-modal__confirm" @click="$emit('continue')">{{ $t('ok') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.the-silence-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.65);
}

.the-silence-modal {
  display: flex;
  gap: 18px;
  max-width: min(760px, 100%);
  padding: 18px;
  border: 1px solid rgba(79, 224, 214, 0.65);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(5, 29, 35, 0.98), rgba(12, 75, 82, 0.98));
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.7), 0 0 28px rgba(79, 224, 214, 0.38);
  color: #d8fffb;
}

.the-silence-modal__agenda {
  width: min(280px, 34vw);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
}

.the-silence-modal__body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 360px;
  font-family: Arial, sans-serif;
  text-align: left;
}

.the-silence-modal__body h2 {
  margin: 0 0 10px;
  font-family: Teutonic, Georgia, serif;
  font-size: 1.7rem;
  color: #bffff8;
}

.the-silence-modal__body p {
  margin: 0;
  line-height: 1.45;
}

.the-silence-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.the-silence-modal__actions button {
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  color: white;
  cursor: pointer;
}

.the-silence-modal__confirm {
  background: rgba(12, 112, 119, 0.95);
  box-shadow: 0 0 12px rgba(79, 224, 214, 0.28);
}

@media (max-width: 650px) {
  .the-silence-modal {
    flex-direction: column;
    align-items: center;
  }

  .the-silence-modal__agenda {
    width: min(280px, 72vw);
  }
}
</style>
