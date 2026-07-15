<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { getCardImage } from '@/arkham/cardImageLookup'
import OverlayDrawer from '@/components/OverlayDrawer.vue'
import { useDbCardStore, type ArkhamDBCard } from '@/stores/dbCards'
import { cardImagePartsFromImage } from '@/arkham/cardLanguage'

const props = defineProps<{
  target: HTMLElement
  actionable: boolean
}>()

const emit = defineEmits<{
  confirm: []
  close: []
}>()

const store = useDbCardStore()
const image = computed(() => getCardImage(props.target))
type DescriptionLanguage = 'current' | 'english'
const selectedDescriptionLanguage = ref<DescriptionLanguage | null>(null)
const activeDescriptionLanguage = computed<DescriptionLanguage>(() => selectedDescriptionLanguage.value ?? 'current')

const currentLanguage = computed(() => {
  const storeLanguage = store.lang
  const language = localStorage.getItem('language') || 'en'
  return storeLanguage === language ? storeLanguage : language
})

const cardCode = computed(() => {
  return cardImagePartsFromImage(image.value)?.code ?? null
})

const canToggleEnglishDescription = computed(() => currentLanguage.value !== 'en' && !!cardCode.value)
const languageToggleLabel = computed(() => activeDescriptionLanguage.value === 'english' ? currentLanguage.value.toUpperCase() : 'EN')
const shouldShowCurrentLanguageDescription = computed(() =>
  currentLanguage.value !== 'en'
    && !!cardCode.value
)

const TOKEN_MAP: Record<string, string> = {
  '[action]': '<span class="action-icon"></span>',
  '[fast]': '<span class="fast-icon"></span>',
  '[free]': '<span class="free-icon"></span>',
  '[reaction]': '<span class="reaction-icon"></span>',
  '[willpower]': '<span class="willpower-icon"></span>',
  '[intellect]': '<span class="intellect-icon"></span>',
  '[combat]': '<span class="combat-icon"></span>',
  '[agility]': '<span class="agility-icon"></span>',
  '[wild]': '<span class="wild-icon"></span>',
  '[guardian]': '<span class="guardian-icon"></span>',
  '[seeker]': '<span class="seeker-icon"></span>',
  '[rogue]': '<span class="rogue-icon"></span>',
  '[mystic]': '<span class="mystic-icon"></span>',
  '[survivor]': '<span class="survivor-icon"></span>',
  '[elder_sign]': '<span class="elder-sign"></span>',
  '[auto_fail]': '<span class="auto-fail"></span>',
  '[skull]': '<span class="skull-icon"></span>',
  '[cultist]': '<span class="cultist-icon"></span>',
  '[tablet]': '<span class="tablet-icon"></span>',
  '[elder_thing]': '<span class="elder-thing-icon"></span>',
  '[bless]': '<span class="bless-icon"></span>',
  '[curse]': '<span class="curse-icon"></span>',
  '[frost]': '<span class="frost-icon"></span>',
  '[per_investigator]': '<span class="per-player"></span>',
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const tokenRE = new RegExp(Object.keys(TOKEN_MAP).map(escapeRegExp).join('|'), 'g')
const replaceText = (text: string): string => !text ? '' :
  text
    .replaceAll('[[', '<span style="font-style: italic; font-weight: bold">')
    .replaceAll(']]', '</span>')
    .replaceAll('<i>', '<span style="font-style: italic;">')
    .replaceAll('</i>', '</span>')
    .replace(tokenRE, (m) => TOKEN_MAP[m] ?? m)

const sheetCard = computed<ArkhamDBCard | null>(() =>
  cardCode.value
    ? activeDescriptionLanguage.value === 'english'
      ? store.getEnglishDbCard(cardCode.value)
      : shouldShowCurrentLanguageDescription.value
        ? store.getDbCard(cardCode.value)
        : null
    : null
)

const sheetCardNeedsBack = computed(() =>
  !!sheetCard.value && !!cardCode.value && sheetCard.value.code !== cardCode.value
)

const sheetCardName = computed(() => {
  const card = sheetCard.value
  if (!card) return ''
  let name = (sheetCardNeedsBack.value ? (card.double_sided ? (card.back_name || card.name) : card.back_name) : card.name) || ''
  if (!name) return ''
  if (!sheetCardNeedsBack.value && card.subname) name = `${name}: ${card.subname}`
  if ((card.xp || 0) > 0) name = `${name} (${card.xp})`
  if (card.is_unique) name = `*${name}`
  return name
})

const sheetCardTraits = computed(() => {
  const card = sheetCard.value
  if (!card) return ''
  return (sheetCardNeedsBack.value ? (card.double_sided ? (card.back_traits || card.traits) : card.back_traits) : card.traits) || ''
})

const sheetCardText = computed(() => {
  const card = sheetCard.value
  if (!card) return ''
  const text = sheetCardNeedsBack.value ? card.back_text : card.text
  return replaceText(text || '')
})

const sheetCardFlavor = computed(() => {
  const card = sheetCard.value
  if (!card) return ''
  const flavor = sheetCardNeedsBack.value ? card.back_flavor : card.flavor
  return replaceText(flavor || '')
})

const hasSheetCardData = computed(() =>
  !!(sheetCardName.value || sheetCardTraits.value || sheetCardText.value || sheetCardFlavor.value)
)

const toggleEnglishDescription = async () => {
  if (!canToggleEnglishDescription.value) return
  const next: DescriptionLanguage = activeDescriptionLanguage.value === 'english' ? 'current' : 'english'
  selectedDescriptionLanguage.value = next
  if (next === 'english') await store.initEnglishDbCards()
}

watch(image, () => {
  selectedDescriptionLanguage.value = null
})
</script>

<template>
  <!-- .card-action-sheet 类被 touchTapIntercept 的放行判断引用，保留 -->
  <OverlayDrawer :open="true" side="bottom" panel-max-width="480px" :z-index="10002" @close="emit('close')">
    <div class="card-action-sheet no-overlay">
      <div class="sheet-card-preview">
        <img v-if="image" :src="image" class="sheet-card" />
        <button
          v-if="canToggleEnglishDescription"
          class="sheet-language-toggle"
          type="button"
          :title="activeDescriptionLanguage === 'english' ? 'Show selected language card text' : 'Show English card text'"
          @click.stop="toggleEnglishDescription"
        >
          {{ languageToggleLabel }}
        </button>
      </div>
      <div v-if="hasSheetCardData" class="sheet-card-data">
        <div class="sheet-card-data-header">
          <p v-if="sheetCardName"><b>{{ sheetCardName }}</b></p>
        </div>
        <div class="sheet-card-data-body">
          <p v-if="sheetCardTraits" class="sheet-card-traits"><span>{{ sheetCardTraits }}</span></p>
          <p v-if="sheetCardText" class="sheet-card-text" v-html="sheetCardText"></p>
          <p v-if="sheetCardFlavor" class="sheet-card-flavor" v-html="sheetCardFlavor"></p>
        </div>
      </div>
      <div class="sheet-actions">
        <button v-if="actionable" class="sheet-confirm" @click="emit('confirm')">
          {{ $t('cardSheet.perform') }}
        </button>
        <button class="sheet-cancel" @click="emit('close')">{{ $t('cancel') }}</button>
      </div>
    </div>
  </OverlayDrawer>
</template>

<style scoped>
.card-action-sheet {
  width: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.sheet-card-preview {
  position: relative;
  display: flex;
  justify-content: center;
  max-width: 100%;
}

.sheet-card {
  max-height: 50dvh;
  max-width: 100%;
  border-radius: 8px;
  object-fit: contain;
}

.sheet-language-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  min-width: 42px;
  min-height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
}

.sheet-card-data {
  width: 100%;
  max-height: 32dvh;
  overflow: auto;
  border-radius: 8px;
  background: rgba(212, 212, 212, 0.92);
  color: #111;
  font-family: Arial, sans-serif;
  text-align: left;
}

.sheet-card-data-header {
  padding: 10px 12px;
  background: #808080;
  color: #fff;
}

.sheet-card-data-header p,
.sheet-card-data-body p {
  margin: 0;
}

.sheet-card-data-body {
  padding: 12px;
  font-family: serif;
  font-size: 0.95em;
}

.sheet-card-data-body > *:not(:first-child) {
  margin-top: 8px;
}

.sheet-card-text {
  border-left: 2px solid #555;
  padding-left: 8px;
}

.sheet-card-flavor {
  font-size: 0.9em;
  font-style: italic;
}

.sheet-card-data-body :deep(span[class$="-icon"]),
.sheet-card-data-body :deep(span[class*=" -icon"]) {
  font-size: 1.2em;
}

.sheet-actions {
  display: flex;
  gap: 10px;
  width: 100%;
}

.sheet-actions button {
  flex: 1;
  min-height: 48px;
  border: none;
  border-radius: 8px;
  font-size: 1em;
  cursor: pointer;
}

.sheet-confirm {
  background: var(--select, #ff00ff);
  color: white;
  font-weight: 700;
}

.sheet-cancel {
  background: rgba(255, 255, 255, 0.12);
  color: var(--title, #cecece);
}
</style>
