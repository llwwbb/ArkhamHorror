import { cardImg } from '@/arkham/helpers'

// 从任意 DOM 元素解析卡图 URL（原 CardOverlay.getImage 抽取而来，
// CardOverlay 与 CardActionSheet 共用）。
export const getCardImage = (el: HTMLElement, depth = 0): string | null => {
  if (depth > 3) return null // avoid runaway recursion

  if (el.dataset.imageId) return cardImg(el.dataset.imageId)

  if (
    el instanceof HTMLImageElement &&
    el.classList.contains('card') &&
    !el.closest('.revelation')
  ) {
    return el.src || null
  }

  if (el instanceof HTMLDivElement && el.classList.contains('card')) {
    const bg = el.style.backgroundImage
    if (!bg || bg === 'none') return null
    return bg.slice(4, -1).replaceAll('"', '') // strip url("...")
  }

  if (el.dataset.target) {
    const target = document.querySelector<HTMLElement>(`[data-id="${el.dataset.target}"]`)
    return target ? getCardImage(target, depth + 1) : null
  }

  return el.dataset.image ?? null
}
