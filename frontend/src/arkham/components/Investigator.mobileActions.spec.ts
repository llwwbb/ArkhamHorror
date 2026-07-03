import { describe, expect, it } from 'vitest'
import investigatorSource from './Investigator.vue?raw'

describe('Investigator mobile action indicators', () => {
  it('keeps remaining-action indicators in the player controls, not on map portraits', () => {
    expect(investigatorSource).not.toContain('<span v-if="isMobile">\n      <i class="action" v-for="n in investigator.remainingActions"')
    expect(investigatorSource).toContain('<span class="action-container">')
  })
})
