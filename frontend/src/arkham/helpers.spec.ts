import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { checkImageExists, imgsrc, isLocalized } from './helpers'

describe('localized image fallback', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('uses English image assets for the zh-cn locale', async () => {
    localStorage.setItem('language', 'zh-cn')

    await checkImageExists('zh-cn')

    expect(isLocalized('cards/01001.avif')).toBe(false)
    expect(imgsrc('cards/01001.avif')).toContain('/img/arkham/cards/01001.avif')
  })
})
