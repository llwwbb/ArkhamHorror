import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import { normalizeLocale } from '@/locales/messages'
import { disableRemotePush, refreshRemotePush } from '@/pushNotifications'
import { Credentials, Registration, Authentication, User } from '@/types'

export interface UserState {
  currentUser: User | null
  token: string | null
}

export const useUserStore = defineStore('user', () => {
  const currentUser = ref<User | null>(null)
  const token = ref<string | null>(null)
  const isAdmin = ref(false)

  async function authenticate(credentials: Credentials) {
    const authentication = await api.post<Authentication>('authenticate', credentials)
    token.value = authentication.data.token
    await setCurrentUser()
  }

  async function register(registration: Registration) {
    const authentication = await api.post<Authentication>('register', registration)
    token.value = authentication.data.token
    await setCurrentUser()
  }

  const notificationLocale = () => normalizeLocale(localStorage.getItem('language') || 'en')

  async function logout() {
    try {
      await disableRemotePush(notificationLocale())
    } catch {
      // Local push state is cleared even when the authenticated delete fails.
    } finally {
      localStorage.removeItem('arkham-token')
      delete api.defaults.headers.common.Authorization
      signOut()
    }
  }

  async function setCurrentUser() {
    if (token.value) {
      localStorage.setItem('arkham-token', token.value)
      api.defaults.headers.common.Authorization = `Token ${token.value}`
      try {
        const whoami = await api.get<User>('whoami')
        currentUser.value = whoami.data
        isAdmin.value = whoami.data.admin
        await refreshRemotePush(notificationLocale()).catch(() => {})
      } catch {
        await logout()
      }
    }
  }

  async function deleteAccount() {
    await api.delete('account')
    await logout()
  }

  async function loadUserFromStorage() {
    if (currentUser.value) return
    const tokenFromStorage = localStorage.getItem('arkham-token')
    if (tokenFromStorage !== null && tokenFromStorage !== undefined) {
      token.value = tokenFromStorage
      await setCurrentUser()
    }
  }

  function signOut() {
    currentUser.value = null
    token.value = null
  }

  return {
    token,
    currentUser,
    isAdmin,
    loadUserFromStorage,
    authenticate,
    register,
    logout,
    deleteAccount,
    setCurrentUser,
  }
})
