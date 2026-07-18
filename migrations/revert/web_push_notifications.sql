-- Revert arkham-horror-backend:web_push_notifications from pg

BEGIN;

DROP TABLE IF EXISTS push_notification_outbox;
DROP TABLE IF EXISTS push_subscriptions;

COMMIT;
