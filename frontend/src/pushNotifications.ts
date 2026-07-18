import { ref } from 'vue'
import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging'
import api from '@/api'
import {
  registerRemotePush,
  remotePushRefreshAction,
  unregisterRemotePush,
  type RemotePushStatus,
} from '@/arkham/composables/useTurnNotification'

const TOKEN_STORAGE_KEY = 'arkham-fcm-token'

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined

export const remotePushEnabled = ref(false)

const configured = () =>
  Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      vapidKey,
  )

const firebaseApp = () => (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp())

const serviceWorkerUrl = () => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(firebaseConfig)) {
    if (value) params.set(key, String(value))
  }
  return `/firebase-messaging-sw.js?${params.toString()}`
}

async function messagingToken(): Promise<string> {
  const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), { scope: '/' })
  return getToken(getMessaging(firebaseApp()), {
    vapidKey,
    serviceWorkerRegistration: registration,
  })
}

async function saveToken(token: string, locale: string): Promise<void> {
  await api.post('push-subscriptions', { token, locale })
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  remotePushEnabled.value = true
}

export async function enableRemotePush(locale: string): Promise<RemotePushStatus> {
  return registerRemotePush({
    isSupported: async () => configured() && (await isSupported()),
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    getToken: messagingToken,
    saveToken: (token) => saveToken(token, locale),
  })
}

export async function disableRemotePush(locale: string): Promise<void> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  await unregisterRemotePush({
    removeServerToken: async () => {
      if (token) await api.delete('push-subscriptions', { data: { token, locale } })
    },
    deleteClientToken: async () => {
      if (configured() && (await isSupported())) {
        await deleteToken(getMessaging(firebaseApp()))
      }
    },
    clearLocalToken: () => {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      remotePushEnabled.value = false
    },
  })
}

export async function refreshRemotePush(locale: string): Promise<void> {
  const previousToken = localStorage.getItem(TOKEN_STORAGE_KEY)
  const notificationAvailable = 'Notification' in window
  const permission = notificationAvailable ? Notification.permission : 'default'
  const configuredAndSupported = notificationAvailable && configured() && (await isSupported())

  switch (
    remotePushRefreshAction(
      previousToken !== null,
      notificationAvailable,
      permission,
      configuredAndSupported,
    )
  ) {
    case 'disable':
      await disableRemotePush(locale)
      return
    case 'pause':
    case 'skip':
      remotePushEnabled.value = false
      return
    case 'refresh':
      break
  }

  const currentToken = await messagingToken()
  await saveToken(currentToken, locale)
  if (currentToken !== previousToken) {
    await api.delete('push-subscriptions', { data: { token: previousToken, locale } })
  }
}
