import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} as Record<string, string> } },
  },
  refreshRemotePush: vi.fn(),
  disableRemotePush: vi.fn(),
}))

vi.mock('@/api', () => ({ default: mocks.api }))
vi.mock('@/pushNotifications', () => ({
  refreshRemotePush: mocks.refreshRemotePush,
  disableRemotePush: mocks.disableRemotePush,
}))

import { useUserStore } from './user'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.clearAllMocks()
  mocks.refreshRemotePush.mockResolvedValue(undefined)
  mocks.disableRemotePush.mockResolvedValue(undefined)
  mocks.api.defaults.headers.common = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  setActivePinia(createPinia())
})

describe('user push lifecycle', () => {
  it('refreshes the device token only after authentication has been restored', async () => {
    storage.set('language', 'zh-cn')
    mocks.api.post.mockResolvedValue({ data: { token: 'jwt' } })
    mocks.api.get.mockResolvedValue({
      data: { id: 1, email: 'investigator@example.com', admin: false, beta: false },
    })

    const store = useUserStore()
    await store.authenticate({ email: 'investigator@example.com', password: 'secret' })

    expect(mocks.api.defaults.headers.common.Authorization).toBe('Token jwt')
    expect(mocks.refreshRemotePush).toHaveBeenCalledOnce()
    expect(mocks.refreshRemotePush).toHaveBeenCalledWith('zh')
  })

  it('unregisters push while authentication is still available on logout', async () => {
    mocks.api.post.mockResolvedValue({ data: { token: 'jwt' } })
    mocks.api.get.mockResolvedValue({
      data: { id: 1, email: 'investigator@example.com', admin: false, beta: false },
    })
    let authorizationDuringUnregister: string | undefined
    mocks.disableRemotePush.mockImplementation(async () => {
      authorizationDuringUnregister = mocks.api.defaults.headers.common.Authorization
    })

    const store = useUserStore()
    await store.authenticate({ email: 'investigator@example.com', password: 'secret' })
    await store.logout()

    expect(authorizationDuringUnregister).toBe('Token jwt')
    expect(mocks.api.defaults.headers.common.Authorization).toBeUndefined()
    expect(store.currentUser).toBeNull()
  })
})
