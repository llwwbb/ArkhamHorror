import { onMounted, onUnmounted, watch, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface Options {
  // 当前浏览器玩家的待处理选择数，>0 表示轮到该玩家
  pendingChoices: ComputedRef<number>
  remotePushEnabled?: Readonly<Ref<boolean>>
}

const TITLE_PREFIX = '● '

export const shouldNotifyTurn = (previousCount: number, currentCount: number) =>
  previousCount === 0 && currentCount > 0

export const shouldUseLocalNotification = (remotePushEnabled: boolean) => !remotePushEnabled
export const shouldRequestPermissionAutomatically = () => false

export const remotePushRefreshAction = (
  hasStoredToken: boolean,
  notificationAvailable: boolean,
  permission: NotificationPermission,
  configuredAndSupported: boolean,
) => {
  if (!hasStoredToken) return 'skip' as const
  if (!notificationAvailable || permission !== 'granted') return 'disable' as const
  if (!configuredAndSupported) return 'pause' as const
  return 'refresh' as const
}

export type RemotePushStatus = 'enabled' | 'denied' | 'unsupported'

interface RemotePushRegistrationDependencies {
  isSupported: () => Promise<boolean>
  permission: () => NotificationPermission
  requestPermission: () => Promise<NotificationPermission>
  getToken: () => Promise<string>
  saveToken: (token: string) => Promise<void>
}

interface RemotePushUnregistrationDependencies {
  removeServerToken: () => Promise<void>
  deleteClientToken: () => Promise<void>
  clearLocalToken: () => void
}

export async function registerRemotePush(
  deps: RemotePushRegistrationDependencies,
): Promise<RemotePushStatus> {
  if (!(await deps.isSupported())) return 'unsupported'

  const currentPermission = deps.permission()
  const permission =
    currentPermission === 'default' ? await deps.requestPermission() : currentPermission
  if (permission !== 'granted') return 'denied'

  const token = await deps.getToken()
  await deps.saveToken(token)
  return 'enabled'
}

export async function unregisterRemotePush(
  deps: RemotePushUnregistrationDependencies,
): Promise<void> {
  let failure: unknown

  try {
    await deps.removeServerToken()
  } catch (error) {
    failure = error
  }

  try {
    await deps.deleteClientToken()
  } catch (error) {
    failure ??= error
  } finally {
    deps.clearLocalToken()
  }

  if (failure) throw failure
}

// 页面不在前台时轮到当前玩家：给标签页标题加前缀，并（在已授权时）弹系统通知
export function useTurnNotification({ pendingChoices, remotePushEnabled }: Options) {
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
    if (
      shouldUseLocalNotification(remotePushEnabled?.value ?? false) &&
      supportsNotification &&
      Notification.permission === 'granted'
    ) {
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
    if (shouldNotifyTurn(prev, count) && document.hidden) notify()
    if (count === 0) clear()
  })

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    clear()
  })
}
