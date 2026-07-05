import { describe, expect, it } from 'vitest'
import playerSource from './Player.vue?raw'

describe('Player mobile shell hand rendering', () => {
  it('does not render the legacy mobile hand strip inside the phone shell player drawer', () => {
    expect(playerSource).toContain("import { usePhoneShell } from '@/arkham/composables/phoneShell'")
    expect(playerSource).toContain('const phoneShell = usePhoneShell()')
    expect(playerSource).toContain('const showLegacyMobileHand = computed(() => isMobile.value && !phoneShell)')
    expect(playerSource).toContain('if (showLegacyMobileHand.value) {')
    expect(playerSource).toContain('v-if="showLegacyMobileHand" class="hand hand-area-IsMobile"')
  })

  it('does not render the legacy draggable choice modal inside the phone shell', () => {
    expect(playerSource).toContain('const showLegacyChoiceModal = computed(() => !phoneShell)')
    expect(playerSource).toContain('v-if="showLegacyChoiceModal && playerId === investigator.playerId"')
  })
})
