import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/arkham/helpers', () => ({ cardImg: (art: string) => `/img/cards/${art}.avif` }))

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

  it('div.card 有 backgroundImage 返回剥离后的 URL', () => {
    const el = document.createElement('div')
    el.className = 'card'
    el.style.backgroundImage = 'url("/img/cards/01001.avif")'
    expect(getCardImage(el)).toBe('/img/cards/01001.avif')
  })

  it('div.card backgroundImage 为空返回 null', () => {
    const el = document.createElement('div')
    el.className = 'card'
    expect(getCardImage(el)).toBeNull()
  })

  it('revelation 容器内的 img.card 返回 null', () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'revelation'
    const img = document.createElement('img')
    img.className = 'card'
    img.src = 'http://localhost/cards/01001.avif'
    wrapper.appendChild(img)
    document.body.appendChild(wrapper)
    expect(getCardImage(img)).toBeNull()
  })

  it('data-image 兜底', () => {
    const el = document.createElement('div')
    el.dataset.image = '/img/foo.avif'
    expect(getCardImage(el)).toBe('/img/foo.avif')
  })
})
