import { onUnmounted, watch, type Ref } from 'vue'

// 区间与缩放滑杆一致（Scenario.vue zoom-slider: min 0.25 / max 6）。
export function pinchedZoom(
  initialZoom: number,
  initialDistance: number,
  currentDistance: number,
  min = 0.25,
  max = 6,
): number {
  if (initialDistance <= 0) return initialZoom
  const next = initialZoom * (currentDistance / initialDistance)
  return Math.min(max, Math.max(min, parseFloat(next.toFixed(3))))
}

// 触摸板捏合（Chrome/Edge/Firefox 表示为 ctrl+wheel）的缩放：deltaY 指数映射，
// 负值（张开）放大。区间与滑杆一致。
export function wheelPinchedZoom(currentZoom: number, deltaY: number, min = 0.25, max = 6): number {
  const next = (currentZoom || 1) * Math.exp(-deltaY * 0.01)
  return Math.min(max, Math.max(min, parseFloat(next.toFixed(3))))
}

// 双指捏合驱动 zoom ref。pointerdown 绑在目标元素上，move/up 绑在 window
// （与 Scenario 的地点拖拽同一模式），手指滑出元素也不丢事件。
export function usePinchZoom(target: Ref<HTMLElement | null>, zoom: Ref<number>) {
  const pointers = new Map<number, { x: number; y: number }>()
  let initialDistance = 0
  let initialZoom = 1

  // Issue 3: rAF 节流，避免每帧都写 zoom 触发 localStorage 同步写 + 布局测量
  let rafId: number | null = null
  let pendingZoom: number | null = null

  const flushZoom = () => {
    rafId = null
    if (pendingZoom !== null && pendingZoom !== zoom.value) zoom.value = pendingZoom
    pendingZoom = null
  }

  const currentDistance = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) {
      // up/cancel 从第一指起就要监听：iOS Safari 在单指滚动开始时会对该指
      // 发 pointercancel，若此时不清理，map 里残留幽灵坐标会毒化下次捏合基线
      window.addEventListener('pointerup', onPointerEnd)
      window.addEventListener('pointercancel', onPointerEnd)
    }
    if (pointers.size === 2) {
      initialDistance = currentDistance()
      initialZoom = zoom.value || 1
      window.addEventListener('pointermove', onPointerMove)
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 2 && initialDistance > 0) {
      pendingZoom = pinchedZoom(initialZoom, initialDistance, currentDistance())
      rafId ??= requestAnimationFrame(flushZoom)
    }
  }

  // 触摸板捏合：浏览器表示为 ctrl+wheel（真实的 ctrl+滚轮语义相同——都是浏览器
  // 页面缩放手势）。在地图区域内截获并改为缩放地图；Cmd +/- 页面缩放不受影响。
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    pendingZoom = wheelPinchedZoom(pendingZoom ?? zoom.value, e.deltaY)
    rafId ??= requestAnimationFrame(flushZoom)
  }

  // iOS Safari 会把双指手势认领为滚动/原生缩放并对 pointer 发 pointercancel，
  // touch-action 声明拦不住（Safari 怪癖）。唯一可靠的夺回方式是在非 passive
  // 的 touchmove 里对 ≥2 指 preventDefault；单指滚动/拖拽不受影响。
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length >= 2) e.preventDefault()
  }

  // iOS 私有手势事件，挡掉 Safari 的原生页面缩放
  const preventGesture = (e: Event) => e.preventDefault()

  const onPointerEnd = (e: PointerEvent) => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) {
      initialDistance = 0
      window.removeEventListener('pointermove', onPointerMove)
    }
    if (pointers.size === 0) {
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
    } else if (pointers.size === 2) {
      // Issue 2: 3→2 指降级时重置基线到当前指对，避免缩放跳变。
      // 先冲刷 pending zoom，确保 initialZoom 读到最新值。
      if (pendingZoom !== null) {
        zoom.value = pendingZoom
        pendingZoom = null
      }
      initialDistance = currentDistance()
      initialZoom = zoom.value || 1
    }
  }

  watch(
    target,
    (el, _old, onCleanup) => {
      if (!el) return
      // Issue 1: 捕获阶段注册，绕过地点解锁拖拽在捕获阶段的 stopPropagation，
      // 保证解锁模式下双指捏合仍可触发。pinch 只读坐标，不调用 preventDefault/
      // stopPropagation，是安全的被动观察者，不影响拖拽逻辑。
      el.addEventListener('pointerdown', onPointerDown, { capture: true })
      // wheel/touchmove 需要 non-passive 才能 preventDefault 掉浏览器默认手势
      el.addEventListener('wheel', onWheel, { passive: false })
      el.addEventListener('touchmove', onTouchMove, { passive: false })
      el.addEventListener('gesturestart', preventGesture)
      el.addEventListener('gesturechange', preventGesture)
      el.addEventListener('gestureend', preventGesture)
      onCleanup(() => {
        el.removeEventListener('pointerdown', onPointerDown, { capture: true })
        el.removeEventListener('wheel', onWheel)
        el.removeEventListener('touchmove', onTouchMove)
        el.removeEventListener('gesturestart', preventGesture)
        el.removeEventListener('gesturechange', preventGesture)
        el.removeEventListener('gestureend', preventGesture)
      })
    },
    { immediate: true },
  )

  onUnmounted(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerEnd)
    window.removeEventListener('pointercancel', onPointerEnd)
    if (rafId !== null) cancelAnimationFrame(rafId)
  })
}
