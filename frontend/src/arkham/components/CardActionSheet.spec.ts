import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import CardActionSheet from './CardActionSheet.vue'
import { useDbCardStore, type ArkhamDBCard } from '@/stores/dbCards'

vi.mock('@/arkham/cardImageLookup', () => ({
  getCardImage: vi.fn(() => '/img/arkham/cards/01001.avif'),
}))

let pinia: ReturnType<typeof createPinia>

const card = (code: string, name: string, text: string): ArkhamDBCard => ({
  code,
  name,
  text,
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

describe('CardActionSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
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
  })

  it('shows current-language fallback card text by default when mobile sheet previews an untranslated image', async () => {
    localStorage.setItem('language', 'zh')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(CardActionSheet, {
      target: document.createElement('img'),
      actionable: false,
    })
    app.config.globalProperties.$t = (key: string) => key
    app.use(pinia)

    app.mount(host)
    await nextTick()

    expect(document.querySelector('.sheet-card-data')?.textContent).toContain('罗兰·班克斯')
    expect(document.querySelector('.sheet-card-data')?.textContent).toContain('中文描述')

    app.unmount()
  })

  it('shows English card text from the mobile sheet when language is not English', async () => {
    localStorage.setItem('language', 'zh')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp(CardActionSheet, {
      target: document.createElement('img'),
      actionable: false,
    })
    app.config.globalProperties.$t = (key: string) => key
    app.use(pinia)

    app.mount(host)
    await nextTick()

    const toggle = document.querySelector<HTMLButtonElement>('.sheet-language-toggle')
    expect(toggle?.textContent).toContain('EN')

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    expect(document.querySelector('.sheet-language-toggle')?.textContent).toContain('ZH')
    expect(document.querySelector('.sheet-card-data')?.textContent).toContain('Roland Banks')
    expect(document.querySelector('.sheet-card-data')?.textContent).toContain('English text')

    document.querySelector<HTMLButtonElement>('.sheet-language-toggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    await nextTick()

    expect(document.querySelector('.sheet-language-toggle')?.textContent).toContain('EN')
    expect(document.querySelector('.sheet-card-data')?.textContent).toContain('罗兰·班克斯')
    expect(document.querySelector('.sheet-card-data')?.textContent).toContain('中文描述')

    app.unmount()
  })
})
