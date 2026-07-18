import { describe, expect, it } from 'vitest'
import * as turnNotification from './useTurnNotification'

type TurnNotificationPolicy = {
  shouldNotifyTurn?: (previousCount: number, currentCount: number) => boolean
  shouldUseLocalNotification?: (remotePushEnabled: boolean) => boolean
  registerRemotePush?: (deps: {
    isSupported: () => Promise<boolean>
    permission: () => NotificationPermission
    requestPermission: () => Promise<NotificationPermission>
    getToken: () => Promise<string>
    saveToken: (token: string) => Promise<void>
  }) => Promise<string>
  shouldRequestPermissionAutomatically?: () => boolean
  unregisterRemotePush?: (deps: {
    removeServerToken: () => Promise<void>
    deleteClientToken: () => Promise<void>
    clearLocalToken: () => void
  }) => Promise<void>
  remotePushRefreshAction?: (
    hasStoredToken: boolean,
    notificationAvailable: boolean,
    permission: NotificationPermission,
    configuredAndSupported: boolean,
  ) => 'skip' | 'disable' | 'pause' | 'refresh'
}

const policy = turnNotification as TurnNotificationPolicy

describe('turn notification policy', () => {
  it('notifies only when pending choices transition from empty to non-empty', () => {
    expect(typeof policy.shouldNotifyTurn).toBe('function')
    expect(policy.shouldNotifyTurn?.(0, 1)).toBe(true)
    expect(policy.shouldNotifyTurn?.(0, 3)).toBe(true)
    expect(policy.shouldNotifyTurn?.(1, 2)).toBe(false)
    expect(policy.shouldNotifyTurn?.(1, 0)).toBe(false)
  })

  it('uses the local system notification only when remote push is disabled', () => {
    expect(typeof policy.shouldUseLocalNotification).toBe('function')
    expect(policy.shouldUseLocalNotification?.(false)).toBe(true)
    expect(policy.shouldUseLocalNotification?.(true)).toBe(false)
  })

  it('registers the FCM token after permission is granted', async () => {
    expect(typeof policy.registerRemotePush).toBe('function')
    let saved = ''
    const status = await policy.registerRemotePush?.({
      isSupported: async () => true,
      permission: () => 'default',
      requestPermission: async () => 'granted',
      getToken: async () => 'fcm-token',
      saveToken: async (token) => {
        saved = token
      },
    })

    expect(status).toBe('enabled')
    expect(saved).toBe('fcm-token')
  })

  it('does not request permission when web push is unsupported', async () => {
    expect(typeof policy.registerRemotePush).toBe('function')
    let requested = false
    const status = await policy.registerRemotePush?.({
      isSupported: async () => false,
      permission: () => 'default',
      requestPermission: async () => {
        requested = true
        return 'granted'
      },
      getToken: async () => 'unused',
      saveToken: async () => {},
    })

    expect(status).toBe('unsupported')
    expect(requested).toBe(false)
  })

  it('does not create a token when notification permission is denied', async () => {
    expect(typeof policy.registerRemotePush).toBe('function')
    let tokenRequested = false
    const status = await policy.registerRemotePush?.({
      isSupported: async () => true,
      permission: () => 'denied',
      requestPermission: async () => 'denied',
      getToken: async () => {
        tokenRequested = true
        return 'unused'
      },
      saveToken: async () => {},
    })

    expect(status).toBe('denied')
    expect(tokenRequested).toBe(false)
  })

  it('never requests notification permission automatically on game mount', () => {
    expect(typeof policy.shouldRequestPermissionAutomatically).toBe('function')
    expect(policy.shouldRequestPermissionAutomatically?.()).toBe(false)
  })

  it('cleans up the browser token even when server unregistration fails', async () => {
    expect(typeof policy.unregisterRemotePush).toBe('function')
    const actions: string[] = []

    await expect(
      policy.unregisterRemotePush?.({
        removeServerToken: async () => {
          actions.push('server')
          throw new Error('offline')
        },
        deleteClientToken: async () => {
          actions.push('client')
        },
        clearLocalToken: () => {
          actions.push('local')
        },
      }),
    ).rejects.toThrow('offline')

    expect(actions).toEqual(['server', 'client', 'local'])
  })

  it('disables a stored registration when notification permission is gone', () => {
    expect(typeof policy.remotePushRefreshAction).toBe('function')
    expect(policy.remotePushRefreshAction?.(true, true, 'denied', true)).toBe('disable')
    expect(policy.remotePushRefreshAction?.(true, false, 'default', false)).toBe('disable')
  })

  it('pauses rather than deleting a token when Firebase is temporarily unavailable', () => {
    expect(typeof policy.remotePushRefreshAction).toBe('function')
    expect(policy.remotePushRefreshAction?.(true, true, 'granted', false)).toBe('pause')
    expect(policy.remotePushRefreshAction?.(true, true, 'granted', true)).toBe('refresh')
    expect(policy.remotePushRefreshAction?.(false, true, 'granted', true)).toBe('skip')
  })
})
