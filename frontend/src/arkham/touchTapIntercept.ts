// 触屏「图像两步、文字按钮一步」拦截器。
// 在 document 捕获阶段拦截可交互图像元素的 click（Vue 的 @click 绑定在元素自身，
// 捕获阶段 stopPropagation 即可阻断），交由 CardActionSheet 预览；
// approve() 程序化重放 click 放行一次。

// 两步确认只给「需要读内容/有决策」的交互：卡牌类（*--can-interact 家族：手牌、
// 敌人、支援、地点…）和密谋/场景卡推进（*--can-progress）。
// 桌面陈设类动作（牌堆抽牌、混乱袋、塔罗、池子控件）一步直达，见下方豁免清单。
const ACTIONABLE_SELECTOR = '[class*="--can-interact"], [class*="--can-progress"]'
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

    // 一步直达豁免（完全放行，连预览也不拦）：
    // - poolItem：血量/理智等池子控件
    // - plain can-interact：遭遇/剧本牌堆、塔罗牌等桌面陈设
    // - token--can-draw / deck--can-draw：混乱袋抽取、玩家牌堆抽牌——无决策动作
    if (target.closest('.poolItem, .can-interact, .token--can-draw, .deck--can-draw')) return

    let actionableEl = target.closest<HTMLElement>(ACTIONABLE_SELECTOR)
    // 地图格子（.location-cell）的 can-interact 只是容器级高亮标记，真正的点击
    // 处理在内层 card-frame——点中格子空白处时不拦截（与桌面点击空白无事发生一致）。
    if (actionableEl?.matches('.location-cell')) actionableEl = null
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
