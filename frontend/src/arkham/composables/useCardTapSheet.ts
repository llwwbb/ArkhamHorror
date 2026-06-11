import { onMounted, onUnmounted, shallowRef, watch, type ShallowRef } from 'vue'
import type * as Arkham from '@/arkham/types/Game'
import {
  installTapIntercept,
  type InterceptedTap,
  type TapIntercept,
} from '@/arkham/touchTapIntercept'
import { getCardImage } from '@/arkham/cardImageLookup'

// 触屏「图像两步」面板状态：installTapIntercept 拦到 tap 后存入 sheetTap，
// CardActionSheet 确认时经 approve() 重放原 click。生命周期挂在调用方组件上。
export function useCardTapSheet(opts: {
  isTouch: () => boolean
  game: ShallowRef<Arkham.Game | null>
}) {
  const sheetTap = shallowRef<InterceptedTap | null>(null)
  let tapIntercept: TapIntercept | null = null

  // 服务器推送新状态后，面板里的动作可能已失效，直接关闭
  watch(opts.game, () => {
    sheetTap.value = null
  })

  function confirmSheetAction() {
    const tap = sheetTap.value
    sheetTap.value = null
    if (tap) tapIntercept?.approve(tap)
  }

  function closeSheet() {
    sheetTap.value = null
  }

  onMounted(() => {
    tapIntercept = installTapIntercept({
      isTouch: opts.isTouch,
      shouldPreview: (el) => getCardImage(el) !== null,
      onIntercept: (tap) => {
        document.dispatchEvent(new Event('arkham:clear-card-overlay'))
        sheetTap.value = tap
      },
    })
  })

  onUnmounted(() => {
    tapIntercept?.uninstall()
    tapIntercept = null
  })

  return { sheetTap, confirmSheetAction, closeSheet }
}
