<script lang="ts" setup>
import { computed } from 'vue';
import * as Api from '@/arkham/api';
import type { Game } from '@/arkham/types/Game';
import type { AbilityType } from '@/arkham/types/Ability';
import type { AbilityMessage } from '@/arkham/types/Message';
import { MessageType } from '@/arkham/types/Message';

/* Outside their own turn an investigator can have a card's fast abilities
 * dropped from window prompts instead of stopping to ask. Shown wherever a
 * card's ability buttons are, whenever one of them is a fast ability, and set
 * for the investigator that ability is offered to. Renders nothing otherwise,
 * so it is safe to drop next to any ability list. */
const props = defineProps<{
  game: Game
  abilities: AbilityMessage[]
}>();

const isFastType = (type: AbilityType): boolean => {
  switch (type.tag) {
    case "FastAbility": return true
    case "DelayedAbility": return isFastType(type.abilityType)
    case "Objective": return isFastType(type.abilityType)
    default: return false
  }
}

const target = computed(() => {
  for (const { contents } of props.abilities) {
    if (contents.tag !== MessageType.ABILITY_LABEL) continue
    const { ability, investigatorId } = contents
    if (ability.cardCode && isFastType(ability.type)) return { investigatorId, cardCode: ability.cardCode }
  }
  return null
})

const skipped = computed(() => {
  if (!target.value) return false
  const { investigatorId, cardCode } = target.value
  return props.game.investigators[investigatorId]?.settings.perCardSettings?.[cardCode]?.cardSkipFastOutsideTurn === true
})

const label = computed(() => skipped.value ? 'player.unskipFastOutsideTurn' : 'player.skipFastOutsideTurn')

function toggle() {
  if (!target.value) return
  const { investigatorId, cardCode } = target.value
  Api.setCardSkipFastOutsideTurn(props.game.id, investigatorId, cardCode, !skipped.value)
}
</script>

<template>
  <button
    v-if="target"
    type="button"
    class="skip-fast-toggle"
    :class="{ 'skip-fast-toggle--on': skipped }"
    :aria-pressed="skipped"
    :aria-label="$t(label)"
    v-tooltip="$t(label)"
    @click.stop.prevent="toggle"
  >
    <font-awesome-icon icon="forward" />
  </button>
</template>

<style scoped>
/* Kept small on purpose: a corner glyph under the ability buttons, not a row of
   its own. Muted until switched on, then the "you changed a default" teal. The
   doubled class outranks the `button` rules the hosts put on their ability lists. */
.skip-fast-toggle.skip-fast-toggle {
  align-self: flex-end;
  display: inline-flex;
  width: auto;
  min-height: 0;
  margin: 0;
  padding: 1px 4px;
  border: 0;
  border-radius: 3px;
  background: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.7em;
  line-height: 1;
  cursor: pointer;
}

.skip-fast-toggle.skip-fast-toggle:hover {
  color: #fff;
}

.skip-fast-toggle.skip-fast-toggle--on {
  color: var(--highlight);
}
</style>
