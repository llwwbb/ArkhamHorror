import { computed } from 'vue'
import { useDeviceLayout } from '@/arkham/composables/useDeviceLayout'

// 兼容包装：原实现用 window.innerWidth <= 800（resize 监听），现改为 matchMedia(max-width: 800px)。
// 语义接近但不含滚动条宽度（Firefox 在 784-800px 边界略有差异）。新代码请直接用 useDeviceLayout。
export function IsMobile() {
  const { size } = useDeviceLayout()
  return { isMobile: computed(() => size.value === 'phone') }
}
