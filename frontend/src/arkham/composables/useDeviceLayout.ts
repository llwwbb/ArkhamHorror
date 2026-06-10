import { computed, ref, type Ref } from 'vue'

export type DeviceSize = 'phone' | 'tablet' | 'desktop'

export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'
export const PHONE_QUERY = '(max-width: 800px)'

// 模块级单例：全应用共享一份媒体查询监听，任意位置可调用（不依赖组件生命周期）。
const isTouchState = ref(false)
const isPhoneWidth = ref(false)
let installed = false

function track(query: string, target: Ref<boolean>) {
  const mq = window.matchMedia(query)
  target.value = mq.matches
  mq.addEventListener('change', (e) => (target.value = e.matches))
}

function ensureInstalled() {
  if (installed || typeof window === 'undefined') return
  installed = true
  track(TOUCH_QUERY, isTouchState)
  track(PHONE_QUERY, isPhoneWidth)
}

export function useDeviceLayout() {
  ensureInstalled()
  const size = computed<DeviceSize>(() =>
    isPhoneWidth.value ? 'phone' : isTouchState.value ? 'tablet' : 'desktop',
  )
  return {
    isTouch: computed(() => isTouchState.value),
    size,
    shell: computed<'phone' | 'desktop'>(() => (size.value === 'phone' ? 'phone' : 'desktop')),
  }
}

export function _resetForTests() {
  installed = false
  isTouchState.value = false
  isPhoneWidth.value = false
}
