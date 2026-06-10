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

// 双指捏合驱动 zoom ref。pointerdown 绑在目标元素上，move/up 绑在 window
// （与 Scenario 的地点拖拽同一模式），手指滑出元素也不丢事件。
export function usePinchZoom(target: Ref<HTMLElement | null>, zoom: Ref<number>) {
  const pointers = new Map<number, { x: number; y: number }>()
  let initialDistance = 0
  let initialZoom = 1

  const currentDistance = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 2) {
      initialDistance = currentDistance()
      initialZoom = zoom.value || 1
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerEnd)
      window.addEventListener('pointercancel', onPointerEnd)
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 2 && initialDistance > 0) {
      zoom.value = pinchedZoom(initialZoom, initialDistance, currentDistance())
    }
  }

  const onPointerEnd = (e: PointerEvent) => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) {
      initialDistance = 0
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerEnd)
      window.removeEventListener('pointercancel', onPointerEnd)
    }
  }

  watch(
    target,
    (el, _old, onCleanup) => {
      if (!el) return
      el.addEventListener('pointerdown', onPointerDown)
      onCleanup(() => el.removeEventListener('pointerdown', onPointerDown))
    },
    { immediate: true },
  )

  onUnmounted(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerEnd)
    window.removeEventListener('pointercancel', onPointerEnd)
  })
}
