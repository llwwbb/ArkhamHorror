-- Verify arkham-horror-backend:add_admin_to_users on pg

BEGIN;

SELECT admin FROM users LIMIT 0;

ROLLBACK;
