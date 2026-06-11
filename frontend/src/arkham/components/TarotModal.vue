<script lang="ts" setup>
import { imgsrc } from '@/arkham/helpers'
import { TarotCard, tarotCardImage } from '@/arkham/types/TarotCard'

defineProps<{ tarotCards: TarotCard[] }>()
defineEmits<{ continue: [] }>()
</script>

<template>
  <div class="revelation">
    <div class="revelation-container">
      <div class="revelation-card-container">
        <div class="tarot-cards">
          <div v-for="(tarotCard, idx) in tarotCards" :key="idx" class="tarot-card">
            <div class="card-container">
              <img
                :src="imgsrc(`tarot/${tarotCardImage(tarotCard)}`)"
                class="tarot"
                :class="tarotCard.facing"
              />
            </div>
            <img :src="imgsrc('tarot/back.jpg')" class="card back" />
          </div>
        </div>
        <button @click="$emit('continue')">{{ $t('ok') }}</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@keyframes revelation {
  0% {
    opacity: 0;
    transform: scale(0);
  }

  65% {
    transform: scale(1.3);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes glow {
  0% {
    filter: drop-shadow(0 0 3vmin Indigo) drop-shadow(0 5vmin 4vmin Orchid)
      drop-shadow(2vmin -2vmin 15vmin MediumSlateBlue) drop-shadow(0 0 7vmin MediumOrchid);
  }
  50% {
    filter: drop-shadow(0 0 3vmin Indigo) drop-shadow(0 5vmin 4vmin Orchid)
      drop-shadow(2vmin -2vmin 15vmin MediumSlateBlue) drop-shadow(0 0 7vmin Black);
  }
  100% {
    filter: drop-shadow(0 0 3vmin Indigo) drop-shadow(0 5vmin 4vmin Orchid)
      drop-shadow(2vmin -2vmin 15vmin MediumSlateBlue) drop-shadow(0 0 7vmin MediumOrchid);
  }
}

@keyframes flip-back {
  0% {
    opacity: 1;
    transform: rotateY(0deg);
  }

  49% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }

  100% {
    transform: rotateY(-180deg);
    opacity: 0;
  }
}

@keyframes flip-front {
  0% {
    transform: rotateY(180deg);
    opacity: 0;
  }

  49% {
    opacity: 0;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 1;
    transform: rotateY(0deg);
  }
}

.revelation {
  position: absolute;
  transform: all 0.5s;
  z-index: 1000;
  color: white;
  text-align: center;
  margin: auto;
  inset: 0;
  width: fit-content;
  height: fit-content;
  display: grid;
  /* glow effect */
  filter: drop-shadow(0 0 3vmin Indigo) drop-shadow(0 5vmin 4vmin Orchid)
    drop-shadow(2vmin -2vmin 15vmin MediumSlateBlue) drop-shadow(0 0 7vmin MediumOrchid);
  animation:
    revelation 0.3s ease-in-out,
    glow 4s cubic-bezier(0.55, 0.085, 0.68, 0.53) infinite;

  button {
    width: 100%;
    border: 0;
    padding: 10px;
    text-transform: uppercase;
    background-color: #532e61;
    font-weight: bold;
    color: #eee;
    font: Arial, sans-serif;
    &:hover {
      background-color: #311b3e;
    }

    i {
      font-style: normal;
    }

    .card {
      border-radius: 15px;
    }
  }

  h2 {
    font-family: Teutonic;
    text-transform: uppercase;
    margin: 0;
    padding: 0;
    font-size: 2.5em;
  }

  :deep(.card) {
    animation: revelation 0.6s ease-in-out;
    width: 300px !important;
    aspect-ratio: var(--card-aspect);
    overflow: hidden;
    border-radius: 15px;
  }
}

.revelation-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  align-self: center;
  align-content: center;
  justify-content: center;
  justify-items: center;
  justify-self: center;
}

.revelation-card-container {
  display: flex;
  flex-direction: column;
  width: fit-content;
  height: fit-content;
  gap: 10px;

  .tarot-cards {
    gap: 15px;
    display: flex;
    flex-direction: row;
    width: fit-content;
    height: fit-content;
    &:deep(img) {
      border-radius: 10px;
    }
  }

  .tarot {
    width: 300px;
    aspect-ratio: 8/14;
  }

  .tarot-card:nth-child(1) {
    animation-delay: 0.3s;
  }

  .tarot-card:nth-child(2) {
    animation-delay: 0.6s;
  }

  .tarot-card:nth-child(3) {
    animation-delay: 0.9s;
  }

  .tarot-card {
    position: relative;
    width: 300px;
    padding-bottom: 15px;
    aspect-ratio: 8/14;
    perspective: 1000px;
    .Reversed {
      transform: rotateZ(180deg);
    }
    .card-container {
      transform: rotateY(-180deg);
      transform-style: preserve-3d;
      position: absolute;
      top: 0;
      left: 0;
      backface-visibility: hidden;
      animation: flip-front 0.3s linear;
      animation-fill-mode: forwards;
      animation-delay: inherit;
    }

    img {
      pointer-events: none;
    }

    .card-container {
      opacity: 0;
      transform-style: preserve-3d;
      pointer-events: none;
      img {
        pointer-events: none;
      }
    }

    .card.back {
      transform-style: preserve-3d;
      position: absolute;
      top: 0;
      left: 0;
      backface-visibility: hidden;
      animation: flip-back 0.3s linear;
      animation-fill-mode: forwards;
      animation-delay: inherit;
    }
  }
}
</style>
