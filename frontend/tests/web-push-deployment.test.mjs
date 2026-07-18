import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

const firebaseBuildArgs = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'FIREBASE_VAPID_KEY',
]

test('production image builds pass every Firebase Web configuration value', async () => {
  const makefile = await read('Makefile')

  for (const variable of firebaseBuildArgs) {
    assert.match(makefile, new RegExp(`--build-arg ${variable}=`))
  }
  assert.ok(
    makefile.match(/\$\(V2_FIREBASE_BUILD_ARGS\)/g)?.length >= 3,
    'all three v2 image build paths must use V2_FIREBASE_BUILD_ARGS',
  )
})

test('the Kubernetes deployment mounts the FCM service account and origin', async () => {
  const [app, variables] = await Promise.all([
    read('terraform/app.tf'),
    read('terraform/variables.tf'),
  ])

  assert.match(variables, /variable "firebase_service_account_json"/)
  assert.match(variables, /variable "fcm_web_origin"/)
  assert.match(app, /GOOGLE_APPLICATION_CREDENTIALS/)
  assert.match(app, /FCM_WEB_ORIGIN/)
  assert.match(app, /firebase-service-account\.json/)
})

test('Docker Compose has an opt-in FCM secret override', async () => {
  const compose = await read('docker-compose.fcm.yml')

  assert.match(compose, /GOOGLE_APPLICATION_CREDENTIALS/)
  assert.match(compose, /FCM_WEB_ORIGIN/)
  assert.match(compose, /firebase_service_account/)
})

test('changing the UI language refreshes the registered push locale', async () => {
  const settings = await read('frontend/src/components/SettingsForm.vue')

  assert.match(settings, /refreshRemotePush\(uiLocale\)/)
})
