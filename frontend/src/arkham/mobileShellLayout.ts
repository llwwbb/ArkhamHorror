export function quickActionsBottomOffset(dockHeight: number): string {
  const safeDockHeight = Number.isFinite(dockHeight) ? Math.max(0, Math.round(dockHeight)) : 0
  return `calc(var(--mobile-nav-height) + env(safe-area-inset-bottom, 0px) + ${safeDockHeight}px)`
}

type ScenarioBoardState = {
  gameState: { tag: string }
  phase: string
  campaign: unknown | null
  investigators: Record<string, unknown>
  scenario: {
    started?: boolean
    campaignStep?: unknown | null
  } | null
}

export function isScenarioBoardActive(game: ScenarioBoardState): boolean {
  if (game.gameState.tag !== 'IsActive') return false
  const scenario = game.scenario
  if (!scenario || game.phase === 'CampaignPhase' || scenario.campaignStep) return false
  if (!game.campaign) return true
  return scenario.started === true && Object.keys(game.investigators).length > 0
}
