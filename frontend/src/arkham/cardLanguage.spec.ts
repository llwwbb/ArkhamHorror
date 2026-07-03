import { describe, expect, it } from 'vitest'
import { cardImagePartsFromImage } from './cardLanguage'

describe('card language image parsing', () => {
  it('extracts front, back, variant, localized, and cache-busted card image codes', () => {
    expect(cardImagePartsFromImage('/img/arkham/cards/01001.avif')).toEqual({ code: '01001', suffix: '' })
    expect(cardImagePartsFromImage('/img/arkham/cards/01001b.avif')).toEqual({ code: '01001b', suffix: '' })
    expect(cardImagePartsFromImage('/img/arkham/cards/09081_Mutated2.avif')).toEqual({ code: '09081', suffix: '_Mutated2' })
    expect(cardImagePartsFromImage('/img/arkham/zh/cards/01001_zh.avif?digest=abc')).toEqual({ code: '01001', suffix: '_zh' })
  })
})
