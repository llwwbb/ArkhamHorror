import { describe, expect, it } from 'vitest'
import scenarioSource from './Scenario.vue?raw'

describe('Scenario mobile shell layout contract', () => {
  it('docks the player zone in the phone shell instead of leaving it in the board flow', () => {
    expect(scenarioSource).toContain("import OverlayDrawer from '@/components/OverlayDrawer.vue'")
    expect(scenarioSource).toContain("import { usePhoneShell } from '@/arkham/composables/phoneShell'")
    expect(scenarioSource).toContain('const phoneShell = usePhoneShell()')
    expect(scenarioSource).toContain(':inline="!phoneShell"')
    expect(scenarioSource).toContain(':open="!!phoneShell?.playersOpen.value"')
    expect(scenarioSource).toContain(':dock-target="phoneShell?.bottomDockTarget"')
    expect(scenarioSource).toContain('<div id="player-zone" :class="{ \'player-zone--fullscreen\': locationsFullscreen }">')
    expect(scenarioSource).toContain('<div v-if="!phoneShell" class="phases">')
  })

  it('removes desktop-only player-zone chrome from the phone shell drawer', () => {
    expect(scenarioSource).toContain('<div v-if="!phoneShell" id="totals">')
    expect(scenarioSource).toContain(':global(.overlay-drawer #player-zone)')
    expect(scenarioSource).toContain('padding-bottom: 0')
    expect(scenarioSource).not.toContain('@media (max-width: 800px) {\n    padding-bottom: 50px;')
  })
})
