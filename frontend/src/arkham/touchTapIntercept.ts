// 触屏「图像两步、文字按钮一步」拦截器。
// 在 document 捕获阶段拦截可交互图像元素的 click（Vue 的 @click 绑定在元素自身，
// 捕获阶段 stopPropagation 即可阻断），交由 CardActionSheet 预览；
// approve() 程序化重放 click 放行一次。

// 可交互标记：仓库统一用 `*--can-interact`（card/location/enemy/asset…）或 plain `can-interact`（牌堆等）。
const ACTIONABLE_SELECTOR = '.can-interact, [class*="--can-interact"]'
// 纯预览候选：无动作的卡牌图像，tap 也应能看大图（取代不可发现的长按）。
const PREVIEW_SELECTOR = 'img.card'
// 一步直达的真实控件，永不拦截。
const PASSTHROUGH_SELECTOR = 'button, a, input, select, textarea, [role="button"]'

export interface InterceptedTap {
  /** 命中的可交互容器（或预览图像本身） */
  el: HTMLElement
  /** 原始 click 目标，approve 时对它重放 click */
  target: HTMLElement
  /** true = 有直接动作需确认；false = 纯预览 */
  actionable: boolean
}

export interface TapIntercept {
  approve(tap: InterceptedTap): void
  uninstall(): void
}

export function installTapIntercept(opts: {
  isTouch: () => boolean
  onIntercept: (tap: InterceptedTap) => void
}): TapIntercept {
  let approvedTarget: HTMLElement | null = null

  const onClick = (event: MouseEvent) => {
    if (!opts.isTouch()) return
    const target = event.target as HTMLElement | null
    if (!target) return
    if (approvedTarget === target) {
      approvedTarget = null
      return
    }
    if (target.closest(PASSTHROUGH_SELECTOR)) return
    if (target.closest('.no-overlay, .card-action-sheet')) return

    const actionableEl = target.closest<HTMLElement>(ACTIONABLE_SELECTOR)
    if (actionableEl) {
      event.preventDefault()
      event.stopPropagation()
      opts.onIntercept({ el: actionableEl, target, actionable: true })
      return
    }

    const previewEl = target.closest<HTMLElement>(PREVIEW_SELECTOR)
    if (previewEl) {
      event.preventDefault()
      event.stopPropagation()
      opts.onIntercept({ el: previewEl, target: previewEl, actionable: false })
    }
  }

  document.addEventListener('click', onClick, { capture: true })
  return {
    approve(tap) {
      approvedTarget = tap.target
      tap.target.click()
    },
    uninstall() {
      document.removeEventListener('click', onClick, { capture: true })
    },
  }
}
