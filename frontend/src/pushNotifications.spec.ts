import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: { post: vi.fn(), delete: vi.fn() },
  deleteToken: vi.fn(),
  getMessaging: vi.fn(() => ({ name: 'messaging' })),
  getToken: vi.fn(),
  isSupported: vi.fn(),
  getApp: vi.fn(() => ({ name: 'firebase-app' })),
  getApps: vi.fn((): unknown[] => []),
  initializeApp: vi.fn(() => ({ name: 'firebase-app' })),
  register: vi.fn(),
  requestPermission: vi.fn(),
}))

vi.mock('@/api', () => ({ default: mocks.api }))
vi.mock('firebase/app', () => ({
  getApp: mocks.getApp,
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp,
}))
vi.mock('firebase/messaging', () => ({
  deleteToken: mocks.deleteToken,
  getMessaging: mocks.getMessaging,
  getToken: mocks.getToken,
  isSupported: mocks.isSupported,
}))

const storage = new Map<string, string>()

async function loadModule(permission: NotificationPermission) {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: mocks.requestPermission,
  })
  vi.stubGlobal('navigator', { serviceWorker: { register: mocks.register } })
  vi.stubGlobal('window', { Notification: globalThis.Notification })

  return import('./pushNotifications')
}

beforeEach(() => {
  storage.clear()
  vi.clearAllMocks()
  vi.resetModules()
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'api-key')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'project-id')
  vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'sender-id')
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'app-id')
  vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'vapid-key')
  mocks.api.post.mockResolvedValue({ data: { enabled: true } })
  mocks.api.delete.mockResolvedValue({ data: { enabled: false } })
  mocks.deleteToken.mockResolvedValue(true)
  mocks.isSupported.mockResolvedValue(true)
  mocks.register.mockResolvedValue({ scope: '/' })
  mocks.requestPermission.mockResolvedValue('granted')
})

describe('Firebase push registration', () => {
  it('registers the service worker, obtains a token, and saves it to the API', async () => {
    mocks.getToken.mockResolvedValue('new-token')
    const push = await loadModule('default')

    await expect(push.enableRemotePush('zh')).resolves.toBe('enabled')

    expect(mocks.register).toHaveBeenCalledOnce()
    expect(mocks.getToken).toHaveBeenCalledWith(
      { name: 'messaging' },
      expect.objectContaining({ vapidKey: 'vapid-key', serviceWorkerRegistration: { scope: '/' } }),
    )
    expect(mocks.api.post).toHaveBeenCalledWith('push-subscriptions', {
      token: 'new-token',
      locale: 'zh',
    })
    expect(storage.get('arkham-fcm-token')).toBe('new-token')
    expect(push.remotePushEnabled.value).toBe(true)
  })

  it('rebinds a rotated token before deleting the previous server token', async () => {
    storage.set('arkham-fcm-token', 'old-token')
    mocks.getToken.mockResolvedValue('new-token')
    const push = await loadModule('granted')

    await push.refreshRemotePush('en')

    expect(mocks.api.post).toHaveBeenCalledWith('push-subscriptions', {
      token: 'new-token',
      locale: 'en',
    })
    expect(mocks.api.delete).toHaveBeenCalledWith('push-subscriptions', {
      data: { token: 'old-token', locale: 'en' },
    })
    expect(mocks.api.post.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.api.delete.mock.invocationCallOrder[0],
    )
  })

  it('clears the browser token even if server unregistration is offline', async () => {
    storage.set('arkham-fcm-token', 'old-token')
    mocks.api.delete.mockRejectedValue(new Error('offline'))
    const push = await loadModule('granted')

    await expect(push.disableRemotePush('en')).rejects.toThrow('offline')

    expect(mocks.deleteToken).toHaveBeenCalledOnce()
    expect(storage.has('arkham-fcm-token')).toBe(false)
    expect(push.remotePushEnabled.value).toBe(false)
  })
})
