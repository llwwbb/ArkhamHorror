import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/arkham/helpers', () => ({ imgsrc: (p: string) => `/img/${p}` }))

import { getCardImage } from './cardImageLookup'

describe('getCardImage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('img.card 直接取 src', () => {
    const img = document.createElement('img')
    img.className = 'card'
    img.src = 'http://localhost/cards/01001.avif'
    document.body.appendChild(img)
    expect(getCardImage(img)).toBe('http://localhost/cards/01001.avif')
  })

  it('data-image-id 拼接卡图路径', () => {
    const el = document.createElement('div')
    el.dataset.imageId = '01001'
    expect(getCardImage(el)).toContain('cards/01001.avif')
  })

  it('data-target 跟随到目标元素', () => {
    const targetEl = document.createElement('div')
    targetEl.dataset.id = 'abc'
    targetEl.dataset.imageId = '01002'
    document.body.appendChild(targetEl)
    const el = document.createElement('div')
    el.dataset.target = 'abc'
    expect(getCardImage(el)).toContain('cards/01002.avif')
  })

  it('无图元素返回 null', () => {
    const el = document.createElement('div')
    expect(getCardImage(el)).toBeNull()
  })
})
