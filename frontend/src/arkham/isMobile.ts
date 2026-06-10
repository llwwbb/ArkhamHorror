import { computed } from 'vue'
import { useDeviceLayout } from '@/arkham/composables/useDeviceLayout'

// 兼容包装：语义不变（视口宽度 ≤ 800px）。新代码请直接用 useDeviceLayout。
export function IsMobile() {
  const { size } = useDeviceLayout()
  return { isMobile: computed(() => size.value === 'phone') }
}
