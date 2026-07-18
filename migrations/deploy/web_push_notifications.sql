-- Deploy arkham-horror-backend:web_push_notifications to pg
-- requires: arkham_games
-- requires: users

BEGIN;

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id bigint REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  fcm_token text NOT NULL,
  locale text NOT NULL,
  refreshed_at timestamptz NOT NULL,
  CONSTRAINT unique_push_subscription_token UNIQUE (fcm_token)
);

CREATE INDEX idx_push_subscriptions_user
  ON push_subscriptions (user_id);

CREATE TABLE push_notification_outbox (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id bigint REFERENCES users (id) ON DELETE CASCADE NOT NULL,
  arkham_game_id uuid REFERENCES arkham_games (id) ON DELETE CASCADE NOT NULL,
  game_step integer NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  sent_at timestamptz,
  last_error text,
  CONSTRAINT push_notification_outbox_status
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  CONSTRAINT unique_push_notification
    UNIQUE (arkham_game_id, game_step, user_id, kind)
);

CREATE INDEX idx_push_notification_outbox_pending
  ON push_notification_outbox (next_attempt_at)
  WHERE status IN ('pending', 'processing');

COMMIT;
