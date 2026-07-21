<script lang="ts" setup>
import { toCamelCase } from '@/arkham/helpers'

defineProps<{
  entries: string[]
}>()
</script>

<template>
  <div class="crossed-off-overlay" aria-hidden="true">
    <div
      v-for="entry in entries"
      :key="entry"
      class="crossed-off"
      :class="{ [toCamelCase(entry)]: true }"
    ></div>
  </div>
</template>

<style scoped>
.crossed-off-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.crossed-off {
  position: absolute;
  margin-inline: auto;
  inset-inline: 0;
  border-top: 2px solid red;
  width: 33%;
}

.brianBurnham { top: 31.8%; }
.otheraGilman { top: 36.0%; }
.joyceLittle { top: 40.4%; }
.barnabasMarsh { top: 44.2%; }
.zadokAllen { top: 48.5%; }
.robertFriendly { top: 53%; }
.innsmouthJail { top: 65.4%; }
.shorewardSlums { top: 69.5%; }
.sawboneAlley { top: 73.9%; }
.theHouseOnWaterStreet { top: 78%; width: 50%; }
.esotericOrderOfDagon { top: 82.2%; width: 50%; }
.newChurchGreen { top: 86.7%; }
</style>
