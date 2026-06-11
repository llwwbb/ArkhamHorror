import { describe, expect, it } from 'vitest'
import { createApp, defineComponent, ref, type Ref } from 'vue'
import { pinchedZoom, usePinchZoom, wheelPinchedZoom } from './usePinchZoom'

// jsdom 没有 PointerEvent/TouchEvent 构造器，用 Event + 属性赋值模拟
function pointerEvent(
  type: string,
  props: { pointerId: number; clientX?: number; clientY?: number },
): Event {
  return Object.assign(new Event(type, { bubbles: true }), { pointerType: 'touch', ...props })
}

function touchMoveEvent(touchCount: number): Event {
  return Object.assign(new Event('touchmove', { bubbles: true, cancelable: true }), {
    touches: Array.from({ length: touchCount }),
  })
}

function mountPinchZoom() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const target = ref<HTMLElement | null>(el)
  const zoom = ref(1)
  const app = createApp(
    defineComponent({
      setup() {
        usePinchZoom(target as Ref<HTMLElement | null>, zoom)
        return () => null
      },
    }),
  )
  app.mount(document.createElement('div'))
  const pinch = (d1: number, d2: number) => {
    el.dispatchEvent(pointerEvent('pointerdown', { pointerId: 10, clientX: 0, clientY: 0 }))
    el.dispatchEvent(pointerEvent('pointerdown', { pointerId: 11, clientX: d1, clientY: 0 }))
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 11, clientX: d2, clientY: 0 }))
  }
  return { el, zoom, pinch, unmount: () => app.unmount() }
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

describe('usePinchZoom 事件处理', () => {
  it('双指捏合驱动 zoom', async () => {
    const { zoom, pinch, unmount } = mountPinchZoom()
    pinch(100, 200)
    await nextFrame()
    expect(zoom.value).toBe(2)
    unmount()
  })

  it('单指被 pointercancel 后不残留（再捏合基线正确）', async () => {
    const { el, zoom, pinch, unmount } = mountPinchZoom()
    // Safari 单指滚动开始时会 cancel 这个 pointer
    el.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: 500, clientY: 500 }))
    window.dispatchEvent(pointerEvent('pointercancel', { pointerId: 1 }))
    // 若 pointerId 1 残留，下面第一个 pointerdown 就会用幽灵坐标错误初始化
    pinch(100, 200)
    await nextFrame()
    expect(zoom.value).toBe(2)
    unmount()
  })

  it('双指 touchmove 被 preventDefault（夺回 Safari 手势），单指不受影响', () => {
    const { el, unmount } = mountPinchZoom()
    const two = touchMoveEvent(2)
    el.dispatchEvent(two)
    expect(two.defaultPrevented).toBe(true)
    const one = touchMoveEvent(1)
    el.dispatchEvent(one)
    expect(one.defaultPrevented).toBe(false)
    unmount()
  })

  it('gesturestart 被 preventDefault（挡 iOS 原生页面缩放）', () => {
    const { el, unmount } = mountPinchZoom()
    const gesture = new Event('gesturestart', { bubbles: true, cancelable: true })
    el.dispatchEvent(gesture)
    expect(gesture.defaultPrevented).toBe(true)
    unmount()
  })
})

describe('pinchedZoom', () => {
  it('双指距离比例缩放', () => {
    expect(pinchedZoom(1, 100, 200)).toBe(2)
    expect(pinchedZoom(2, 200, 100)).toBe(1)
  })

  it('夹在 [0.25, 6] 区间', () => {
    expect(pinchedZoom(1, 100, 1000)).toBe(6)
    expect(pinchedZoom(0.3, 100, 10)).toBe(0.25)
  })

  it('初始距离为 0 时返回原值', () => {
    expect(pinchedZoom(1.5, 0, 100)).toBe(1.5)
  })

  it('保留三位小数', () => {
    expect(pinchedZoom(1, 300, 100)).toBe(0.333)
  })
})

describe('wheelPinchedZoom', () => {
  it('deltaY 为负（张开）放大，为正（捏合）缩小', () => {
    expect(wheelPinchedZoom(1, -10)).toBeGreaterThan(1)
    expect(wheelPinchedZoom(1, 10)).toBeLessThan(1)
  })

  it('放大缩小互为逆操作（指数映射对称）', () => {
    const zoomedIn = wheelPinchedZoom(1, -50)
    expect(wheelPinchedZoom(zoomedIn, 50)).toBeCloseTo(1, 2)
  })

  it('夹在 [0.25, 6] 区间', () => {
    expect(wheelPinchedZoom(5, -1000)).toBe(6)
    expect(wheelPinchedZoom(0.3, 1000)).toBe(0.25)
  })

  it('currentZoom 为 0 时按 1 处理', () => {
    expect(wheelPinchedZoom(0, 0)).toBe(1)
  })
})
