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

  it('plain can-interact class（如牌堆）也拦截', () => {
    const { el, onClick } = makeCard('can-interact')
    el.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(intercepted[0].actionable).toBe(true)
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
})
