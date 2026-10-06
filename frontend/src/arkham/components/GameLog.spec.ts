import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GameLog from '@/arkham/components/GameLog.vue'
import { legacyLogEntry } from '@/arkham/legacyLogParse'

vi.mock('@/arkham/components/GameLogEntry.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      props: ['entry', 'path', 'isOpen'],
      template: '<span class="message">{{ entry.body[0].contents }}</span>',
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
  it('renders all loaded log entries, including older pages', async () => {
    const gameLog = Array.from({ length: 35 }, (_value, index) => `entry-${index + 1}`)
    const host = document.createElement('div')
    document.body.appendChild(host)

    const app = createApp(GameLog, {
      entries: gameLog.map((body, index) => legacyLogEntry(body, index)),
    })
    mountedApps.push(app)

    app.mount(host)
    await nextTick()

    const messages = Array.from(host.querySelectorAll('.message')).map((el) => el.textContent)
    expect(messages).toHaveLength(35)
    expect(messages[0]).toBe('entry-1')
    expect(messages.at(-1)).toBe('entry-35')
  })
})
