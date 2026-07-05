import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GameLog from '@/arkham/components/GameLog.vue'

vi.mock('@/arkham/components/GameMessage.vue', async () => {
  const { defineComponent } = await import('vue')

  return {
    default: defineComponent({
      props: {
        msg: { type: String, required: true },
      },
      template: '<span class="message">{{ msg }}</span>',
    }),
  }
})

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
})

const mountedApps: Array<{ unmount: () => void }> = []

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount()
  document.body.innerHTML = ''
})

describe('GameLog', () => {
  it('renders the latest 30 log entries', async () => {
    const gameLog = Array.from({ length: 35 }, (_value, index) => `entry-${index + 1}`)
    const host = document.createElement('div')
    document.body.appendChild(host)

    const app = createApp(GameLog, {
      game: {},
      gameLog,
    })
    mountedApps.push(app)

    app.mount(host)
    await nextTick()

    const messages = Array.from(host.querySelectorAll('.message')).map((el) => el.textContent)
    expect(messages).toHaveLength(30)
    expect(messages[0]).toBe('entry-6')
    expect(messages.at(-1)).toBe('entry-35')
  })
})
