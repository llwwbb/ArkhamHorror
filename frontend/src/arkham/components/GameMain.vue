<script lang="ts" setup>
// 游戏内容主体：CampaignSettings/Campaign/ScenarioSettings/StandaloneScenario 分支链 + game-over。
// 桌面（Game.vue .game-main）与手机（MobilePlayLayout）共用；chrome（侧边栏/导航/顶条）归 shell。
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Game } from '@/arkham/types/Game'
import { useDebug } from '@/arkham/debug'
import { useCardStore } from '@/stores/cards'
import Campaign from '@/arkham/components/Campaign.vue'
import CampaignLog from '@/arkham/components/CampaignLog.vue'
import CampaignSettings from '@/arkham/components/CampaignSettings.vue'
import ScenarioSettings from '@/arkham/components/ScenarioSettings.vue'
import StandaloneScenario from '@/arkham/components/StandaloneScenario.vue'

const props = defineProps<{
  game: Game
  gameId: string
  playerId: string
  gameLog: readonly string[]
}>()

const emit = defineEmits<{
  choose: [number]
  update: [Game]
}>()

const router = useRouter()
const debug = useDebug()
const store = useCardStore()
const cards = computed(() => store.cards)
const gameOver = computed(() => props.game.gameState.tag === 'IsOver')
const question = computed(() => props.game.question[props.playerId])

// Reality Acid（The Blob that Ate Everything, c85001）灯光开关。
// 子组件（Campaign/StandaloneScenario → Scenario）已就绪，这里作为共享主体统一持有状态：
// override 是点击后的乐观本地值，meta 一变就清空回退到后端真值。
const realityAcidLightOverride = ref<boolean | null>(null)
const realityAcidLightMetaActive = computed(() => {
  const scenario = props.game.scenario
  return scenario?.id === 'c85001' && scenario.meta?.lightActive === true
})
const realityAcidLightActive = computed(
  () => realityAcidLightOverride.value ?? realityAcidLightMetaActive.value,
)
watch(realityAcidLightMetaActive, () => {
  realityAcidLightOverride.value = null
})
const realityAcidLightDevoured = computed(() => {
  const scenario = props.game.scenario
  if (scenario?.id !== 'c85001') return false
  return (
    realityAcidLightMetaActive.value ||
    scenario.meta?.lightDevoured === true ||
    realityAcidLightOverride.value !== null
  )
})
const toggleRealityAcidLight = () => {
  const gameId = props.game.id
  if (!gameId) return
  const active = !realityAcidLightActive.value
  realityAcidLightOverride.value = active
  debug.send(gameId, { tag: 'ScenarioSpecific', contents: ['blobSetLightActive', active] })
}
</script>

<template>
  <CampaignSettings
    v-if="game.campaign && !gameOver && question && question.tag === 'PickCampaignSettings'"
    :game="game"
    :campaign="game.campaign"
    :playerId="playerId"
  />
  <Campaign
    v-else-if="game.campaign"
    :game="game"
    :gameLog="gameLog"
    :playerId="playerId"
    :campaign="game.campaign"
    :realityAcidLightDevoured="realityAcidLightDevoured"
    :realityAcidLightActive="realityAcidLightActive"
    @choose="emit('choose', $event)"
    @update="emit('update', $event)"
    @toggleRealityAcidLight="toggleRealityAcidLight"
  />
  <ScenarioSettings
    v-else-if="game.scenario && !gameOver && question && question.tag === 'PickScenarioSettings'"
    :game="game"
    :scenario="game.scenario"
    :playerId="playerId"
  />
  <StandaloneScenario
    v-else-if="game.scenario && !gameOver"
    :game="game"
    :playerId="playerId"
    :realityAcidLightDevoured="realityAcidLightDevoured"
    :realityAcidLightActive="realityAcidLightActive"
    @choose="emit('choose', $event)"
    @update="emit('update', $event)"
    @toggleRealityAcidLight="toggleRealityAcidLight"
  />
  <div class="game-over" v-if="gameOver">
    <p>{{ $t('gameOver') }}</p>
    <button class="replay-button" @click="router.push({ name: 'ReplayGame', params: { gameId } })">
      {{ $t('watchReplay') }}
    </button>
    <CampaignLog v-if="game !== null" :game="game" :cards="cards" :playerId="playerId" />
  </div>
</template>

<style lang="scss" scoped>
.game-over {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;

  p {
    text-transform: uppercase;
    background: rgba(0, 0, 0, 0.5);
    width: 100%;
    padding: 10px 20px;
    color: white;
    text-align: center;
  }
}

.replay-button {
  padding: 10px;
  width: 100%;
  font-size: 1.2em;
  border: 0;
  background-color: var(--spooky-green);
  &:hover {
    background-color: var(--spooky-green-dark);
  }
}
</style>
