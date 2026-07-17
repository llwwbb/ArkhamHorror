import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import CardOverlay from './CardOverlay.vue'
import { useDbCardStore, type ArkhamDBCard } from '@/stores/dbCards'
import { _resetForTests } from '@/arkham/composables/useDeviceLayout'
import { checkImageExists } from '@/arkham/helpers'

let pinia: ReturnType<typeof createPinia>

const card = (code: string, name: string, text: string): ArkhamDBCard => ({
  code,
  name,
  text,
  back_name: name,
  back_text: text,
  faction_name: 'Neutral',
  faction_code: 'neutral',
  type_name: 'Asset',
  pack_name: 'Core Set',
  real_name: name,
  real_traits: '',
  real_text: text,
  type_code: 'asset',
  is_unique: false,
  double_sided: false,
})

async function flushOverlay() {
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await nextTick()
  await nextTick()
}

describe('CardOverlay translated card text', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    _resetForTests()
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
    })))
    localStorage.setItem('language', 'zh')
    pinia = createPinia()
    setActivePinia(pinia)
    const store = useDbCardStore()
    store.lang = 'zh'
    store.dbCards = [card('01001', '罗兰·班克斯', '中文描述')]
    store.dbCardsIndex = new Map([
      ['01001', store.dbCards[0]],
      ['01001b', store.dbCards[0]],
    ])
    store.englishDbCards = [card('01001', 'Roland Banks', 'English text')]
    store.englishDbCardsIndex = new Map([
      ['01001', store.englishDbCards[0]],
      ['01001b', store.englishDbCards[0]],
    ])
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('shows selected-language text for back-side cache-busted images without an English toggle', async () => {
    const target = document.createElement('img')
    target.className = 'card'
    target.src = '/img/arkham/cards/01001b.avif?digest=abc'
    document.body.appendChild(target)

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(CardOverlay)
    app.use(pinia)
    app.use(createI18n({ legacy: false, locale: 'zh', messages: { zh: {} } }))
    app.mount(host)

    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 1, clientY: 1 }))
    await flushOverlay()

    expect(document.querySelector('.card-data')?.textContent).toContain('罗兰·班克斯')
    expect(document.querySelector('.card-data')?.textContent).toContain('中文描述')
    expect(document.querySelector('.card-language-toggle')).toBeNull()
    expect(document.querySelector('.card-data-language-toggle')).toBeNull()

    app.unmount()
  })

  it('hides translated card text immediately when the pointer leaves the card', async () => {
    const target = document.createElement('img')
    target.className = 'card'
    target.src = '/img/arkham/cards/01001.avif'
    document.body.appendChild(target)

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(CardOverlay)
    app.use(pinia)
    app.use(createI18n({ legacy: false, locale: 'zh', messages: { zh: {} } }))
    app.mount(host)

    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 1, clientY: 1 }))
    await flushOverlay()

    expect(document.querySelector('.card-data')).not.toBeNull()

    host.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 500, clientY: 500 }))
    await nextTick()

    expect(document.querySelector('.card-data')).toBeNull()

    app.unmount()
  })

  it('shows selected-language text by default even when a localized image exists', async () => {
    await checkImageExists('zh')
    const target = document.createElement('img')
    target.className = 'card'
    target.src = '/img/arkham/cards/01001.avif'
    document.body.appendChild(target)

    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(CardOverlay)
    app.use(pinia)
    app.use(createI18n({ legacy: false, locale: 'zh', messages: { zh: {} } }))
    app.mount(host)

    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 1, clientY: 1 }))
    await flushOverlay()

    expect(document.querySelector('.card-data')?.textContent).toContain('罗兰·班克斯')
    expect(document.querySelector('.card-data')?.textContent).toContain('中文描述')

    app.unmount()
  })
})
