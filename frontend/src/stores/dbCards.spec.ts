import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDbCardStore, type ArkhamDBCard } from './dbCards'

const card = (code: string, name: string, text: string): ArkhamDBCard => ({
  code,
  name,
  text,
  faction_name: 'Neutral',
  type_name: 'Asset',
  pack_name: 'Core Set',
  real_name: name,
  real_traits: '',
  real_text: text,
  type_code: 'asset',
  is_unique: false,
  double_sided: false,
})

describe('dbCards store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('loads English card data alongside a non-English language for alternate descriptions', async () => {
    localStorage.setItem('language', 'zh')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      const cards = url.includes('cards_zh.json')
        ? [card('01001', '罗兰·班克斯', '中文描述')]
        : [card('01001', 'Roland Banks', 'English text')]

      return {
        json: async () => cards,
      } as Response
    })

    const store = useDbCardStore()

    await store.initDbCards()
    await store.initEnglishDbCards()

    expect(store.getDbCard('01001')?.text).toBe('中文描述')
    expect(store.getEnglishDbCard('01001')?.text).toBe('English text')
    expect(fetchMock).toHaveBeenCalledWith('cards/cards_zh.json')
    expect(fetchMock).toHaveBeenCalledWith('cards/cards_en.json')
  })

  it('reuses current card data for English alternate descriptions when language is English', async () => {
    localStorage.setItem('language', 'en')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => [card('01001', 'Roland Banks', 'English text')],
    } as Response)

    const store = useDbCardStore()

    await store.initDbCards()
    await store.initEnglishDbCards()

    expect(store.getEnglishDbCard('01001')?.text).toBe('English text')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
