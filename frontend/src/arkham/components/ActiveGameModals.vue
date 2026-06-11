<script lang="ts" setup>
// 模态优先级契约（两个 shell 共用，禁止在 shell 模板里复制）：
// - TheSilence 与揭示卡互斥，TheSilence 优先（v-if / v-else-if）
// - 塔罗与上述并行（可同时出现）
// 状态与 uiLock 排队协议见 useGameModals / useGameSocket。
import type { Game } from '@/arkham/types/Game'
import type { GameModals } from '@/arkham/composables/useGameModals'
import TheSilenceModal from '@/arkham/components/TheSilenceModal.vue'
import RevealedCardModal from '@/arkham/components/RevealedCardModal.vue'
import TarotModal from '@/arkham/components/TarotModal.vue'

const props = defineProps<{
  game: Game
  playerId: string
  modals: GameModals
}>()

const { gameCard, tarotCards, showTheSilenceModal, continueUI } = props.modals
</script>

<template>
  <TheSilenceModal v-if="showTheSilenceModal" @continue="continueUI" />
  <RevealedCardModal
    v-else-if="gameCard"
    :game="game"
    :playerId="playerId"
    :gameCard="gameCard"
    @continue="continueUI"
  />
  <TarotModal v-if="tarotCards.length > 0" :tarotCards="tarotCards" @continue="continueUI" />
</template>
