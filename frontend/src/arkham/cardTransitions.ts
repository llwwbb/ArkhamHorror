import gsap from 'gsap'

// gsap 卡牌进出场动画钩子。每个 transition-group 调一次工厂。
// rectMap 按 data-index（cardId）记录离场元素位置：传入同一个 map 可让多个
// transition-group 共享，实现卡牌跨区飞行动画（如手牌区离场 → 入场区飞入）；
// 不传则各自独立、互不串扰。
export function createCardTransitionHooks(rectMap: Map<string, DOMRect> = new Map()) {

  function isHtmlElement(el: Element): el is HTMLElement {
    return el instanceof HTMLElement
  }

  function onBeforeEnter(el: Element) {
    if (!isHtmlElement(el)) return
    if (el.classList.contains('committed-skills')) return
    const idx = el.dataset.index
    if (!idx || !rectMap.has(idx)) return
    el.style.opacity = '0'
    el.style.width = '0'
  }

  function onEnter(el: Element, done: () => void) {
    if (!isHtmlElement(el)) return
    if (el.classList.contains('committed-skills')) { el.removeAttribute('style'); done(); return }

    const idx = el.dataset.index
    const finalRect = el.getBoundingClientRect()

    if (!idx) {
      const width = window.getComputedStyle(el).width
      gsap.to(el, { opacity: 1, width, onComplete: () => { el.removeAttribute('style'); done() } })
      return
    }

    const rect = rectMap.get(idx)
    rectMap.delete(idx)
    if (!rect) { el.removeAttribute('style'); done(); return }

    const startX = rect.left - finalRect.left
    const startY = rect.top - finalRect.top

    const c = el.cloneNode(true) as HTMLElement
    c.style.position = 'fixed'
    c.style.width = rect.width + 'px'
    el.parentNode?.insertBefore(c, el)

    const cRect = c.getBoundingClientRect()
    const finalX = finalRect.left - cRect.left

    gsap.timeline()
      .add('start')
      .to(el, { startAt: { opacity: 0, width: 0 }, width: rect.width, clearProps: 'width', duration: 0.3 }, 'start')
      .to(c, {
        startAt: { x: startX, y: startY, opacity: 1 },
        x: finalX, y: 0, duration: 0.3,
        onComplete: () => { c.remove(); el.style.opacity = '1'; done() }
      }, 'start')
  }

  function onLeave(el: Element, done: () => void) {
    if (!isHtmlElement(el)) return
    if (el.classList.contains('committed-skills')) { done(); return }
    const idx = el.dataset.index
    if (!idx) { done(); return }
    rectMap.set(idx, el.getBoundingClientRect())
    gsap.to(el, { startAt: { opacity: 0 }, width: 0, margin: 0, duration: 0.3, onComplete: done })
  }

  return { onBeforeEnter, onEnter, onLeave }
}
