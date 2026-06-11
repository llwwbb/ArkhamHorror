<script lang="ts" setup>
import type { CardContents } from '@/arkham/types/Card';
import * as CardT from '@/arkham/types/Card';
import { inject, Ref } from 'vue';
import { useDebug } from '@/arkham/debug';
import { Game } from '@/arkham/types/Game';
import { toCardContents } from '@/arkham/types/Card';
import { imgsrc } from '@/arkham/helpers';
import EnemyView from '@/arkham/components/Enemy.vue';
import Treachery from '@/arkham/components/Treachery.vue';
import HandCard from '@/arkham/components/HandCard.vue';
import * as Arkham from '@/arkham/types/Investigator';
import { Enemy } from '@/arkham/types/Enemy';
import { usePlayerHand } from '@/arkham/composables/usePlayerHand';
import { createCardTransitionHooks } from '@/arkham/cardTransitions';

const props = withDefaults(
  defineProps<{
    game: Game
    playerId: string
    investigator: Arkham.Investigator
    treacheryInHand?: boolean
    // 与外部 transition-group 共享的离场位置表（非响应式，仅 setup 时读一次）。
    // Player.vue 传入自己的 map，使「手牌 ↔ 入场区」跨区飞行动画保持原行为。
    rectMap?: Map<string, DOMRect>
  }>(),
  { treacheryInHand: false },
)
const emit = defineEmits<{ choose: [value: number] }>()

const debug = useDebug()
const solo = inject<Ref<boolean>>('solo')
const showOtherPlayersHands = inject<Ref<boolean>>('showOtherPlayersHands')

const { playerHand, inHandEnemies, inHandTreacheries } = usePlayerHand({
  game: () => props.game,
  investigator: () => props.investigator,
})
const { onBeforeEnter, onEnter, onLeave } = createCardTransitionHooks(props.rectMap)

const ENCOUNTER_BACK = imgsrc("encounter_back.jpg")
const PLAYER_BACK = imgsrc("player_back.jpg")

function backForEnemy(enemy: Enemy) {
  const card = props.game.cards[enemy.cardId]
  if (!card) return ENCOUNTER_BACK
  if (card.tag === 'PlayerCard') return PLAYER_BACK
  return ENCOUNTER_BACK
}

const dragover = (e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

function onDropHand(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    const data = event.dataTransfer.getData('text/plain')
    if (data) {
      const json = JSON.parse(data)
      if (json.tag === "CardTarget") {
        debug.send(props.game.id, {tag: 'DebugAddToHand', contents: [props.investigator.id, json.contents]})
      }
    }
  }
}

function startHandDrag(event: DragEvent, card: (CardContents | CardT.Card)) {
  if (!debug.active) {
    event.preventDefault()
    return
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    const cardId = CardT.toCardContents(card).id
    event.dataTransfer.setData('text/plain', JSON.stringify({ "tag": "CardTarget", "contents": cardId }))
  }
}
</script>

<template>
  <transition-group tag="section" class="hand" @enter="onEnter" @leave="onLeave" @before-enter="onBeforeEnter"
    @drop="onDropHand($event)"
    @dragover.prevent="dragover($event)"
    @dragenter.prevent
    >
    <HandCard
      v-for="card in playerHand"
      :card="card"
      :game="game"
      :playerId="playerId"
      :ownerId="investigator.id"
      :key="toCardContents(card).id"
      @choose="emit('choose', $event)"
      :draggable="debug.active"
      @dragstart="startHandDrag($event, card)"
    />

    <template v-for="enemy in inHandEnemies" :key="enemy.id">
      <EnemyView
        v-if="solo || showOtherPlayersHands || (playerId == investigator.playerId)"
        :enemy="enemy"
        :game="game"
        :data-index="enemy.cardId"
        :playerId="playerId"
        @choose="emit('choose', $event)"
      />
      <div class="card-container" v-else>
        <img class="card" :src="backForEnemy(enemy)" />
      </div>
    </template>

    <template v-for="treachery in inHandTreacheries" :key="treachery.id">
      <Treachery
        v-if="solo || showOtherPlayersHands || (playerId == investigator.playerId)"
        :treachery="treachery"
        :data-index="treachery.cardId"
        :game="game"
        :playerId="playerId"
        :isInHand="treacheryInHand"
        @choose="emit('choose', $event)"
      />
      <div class="card-container" v-else>
        <img class="card" :src="ENCOUNTER_BACK" />
      </div>
    </template>

  </transition-group>
</template>

<style scoped>
.hand {
  flex: 0;
  display: flex;
  gap: 5px;
  overflow-x: auto;
}

/* 过渡类作用在组内元素上，随 transition-group 一起迁入本组件 */
.hand-move,
.hand-enter-active,
.hand-leave-active {
  transition: all 0.3s ease;
}

.hand-enter-from,
.hand-leave-to {
  opacity: 0;
  transform: translateY(-40px);
}

.hand-leave-active {
  position: absolute;
}

.card {
  width: var(--card-width);
  min-width: var(--card-width);
  border-radius: 2px;
}
</style>
