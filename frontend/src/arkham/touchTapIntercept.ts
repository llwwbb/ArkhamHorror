// 触屏「图像两步、文字按钮一步」拦截器。
// 在 document 捕获阶段拦截可交互图像元素的 click（Vue 的 @click 绑定在元素自身，
// 捕获阶段 stopPropagation 即可阻断），交由 CardActionSheet 预览；
// approve() 程序化重放 click 放行一次。

// 可交互标记：仓库用 `*--can-<action>` 系列 class（can-interact / can-progress（密谋、场景卡推进）/
// can-draw / can-use / can-move…）或 plain `can-interact`（牌堆等）。用 `--can-` 通配全部捕获；
// 控件类（poolItem 上的 can-take/can-spend 等）由前面的 poolItem 豁免挡掉，保持一步直达。
const ACTIONABLE_SELECTOR = '.can-interact, [class*="--can-"]'
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
  /** 纯预览候选的裁决回调（如「能解析出卡图吗」）。返回 false 则完全放行。缺省一律预览。 */
  shouldPreview?: (el: HTMLElement) => boolean
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

    // 池子 token（血量/理智等小控件）是控件不是卡图，保持一步直达。
    if (target.closest('.poolItem')) return

    const actionableEl = target.closest<HTMLElement>(ACTIONABLE_SELECTOR)
    if (actionableEl) {
      event.preventDefault()
      event.stopPropagation()
      opts.onIntercept({ el: actionableEl, target, actionable: true })
      return
    }

    const previewEl = target.closest<HTMLElement>(PREVIEW_SELECTOR)
    if (previewEl && (opts.shouldPreview?.(previewEl) ?? true)) {
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
      // click() 正常时同步消费标记；元素已脱离 DOM 等异常时这里兜底清掉，防止陈旧放行。
      approvedTarget = null
    },
    uninstall() {
      document.removeEventListener('click', onClick, { capture: true })
    },
  }
}
