import { describe, expect, it } from 'vitest'
import { isScenarioBoardActive, quickActionsBottomOffset } from './mobileShellLayout'

describe('quickActionsBottomOffset', () => {
  it('keeps quick actions above the bottom nav when no drawer is open', () => {
    expect(quickActionsBottomOffset(0)).toBe(
      'calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px) + 0px)',
    )
  })

  it('adds the dock height when a drawer pushes up from the bottom', () => {
    expect(quickActionsBottomOffset(184.4)).toBe(
      'calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px) + 184px)',
    )
  })
})

describe('isScenarioBoardActive', () => {
  const activeStandalone = {
    gameState: { tag: 'IsActive' },
    phase: 'InvestigationPhase',
    campaign: null,
    investigators: {},
    scenario: { started: false, campaignStep: null },
  }

  it('enables docked choice windows during an active standalone board', () => {
    expect(isScenarioBoardActive(activeStandalone)).toBe(true)
  })

  it('enables docked choice windows during a started campaign scenario', () => {
    expect(isScenarioBoardActive({
      ...activeStandalone,
      campaign: {},
      investigators: { roland: {} },
      scenario: { started: true, campaignStep: null },
    })).toBe(true)
  })

  it('does not duplicate story questions during campaign phase or scenario steps', () => {
    expect(isScenarioBoardActive({ ...activeStandalone, phase: 'CampaignPhase' })).toBe(false)
    expect(isScenarioBoardActive({
      ...activeStandalone,
      scenario: { started: true, campaignStep: { tag: 'InterludeStep' } },
    })).toBe(false)
  })
})
