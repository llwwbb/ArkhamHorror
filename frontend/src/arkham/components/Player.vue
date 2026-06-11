<script lang="ts" setup>
import * as CardT from '@/arkham/types/Card';
import { computed, ref, ComputedRef, reactive } from 'vue';
import { useDebug } from '@/arkham/debug';
import { Game } from '@/arkham/types/Game';
import { toCardContents } from '@/arkham/types/Card';
import { imgsrc } from '@/arkham/helpers';
import * as ArkhamCard from '@/arkham/types/Card';
import * as ArkhamGame from '@/arkham/types/Game';
import EnemyView from '@/arkham/components/Enemy.vue';
import Story from '@/arkham/components/Story.vue';
import Treachery from '@/arkham/components/Treachery.vue';
import ScarletKey from '@/arkham/components/ScarletKey.vue';
import Asset from '@/arkham/components/Asset.vue';
import EventView from '@/arkham/components/Event.vue';
import Skill from '@/arkham/components/Skill.vue';
import HandCard from '@/arkham/components/HandCard.vue';
import PlayerHandCards from '@/arkham/components/PlayerHandCards.vue';
import CardRow from '@/arkham/components/CardRow.vue';
import Investigator from '@/arkham/components/Investigator.vue';
import ChoiceModal from '@/arkham/components/ChoiceModal.vue';
import { TarotCard, tarotCardImage } from '@/arkham/types/TarotCard';
import * as Arkham from '@/arkham/types/Investigator';
import { useI18n } from 'vue-i18n';
import Draw from '@/arkham/components/Draw.vue'
import { IsMobile } from '@/arkham/isMobile';
import { usePhoneShell } from '@/arkham/composables/phoneShell';
import { usePlayerHand } from '@/arkham/composables/usePlayerHand';
import { createCardTransitionHooks } from '@/arkham/cardTransitions';
const { t } = useI18n();

interface RefWrapper<T> {
  ref: ComputedRef<T>
}

export interface Props {
  game: Game
  investigator: Arkham.Investigator
  playerId: string
  tarotCards: TarotCard[]
}

const props = defineProps<Props>()

const investigatorId = computed(() => props.investigator.id)

const assets = computed(() => {
  const xs = props.investigator.assets.map(a => props.game.assets[a])
  xs.sort((a, b) =>
    (b.permanent as any) - (a.permanent as any) ||
    a.cardCode.localeCompare(b.cardCode) ||
    a.cardId.localeCompare(b.cardId)
  )
  return xs
})

const currentTreacheries = computed(() => {
  return Object.
    values(props.game.treacheries).
    filter((t) => t.placement.tag === 'Limbo' && t.drawnBy === investigatorId.value && (props.playerId === props.investigator.playerId || !t.peril))
})

const stories = computed(() =>
  Object.
    values(props.game.stories).
    filter((s) => s.placement.tag === "InThreatArea" && s.placement.contents === investigatorId.value && s.otherSide === null)
)

const engagedEnemies = computed(() =>
  props.investigator.engagedEnemies.map((e) => props.game.enemies[e]).filter((e) =>
    e && e.placement.tag === "InThreatArea" && e.placement.contents === investigatorId.value
  )
)

const hasThreatArea = computed(() =>
  stories.value.length > 0 || engagedEnemies.value.length > 0 || props.investigator.treacheries.length > 0
)

const hunchDeck = computed(() => {
  const match = props.investigator.decks.find(([k,]) => k === "HunchDeck")
  if (match) {
    return match[1]
  }

  return null
})

const showHunchDeck = (e: Event) => {
  e.preventDefault()
  if (hunchDeck.value) {
    doShowCards(e, hunchDeck as ComputedRef<CardT.Card[]>, t("investigators.joeDiamond.hunchDeck"), false)
  }
}

const topOfHunchDeckRevealed = computed(() => {
  const { revealedHunchCard } = props.investigator
  const hunchCard = topOfHunchDeck.value
  if (hunchCard) {
    return toCardContents(hunchCard).id === revealedHunchCard
  }

  return false
})

const topOfHunchDeck = computed(() => {
  if (hunchDeck.value) {
    return hunchDeck.value[0]
  }

  return null
})

const viewingDiscard = ref(false)

const choices = computed(() => ArkhamGame.choices(props.game, props.playerId))

const tarotCardAbility = (card: TarotCard) => {
  if(props.playerId !== props.investigator.playerId) {
    return -1
  }
  return choices.value.findIndex((c) => {
    if (c.tag === "AbilityLabel") {
      return c.ability.source.sourceTag === "TarotSource" && c.ability.source.contents.arcana === card.arcana
    }

    return false
  })
}

const noCards = computed<ArkhamCard.Card[]>(() => [])

// eslint-disable-next-line
const showCards = reactive<RefWrapper<any>>({ ref: noCards })
const cardRowTitle = ref("")

const { totalHandSize, actualHandSize, handSizeClasses } = usePlayerHand({
  game: () => props.game,
  investigator: () => props.investigator,
})

const doShowCards = (event: Event, cards: ComputedRef<ArkhamCard.Card[]>, title: string, isDiscards: boolean) => {
  cardRowTitle.value = title
  showCards.ref = cards
  viewingDiscard.value = isDiscards
}

const hideCards = () => {
  showCards.ref = noCards
  viewingDiscard.value = false
}

const debug = useDebug()
const events = computed(() => props.investigator.events.map((e) => props.game.events[e]).filter(e => e))
const skills = computed(() => props.investigator.skills.map((e) => props.game.skills[e]).filter(e => e))
const emptySlots = computed(() => props.investigator.slots.filter((s) => s.empty))
const { isMobile } = IsMobile();
// 手机 shell 下 Question 由 MobilePlayLayout 渲染停靠版，这里抑制自身的浮窗（Task 11）
const phoneShell = usePhoneShell()

const slotImg = (slot: Arkham.Slot) => {
  switch (slot.tag) {
    case 'HeadSlot':
      return imgsrc('slots/head.png')
    case 'HandSlot':
      return imgsrc('slots/hand.png')
    case 'BodySlot':
      return imgsrc('slots/body.png')
    case 'AccessorySlot':
      return imgsrc('slots/accessory.png')
    case 'ArcaneSlot':
      return imgsrc('slots/arcane.png')
    case 'TarotSlot':
      return imgsrc('slots/tarot.png')
    case 'AllySlot':
      return imgsrc('slots/ally.png')
  }
}

// 入场区与桌面手牌区共用同一个 rectMap，保持卡牌在手牌 ↔ 入场区之间的跨区飞行动画
const cardRectMap = new Map<string, DOMRect>()
const { onBeforeEnter, onEnter, onLeave } = createCardTransitionHooks(cardRectMap)

const realityAcid = ref('89005')

const dragover = (e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    const data = event.dataTransfer.getData('text/plain')
    if (data) {
      const json = JSON.parse(data)
      if (json.tag === "CardTarget") {
        debug.send(props.game.id, {tag: 'PutCardIntoPlayById', contents: [props.investigator.id, json.contents, null, { tag: 'NoPayment' }, []]})
      }
    }
  }
}

const playAreaCollapsed = ref(false)
</script>

<template>
  <div class="player-cards">
    <button class="in-play-toggle" @click="playAreaCollapsed = !playAreaCollapsed"></button>
    <transition name="grow">
      <section
        class="in-play"
        :class="{ 'in-play--collapsed': playAreaCollapsed }"
        @drop="onDrop($event)"
        @dragover.prevent="dragover($event)"
        @dragenter.prevent
      >
        <transition-group @enter="onEnter" @leave="onLeave" @before-enter="onBeforeEnter">
          <Story
            v-for="story in stories"
            :key="story.id"
            :story="story"
            :game="game"
            :data-index="story.cardId"
            :playerId="playerId"
            @choose="$emit('choose', $event)"
          />

          <EnemyView
            v-for="enemy in engagedEnemies"
            :key="enemy.id"
            :enemy="enemy"
            :game="game"
            :data-index="enemy.cardId"
            :playerId="playerId"
            @choose="$emit('choose', $event)"
          />

          <Treachery
            v-for="treacheryId in investigator.treacheries"
            :key="treacheryId"
            :treachery="game.treacheries[treacheryId]"
            :game="game"
            :data-index="game.treacheries[treacheryId].cardId"
            :playerId="playerId"
            @choose="$emit('choose', $event)"
          />

          <div v-if="hasThreatArea" :key="'threat-divider'" class="threat-divider" />

          <template v-if="tarotCards.length > 0">
            <div v-for="tarotCard in tarotCards" :key="tarotCard.arcana" :data-index="tarotCard.arcana">
              <img :src="imgsrc(`tarot/${tarotCardImage(tarotCard)}`)" class="card tarot-card" :class="{ [tarotCard.facing]: true, 'can-interact': tarotCardAbility(tarotCard) !== -1 }" @click="$emit('choose', tarotCardAbility(tarotCard))"/>
            </div>
          </template>

          <img
            v-if="investigatorId === 'c89001'"
            class="card"
            @click="realityAcid = realityAcid === '89005' ? '89005b' : '89005'"
            :src="imgsrc(`cards/${realityAcid}.avif`)"
          />

          <Treachery
            v-for="treachery in currentTreacheries"
            :key="treachery.id"
            :treachery="treachery"
            :game="game"
            :data-index="treachery.cardId"
            :playerId="playerId"
            @choose="$emit('choose', $event)"
          />

          <Skill
            v-for="skill in skills"
            :skill="skill"
            :game="game"
            :playerId="playerId"
            :key="skill.id"
            :data-index="skill.cardId"
            @choose="$emit('choose', $event)"
            @showCards="doShowCards"
          />
          <EventView
            v-for="event in events"
            :event="event"
            :game="game"
            :playerId="playerId"
            :key="event.id"
            :data-index="event.cardId"
            @choose="$emit('choose', $event)"
            @showCards="doShowCards"
          />

          <ScarletKey
            v-for="skId in investigator.scarletKeys"
            :scarletKey="game.scarletKeys[skId]"
            :game="game"
            :playerId="playerId"
            :key="skId"
            @choose="$emit('choose', $event)"
          />
          <Asset
            v-for="asset in assets"
            :asset="asset"
            :game="game"
            :playerId="playerId"
            :key="asset.id"
            :data-index="asset.cardId"
            @choose="$emit('choose', $event)"
            @showCards="doShowCards"
          />

          <div v-for="(slot, idx) in emptySlots" :key="idx" class="slot" :data-index="`${slot.tag}${idx}`">
            <img :src="slotImg(slot)" />
          </div>

        </transition-group>
      </section>
    </transition>

    <ChoiceModal
      v-if="playerId === investigator.playerId && !phoneShell"
      :game="game"
      :playerId="playerId"
      @choose="$emit('choose', $event)"
    />

    <div class="player">
      <div v-if="hunchDeck" class="hunch-deck">
        <div class="top-of-deck">
          <HandCard
            v-if="topOfHunchDeck && topOfHunchDeckRevealed"
            :card="topOfHunchDeck"
            :game="game"
            :ownerId="investigator.id"
            :playerId="playerId"
            @choose="$emit('choose', $event)"
          />
          <img
            v-else
            class="deck card"
            :src="imgsrc('player_back.jpg')"
            width="150px"
          />
          <span class="deck-size">{{hunchDeck.length}}</span>
        </div>
        <button v-if="debug" @click="showHunchDeck">{{ $t('player.viewDeck') }}</button>
      </div>

      <div class="investigator-and-deck">
        <Investigator
          :game="game"
          :investigator="investigator"
          :choices="choices"
          :playerId="playerId"
          @choose="$emit('choose', $event)"
          @showCards="doShowCards"
          @hideCards="hideCards"
        />
        <Draw
          v-if="!isMobile"
          :game="game"
          :playerId="playerId"
          :investigator="investigator"
          @choose="$emit('choose', $event)"
        />
      </div>
      <div v-if="!isMobile" class="hand hand-area">
        <PlayerHandCards
          :game="game"
          :playerId="playerId"
          :investigator="investigator"
          :rectMap="cardRectMap"
          @choose="$emit('choose', $event)"
        />
        <div v-if="investigator.handSize" class="hand-size" :class="handSizeClasses" :current-length="totalHandSize">{{ t('handSize') }}: {{totalHandSize}}/{{investigator.handSize}}</div>
      </div>
    </div>
    <CardRow
      v-if="showCards.ref.length > 0"
      :game="game"
      :playerId="playerId"
      :cards="showCards.ref"
      :isDiscards="viewingDiscard"
      :title="cardRowTitle"
      @choose="$emit('choose', $event)"
      @close="hideCards"
    />
  </div>
</template>

<style scoped>
.player {
  display: flex;
  gap: 5px;
  align-self: safe center;
  align-items: flex-start;
  padding: 10px;
  background: var(--background-dark);
  @media (max-width: 800px) and (orientation: portrait) {
    padding-bottom: 0;
  }
}

:deep(.location) {
  .location-container {
    margin: 0 10px;
  }

  .location-investigator-column {
    position: unset;
  }

  .location-asset-column {
    position: unset;
    width: auto;
    min-width: unset;
  }

  .location-asset-column .exhausted{
    margin-left: calc(var(--card-width) - (var(--card-width) * 7 / 9));
    margin-right: 10px;
    transform: rotate(90deg) translateX(-10px);
  }
}

.deck {
  width: auto;
  box-shadow: var(--card-shadow);
}

.in-play-toggle {
  display: none;
  width: 100%;
  height: 12px;
  align-items: center;
  justify-content: center;
  background: #1e2235;
  border: none;
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  flex-shrink: 0;

  &::before {
    content: '';
    width: 32px;
    height: 3px;
    background: rgba(255, 255, 255, 0.25);
    border-radius: 2px;
  }

  @media (max-width: 800px) and (orientation: portrait) {
    display: flex;
  }
}

.in-play {
  display: flex;
  flex-wrap: nowrap;
  overflow: auto;
  gap: 5px;
  background: var(--background-dark);
  padding: 10px;
  border-bottom: 1px solid var(--background);
  border-top: 1px solid var(--background);
  max-height: 300px;
  transition: max-height 0.15s cubic-bezier(0.4, 0, 0.2, 1), padding 0.15s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.1s ease;

  > * {
    flex-shrink: 0;
  }

  .threat-divider {
    width: 2px;
    align-self: stretch;
    margin: 0 8px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 1px;
  }

  &.in-play--collapsed {
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    opacity: 0;
    overflow: hidden;
  }
}

.hand {
  flex: 0;
  display: flex;
  gap: 5px;
  overflow-x: auto;
}

.in-play-move,
.in-play-enter-active,
.in-play-leave-active {
  transition: all 0.3s ease;
}

.in-play-enter-from,
.in-play-leave-to {
  opacity: 0;
  transform: translateY(-40px);
}

.in-play-leave-active {
  position: absolute;
}

.deck-label {
  text-transform: uppercase;
  width: 80px;
  font-size: 12px;
  background: hsla(255 100% 100% / 0.5)
}

.hunch-deck {
  display: flex;
  flex-direction: column;
  .top-of-deck {
    display: grid;
    grid: 1fr / 1fr;
    justify-items: center;
    > * {
      grid-area: 1 / 1;
    }
    .deck-size {
      font-size: 1.2rem;
      font-weight: bold;
      width: 1.5rem;
      height: auto;
      color: white;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 50%;
      aspect-ratio: 1;
      line-height: 1.2rem;
      text-align: center;
      display: grid;
      align-self: center;
      place-items: center;
      transform: translateY(-34%);
    }
  }
  img {
    width: var(--card-width);
    border-radius: 2px;
  }
}

.committed-skills {
  margin-left: auto;
  display: flex;
  h2 {
    text-align: center;
    text-transform: uppercase;
    font-size: 1.4vh;
    margin: 0;
    margin-top: -10px;
    margin-bottom: -10px;
    writing-mode: vertical-rl;
    orientation: mixed;
    color: rgba(255, 255, 255, 0.75);
  }
}

.slot {
  width: var(--card-width);
  background: rgba(0,0,0,0.2);
  aspect-ratio: 5 / 7;
  height: calc(var(--card-width) * 7 / 5);
  border-radius: 6px;
  overflow: hidden;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.3);
  img {
    width: calc(var(--card-width) / 2);
    filter: invert(75%);
  }
}

.tarot-card {
  width: var(--card-width);
  &.can-interact {
    border: 2px solid var(--select);
  }

  &.Reversed {
    transform: rotate(180deg);
  }
}

.split-view .hand {
  flex-wrap: wrap;
  min-height: fit-content;
  overflow: unset;
}

.investigator-and-deck {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 5px;
  @media (max-width: 600px) {
      width: 100%;
  }
}

.hand-size {
  padding: 3px;
  justify-items: center;
  font-size: 0.7rem;
  color: white;
  background-color: var(--neutral-dark);
  display: grid;
  grid-template-columns: 1fr;
  width: calc((v-bind(actualHandSize) * var(--card-width)) + ((v-bind(actualHandSize) - 1) * 5px));
  max-width: 100%;
  min-width: fit-content;

}

.hand-size-ok {
  background-color: var(--rogue-dark);
}

.hand-size-warn {
  background-color: var(--seeker-dark);
}

.hand-size-alert {
  background-color: var(--survivor-dark);
}

.hand-area {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-start;
  flex: 1;
  max-width: 100%;
}

.card {
  width: var(--card-width);
  min-width: var(--card-width);
  border-radius: 2px;
}
</style>
