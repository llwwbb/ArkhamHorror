import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import Enemy from './Enemy.vue'
import type { Enemy as EnemyState } from '@/arkham/types/Enemy'
import type { Game } from '@/arkham/types/Game'
import type { Card } from '@/arkham/types/Card'

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

async function settlePopper() {
  await nextTick()
  await nextFrame()
  await nextFrame()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function enemy(overrides: Partial<EnemyState>): EnemyState {
  return {
    id: 'enemy',
    cardId: 'enemy-card',
    cardCode: '01100',
    assignedDamage: 0,
    tokens: {},
    exhausted: false,
    engagedInvestigators: [],
    treacheries: [],
    assets: [],
    skills: [],
    events: [],
    stories: [],
    scarletKeys: [],
    asSelfLocation: null,
    sealedChaosTokens: [],
    placement: { tag: 'OutOfPlay', contents: 'VoidZone' },
    keys: [],
    modifiers: [],
    fight: null,
    evade: null,
    healthDamage: 0,
    sanityDamage: 0,
    health: null,
    meta: null,
    flipped: false,
    cardsUnderneath: [],
    referenceCards: [],
    ...overrides,
  }
}

function gameWithSwarm(): { game: Game; host: EnemyState } {
  const host = enemy({ id: 'host', cardId: 'host-card' })
  const swarm = enemy({
    id: 'swarm',
    cardId: 'swarm-card',
    placement: {
      tag: 'AsSwarm',
      swarmHost: host.id,
      swarmCard: {} as Card,
    },
  })

  return {
    host,
    game: {
      enemies: { [host.id]: host, [swarm.id]: swarm },
      stories: {},
      enemyAttackTargets: [],
      question: {},
    } as unknown as Game,
  }
}

let app: App<Element> | null = null

afterEach(() => {
  app?.unmount()
  app = null
  document.body.innerHTML = ''
})

describe('Enemy swarm popover', () => {
  it('stays open while the mobile card action sheet handles a click', async () => {
    const hostElement = document.createElement('div')
    document.body.appendChild(hostElement)
    const { game, host } = gameWithSwarm()

    app = createApp(Enemy, {
      game,
      enemy: host,
      playerId: 'investigator',
    })
    app.use(createPinia())
    app.use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
    app.directive('tooltip', () => undefined)
    app.mount(hostElement)

    const indicator = document.querySelector<HTMLButtonElement>('.swarm-indicator')
    expect(indicator).not.toBeNull()

    indicator?.click()
    await settlePopper()
    expect(indicator?.hasAttribute('data-popper-shown')).toBe(true)

    const sheet = document.createElement('div')
    sheet.className = 'card-action-sheet'
    const confirm = document.createElement('button')
    sheet.appendChild(confirm)
    document.body.appendChild(sheet)

    confirm.click()
    await settlePopper()

    expect(indicator?.hasAttribute('data-popper-shown')).toBe(true)
  })
})
