import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTapIntercept, type TapIntercept, type InterceptedTap } from './touchTapIntercept'

describe('installTapIntercept', () => {
  let intercept: TapIntercept | null = null
  let isTouch = true
  let intercepted: InterceptedTap[] = []

  beforeEach(() => {
    document.body.innerHTML = ''
    isTouch = true
    intercepted = []
    intercept = installTapIntercept({
      isTouch: () => isTouch,
      onIntercept: (tap) => intercepted.push(tap),
    })
  })

  afterEach(() => {
    intercept?.uninstall()
    intercept = null
  })

  function makeCard(className: string): { el: HTMLElement; onClick: ReturnType<typeof vi.fn> } {
    const el = document.createElement('img')
    el.className = className
    const onClick = vi.fn()
    el.addEventListener('click', onClick)
    document.body.appendChild(el)
    return { el, onClick }
  }

  it('触屏下拦截可交互卡牌的 click，不触发原 handler', () => {
    const { el, onClick } = makeCard('card card--can-interact')
    el.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(intercepted).toHaveLength(1)
    expect(intercepted[0].target).toBe(el)
    expect(intercepted[0].actionable).toBe(true)
  })

  it('approve 后重放 click，原 handler 执行一次', () => {
    const { el, onClick } = makeCard('card card--can-interact')
    el.click()
    intercept!.approve(intercepted[0])
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('非触屏不拦截', () => {
    isTouch = false
    const { el, onClick } = makeCard('card card--can-interact')
    el.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)
  })

  it('密谋/场景卡推进（--can-progress）拦截为可执行', () => {
    for (const cls of ['card agenda--can-progress', 'card act--can-progress']) {
      const { el, onClick } = makeCard(cls)
      el.click()
      expect(onClick, cls).not.toHaveBeenCalled()
    }
    expect(intercepted).toHaveLength(2)
    expect(intercepted.every((t) => t.actionable)).toBe(true)
  })

  it('桌面陈设一步直达：plain can-interact 牌堆/塔罗、混乱袋、玩家牌堆抽牌', () => {
    // 即使元素带 .card class（如翻开的牌堆顶），也完全放行、不弹预览
    for (const cls of ['deck can-interact card', 'token token--can-draw', 'deck--can-draw card']) {
      const { el, onClick } = makeCard(cls)
      el.click()
      expect(onClick, cls).toHaveBeenCalledTimes(1)
    }
    expect(intercepted).toHaveLength(0)
  })

  it('地图格子空白处（location-cell--can-interact）不拦截，内层卡牌仍拦截', () => {
    const cell = document.createElement('div')
    cell.className = 'location-cell location-cell--can-interact'
    const img = document.createElement('img')
    img.className = 'card card--locations location--can-interact'
    img.src = 'http://localhost/cards/01111.avif'
    cell.appendChild(img)
    const onCellClick = vi.fn()
    cell.addEventListener('click', onCellClick)
    document.body.appendChild(cell)

    cell.click() // 点格子空白处：放行（桌面同样无事发生）
    expect(onCellClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)

    img.click() // 点内层地点卡：拦截为可执行
    expect(intercepted).toHaveLength(1)
    expect(intercepted[0].actionable).toBe(true)
    expect(intercepted[0].el).toBe(img)
  })

  it('poolItem 上的 --can-take/--can-spend 控件仍一步直达', () => {
    const pool = document.createElement('div')
    pool.className = 'poolItem resource--can-take'
    const onClick = vi.fn()
    pool.addEventListener('click', onClick)
    document.body.appendChild(pool)
    pool.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)
  })

  it('文字按钮不拦截（一步直达）', () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'card-wrapper asset--can-interact'
    const button = document.createElement('button')
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    wrapper.appendChild(button)
    document.body.appendChild(wrapper)
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)
  })

  it('非交互卡牌图像拦截为纯预览（actionable=false）', () => {
    const { el, onClick } = makeCard('card')
    el.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(intercepted[0].actionable).toBe(false)
  })

  it('no-overlay 卡牌不拦截', () => {
    const { onClick } = makeCard('card no-overlay')
    document.body.querySelector('img')!.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)
  })

  it('handler 绑在 actionable 元素的祖先上时，approve 重放仍能触发（嵌套场景）', () => {
    const outer = document.createElement('div')
    const onClick = vi.fn()
    outer.addEventListener('click', onClick)
    const inner = document.createElement('img')
    inner.className = 'card location--can-interact'
    outer.appendChild(inner)
    document.body.appendChild(outer)
    inner.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(intercepted).toHaveLength(1)
    intercept!.approve(intercepted[0])
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('池子 token（poolItem）不拦截，一步直达', () => {
    const pool = document.createElement('div')
    pool.className = 'poolItem health--can-interact'
    const onClick = vi.fn()
    pool.addEventListener('click', onClick)
    document.body.appendChild(pool)
    pool.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)
  })

  it('approve 消费后再点同一元素会再次拦截', () => {
    const { el, onClick } = makeCard('card card--can-interact')
    el.click()
    intercept!.approve(intercepted[0])
    expect(onClick).toHaveBeenCalledTimes(1)
    el.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(2)
  })

  it('shouldPreview 返回 false 时纯预览候选完全放行', () => {
    intercept!.uninstall()
    intercept = installTapIntercept({
      isTouch: () => isTouch,
      onIntercept: (tap) => intercepted.push(tap),
      shouldPreview: () => false,
    })
    const { el, onClick } = makeCard('card')
    el.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(intercepted).toHaveLength(0)
  })
})
