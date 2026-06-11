import { onMounted, onUnmounted, watch, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'

interface Options {
  // 当前浏览器玩家的待处理选择数，>0 表示轮到该玩家
  pendingChoices: ComputedRef<number>
}

const TITLE_PREFIX = '● '

// 页面不在前台时轮到当前玩家：给标签页标题加前缀，并（在已授权时）弹系统通知
export function useTurnNotification({ pendingChoices }: Options) {
  const { t } = useI18n()

  let baseTitle = document.title
  let titleMarked = false
  let notification: Notification | null = null

  const supportsNotification = 'Notification' in window

  const markTitle = () => {
    if (titleMarked) return
    baseTitle = document.title
    document.title = TITLE_PREFIX + t('gameBar.yourTurnTitle') + ' - ' + baseTitle
    titleMarked = true
  }

  const clear = () => {
    if (titleMarked) {
      document.title = baseTitle
      titleMarked = false
    }
    if (notification) {
      notification.close()
      notification = null
    }
  }

  const notify = () => {
    markTitle()
    if (supportsNotification && Notification.permission === 'granted') {
      notification = new Notification(t('gameBar.yourTurnTitle'), {
        body: t('gameBar.yourTurnBody'),
        tag: 'arkham-your-turn',
      })
      notification.onclick = () => {
        window.focus()
        clear()
      }
    }
  }

  const onVisibilityChange = () => {
    if (!document.hidden) clear()
  }

  watch(pendingChoices, (count, prev) => {
    if (count > 0 && prev === 0 && document.hidden) notify()
    if (count === 0) clear()
  })

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (supportsNotification && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    clear()
  })
}
