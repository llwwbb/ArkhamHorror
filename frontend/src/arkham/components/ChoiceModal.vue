<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Game } from '@/arkham/types/Game';
import * as ArkhamGame from '@/arkham/types/Game';
import { choiceRequiresModal } from '@/arkham/types/Message';
import { formatContent } from '@/arkham/helpers';
import { handleEmbeddedI18n } from '@/arkham/i18n';
import { QuestionType } from '@/arkham/types/Question';
import Draggable from '@/components/Draggable.vue';
import Question from '@/arkham/components/Question.vue';

export interface Props {
  game: Game
  playerId: string
  noStory?: boolean
  docked?: boolean
}

const props = withDefaults(defineProps<Props>(), { noStory: false, docked: false })
const emit = defineEmits(['choose'])
const { t, te } = useI18n()

async function choose(idx: number) {
  emit('choose', idx)
}

const inSkillTest = computed(() => props.game.skillTest !== null)
const choices = computed(() => ArkhamGame.choices(props.game, props.playerId))
const investigator = computed(() => Object.values(props.game.investigators).find(i => i.playerId === props.playerId))
const searchedCards = computed(() => {
  const playerCards = Object.entries(investigator.value?.foundCards ?? [])

  const playerZones = playerCards.filter(([, c]) => c.length > 0)

  const encounterCards = Object.entries({
    ...(props.game.scenario?.foundCards ?? {}),
    ...props.game.foundCards,
  })
  const encounterZones = encounterCards.filter(([, c]) => c.length > 0)

  return [...playerZones, ...encounterZones]
})

const focusedCards = computed(() => {
  if (searchedCards.value.length > 0) {
    return []
  }

  return props.game.focusedCards
})

const paymentAmountsLabel = computed(() => {
  if (question.value?.tag === QuestionType.CHOOSE_PAYMENT_AMOUNTS) {
    return question.value.label
  }

  return null
})

const choicesRequireModal = computed(() => choices.value.some(choiceRequiresModal))

const tokenChoices = computed(() => props.game.scenario?.chaosBag.choice)

const damageAssignmentTokens = computed(() => ArkhamGame.damageAssignmentTokens(props.game, props.playerId))

const requiresModal = computed(() => {
  // Damage/horror assignment is done by clicking cards; show the pending tokens
  // on the investigator instead of popping the choice modal.
  if (damageAssignmentTokens.value) {
    return false
  }
  if (props.noStory && question.value?.tag === QuestionType.READ) {
    return false
  }
  if (question.value?.tag === QuestionType.READ) {
    return true
  }
  if (inSkillTest.value) {
    return false
  }

  return ((props.game.focusedChaosTokens.length > 0 || tokenChoices.value !== null) && !inSkillTest.value) || focusedCards.value.length > 0 || searchedCards.value.length > 0 || paymentAmountsLabel.value || amountsLabel.value || choicesRequireModal.value || ['QuestionLabel', 'DropDown', 'ChooseExchangeAmounts', 'PayCostQuestion'].includes(question.value?.tag)
})

const question = computed(() => props.game.question[props.playerId])

const amountsLabel = computed(() => {
  if (question.value?.tag === QuestionType.CHOOSE_AMOUNTS) {
    return question.value.label
  }

  if (question.value?.tag === QuestionType.QUESTION_LABEL && question.value?.question?.tag === QuestionType.CHOOSE_AMOUNTS) {
    return question.value.question.label
  }

  return null
})

const label = function(body: string) {
  return formatContent(handleEmbeddedI18n(body, t))
}

const skillTestResults = computed(() => props.game.skillTestResults)

const body = computed(() => {
  if (question.value && question.value.tag === 'QuestionLabel') {
    if (question.value.label !== "@none") {
      return question.value.label
    }
  }

  return null
})

const title = computed(() => {
  if (skillTestResults.value) {
    return t("Results")
  }

  if (question.value && question.value.tag === QuestionType.READ) {
    if (question.value.flavorText.title) {
      return handleEmbeddedI18n(question.value.flavorText.title, t)
    }

    return t("Story")
  }

  if (question.value && question.value.tag === QuestionType.DROP_DOWN) {
    return t("Choose one")
  }


  if (amountsLabel.value) {
    if(amountsLabel.value.startsWith("$")) {
      let titleKey = amountsLabel.value.replace(".label.", ".title.")
      return te(titleKey.slice(1)) ? titleKey : amountsLabel.value
    } else {
      return amountsLabel.value
    }
  }

  if (!question.value) {
    return ""
  }

  return t("Choose")
})
</script>

<template>
  <template v-if="requiresModal">
    <div v-if="docked" class="choice-dock">
      <h1 class="choice-dock-title" v-html="label(title)"></h1>
      <div class='choice-modal-wrapper'>
        <p class="body" v-if="body" v-html="label(body)"></p>
        <Question v-if="question" :game="game" :playerId="playerId" @choose="choose" />
      </div>
    </div>
    <Draggable
      v-else
      center-in-selector=".scenario-body"
      avoid-selector=".location-cell--can-interact, .location-cell--can-interact .location-wrapper, .location-cell--can-interact .card-frame"
      click-through-chrome
    >
      <template #handle><h1 v-html="label(title)"></h1></template>
      <div class='choice-modal-wrapper'>
        <p class="body" v-if="body" v-html="label(body)"></p>
        <Question v-if="question" :game="game" :playerId="playerId" @choose="choose" />
      </div>
    </Draggable>
  </template>
</template>

<style scoped>
.body {
  font-size: 1.3em;
  font-family: "Noto Sans", sans-serif;
  color: var(--title);
  background: rgba(0, 0, 0, 0.6);
  padding: 10px;
  border-radius: 10px;
  border: 1px solid #111;
}

.choice-modal-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.choice-modal-wrapper .body {
  text-align: center;
  margin: 0;
}

/* 手机 shell：入流停靠在底部抽屉之上（MobilePlayLayout 的 .mobile-choice-dock 槽内，spec §4）。
   不再 position:fixed，避免浮在手牌/角色抽屉之上把它们盖住；高度上限 + 自身滚动，
   空间紧张时由父级槽收缩。 */
.choice-dock {
  width: 100%;
  box-sizing: border-box;
  max-height: 45dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: rgba(0, 0, 0, 0.85);
  padding: 10px;
  padding-top: 6px;
  /* 与 OverlayDrawer 同语言的底部面板观感 */
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.5);
}

.choice-dock::before {
  content: '';
  display: block;
  width: 32px;
  height: 3px;
  margin: 2px auto 8px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.25);
}

.choice-dock-title {
  font-size: 1.1em;
  margin: 0 0 6px;
  color: var(--title);
}
</style>
