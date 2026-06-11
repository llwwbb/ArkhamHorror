<script lang="ts" setup>
import { ref } from 'vue'
import Draggable from '@/components/Draggable.vue'

const props = withDefaults(defineProps<{ initialDescription?: string }>(), {
  initialDescription: '',
})

const emit = defineEmits<{
  submit: [title: string, description: string]
  cancel: []
}>()

const bugTitle = ref('')
// 故意不响应 prop 变化：本组件始终经 v-if 重新挂载，initialDescription 只在挂载时读一次
const bugDescription = ref(props.initialDescription)
</script>

<template>
  <Draggable>
    <template #handle>
      <header>
        <h2>{{ $t('gameBar.fileABug') }}</h2>
      </header>
    </template>
    <form @submit.prevent="emit('submit', bugTitle, bugDescription)" class="column bug-form box">
      <p>{{ $t('gameBar.fileBugPart1') }}</p>
      <p class="info">{{ $t('gameBar.fileBugPart2') }}</p>
      <p class="warning">{{ $t('gameBar.fileBugPart3') }}</p>
      <input
        required
        type="text"
        v-model="bugTitle"
        v-bind:placeholder="$t('gameBar.bugTitleholder')"
      />
      <textarea
        required
        v-model="bugDescription"
        v-bind:placeholder="$t('gameBar.bugDescriptionholder')"
      ></textarea>
      <div class="buttons">
        <button type="submit">{{ $t('submit') }}</button>
        <button type="button" @click="emit('cancel')">{{ $t('cancel') }}</button>
      </div>
    </form>
  </Draggable>
</template>

<style lang="scss" scoped>
header {
  display: flex;
  flex-direction: column;
}

header {
  font-family: Teutonic;
  font-size: 2em;
  text-align: center;
}

.bug-form {
  padding: 10px;
  font-size: 1.2em;
  input,
  textarea,
  button {
    font-size: 1.2em;
    padding: 5px 10px;
  }
}

.warning {
  background-color: var(--survivor-extra-dark);
  padding: 10px;
}

.info {
  background-color: var(--seeker-extra-dark);
  padding: 10px;
}
</style>
