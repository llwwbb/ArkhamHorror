# Web Push through Firebase Cloud Messaging

Turn notifications are produced by a server-side transition from no pending
question to a pending question for a human player. The game update and the
notification outbox row commit together; a background worker delivers the
outbox through the FCM HTTP v1 API.

Notifications require HTTPS in production. The user must explicitly enable
them in Settings; the application never requests browser permission during
page load. Logging out unregisters the current browser token before clearing
authentication, which prevents a shared browser from continuing to receive a
previous account's turn notifications.

## Firebase project setup

1. Register a Web App in Firebase.
2. In **Project settings > Cloud Messaging**, create or import a Web Push VAPID
   key pair and copy its public key.
3. Enable the **FCM Registration API** and **Firebase Cloud Messaging API** in
   the Google Cloud project.
4. Create a service account allowed to send FCM HTTP v1 messages and download
   its JSON key. Store that file outside the repository.

## Frontend build configuration

Set these build arguments (or their matching `VITE_` variables for a local
Vite build):

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_VAPID_KEY`

These values are Firebase Web App identifiers and the public VAPID key; they
are not service-account secrets. If they are absent, the settings page reports
that remote notifications cannot be enabled and the existing in-tab fallback
continues to work.

The values are compiled into the frontend. Changing them requires rebuilding
the image. The `v2-deploy`, `v2-deploy-committed`, and `v2-push-multiarch`
targets read the seven `FIREBASE_*` values from their environment and pass them
to the Docker build.

## Backend runtime configuration

Enable the delivery worker with both variables:

- `GOOGLE_APPLICATION_CREDENTIALS`: path inside the API container to a mounted
  Firebase service-account JSON file.
- `FCM_WEB_ORIGIN`: public origin without the hash route, for example
  `https://arkhamhorror.app`.

The service account needs permission to send Firebase Cloud Messaging API v1
messages. Never copy its JSON key into the image or repository. Mount it as a
runtime secret and point `GOOGLE_APPLICATION_CREDENTIALS` to that mount.

When either runtime variable is absent, the worker remains disabled. Game
actions and WebSocket updates continue normally; pending outbox rows remain
available for delivery after the configuration is supplied.

### Docker Compose

Use the opt-in override so deployments without Firebase are unaffected:

```sh
export FIREBASE_SERVICE_ACCOUNT_FILE=/absolute/path/firebase-service-account.json
export FCM_WEB_ORIGIN=https://arkhamhorror.app
docker compose -f docker-compose.yml -f docker-compose.fcm.yml up --build
```

The normal frontend `FIREBASE_*` variables must be present in the same shell
for the image build.

### Terraform / Kubernetes

Set both Terraform variables:

```hcl
fcm_web_origin               = "https://arkhamhorror.app"
firebase_service_account_json = file("/absolute/path/firebase-service-account.json")
```

Terraform stores the JSON in a Kubernetes Secret and mounts it read-only at
`/var/run/secrets/arkham/firebase-service-account.json`. Keep the sensitive
value in an encrypted or otherwise protected `.tfvars` source; do not commit
it. The public frontend values still come from the `FIREBASE_*` environment
used by the Make target.

## Database and delivery behavior

Deploy the `web_push_notifications` migration before starting the new image.
The standard Compose `migrate` service does this automatically.

- Each browser token is unique and can be rebound only by an authenticated
  request from the browser holding it.
- A notification is queued only when a human player's pending choices change
  from empty to non-empty.
- The game step and outbox row commit in the same database transaction.
- Multiple API replicas claim outbox rows with a five-minute lease.
- Invalid FCM registration tokens are deleted. Transient 429/5xx responses use
  minute-based exponential backoff, honor a numeric `Retry-After`, and stop
  after eight attempts. Permanent payload errors are retained as failed rows
  for diagnosis.

## Verification

After deploying:

1. Sign in in a supported browser and enable turn notifications in Settings.
2. Confirm `POST /api/v1/push-subscriptions` returns `{ "enabled": true }` and
   a row exists in `push_subscriptions`.
3. From another player, create a choice for the subscribed investigator.
4. Confirm a `your_turn` row moves from `pending` to `sent` in
   `push_notification_outbox` and that the browser receives the notification
   while the tab is in the background or closed.
5. Click the notification and confirm it opens the corresponding game route.
6. Log out and confirm the browser token is removed from `push_subscriptions`.

The service-account key is never a frontend value. Firebase Web App identifiers
and the public VAPID key are intentionally public; only the service-account JSON
must remain secret.
