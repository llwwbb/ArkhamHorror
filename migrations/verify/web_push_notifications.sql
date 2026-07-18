-- Verify arkham-horror-backend:web_push_notifications on pg

BEGIN;

SELECT id, user_id, fcm_token, locale, refreshed_at
  FROM push_subscriptions
 WHERE FALSE;

SELECT id, user_id, arkham_game_id, game_step, kind, payload, status,
       attempts, next_attempt_at, created_at, sent_at, last_error
  FROM push_notification_outbox
 WHERE FALSE;

ROLLBACK;
