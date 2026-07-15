import { describe, expect, it } from 'vitest'
import gameSource from './views/Game.vue?raw'
import gameBarSource from './components/GameBar.vue?raw'
import scenarioSource from './components/Scenario.vue?raw'

describe('tablet game layout', () => {
  it('keeps the desktop game bar visible when the board needs to shrink vertically', () => {
    expect(gameBarSource).toMatch(/\.game-bar\s*\{[\s\S]*?flex:\s*0 0 auto;/)
    expect(gameSource).toMatch(/\.game-main\s*\{[\s\S]*?min-height:\s*0;/)
    expect(gameSource).not.toContain('height: calc(100vh - 80px')
  })

  it('shrinks the board row before clipping the desktop player resource row', () => {
    expect(scenarioSource).toMatch(
      /\.scenario-body\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/,
    )
    expect(scenarioSource).toMatch(/\.scenario\s*\{[\s\S]*?min-height:\s*0;/)
  })
})
