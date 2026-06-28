-- Deploy arkham-horror-backend:add_admin_to_users to pg

BEGIN;

ALTER TABLE users ADD COLUMN admin boolean DEFAULT false;

COMMIT;
