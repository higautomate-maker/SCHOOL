-- Stage 9 Batch 1: atomic SQLite refresh-token rotation evidence.
--
-- The AFTER UPDATE trigger stores the consumed refresh-token hash in the
-- same SQLite statement that installs its replacement. Raw tokens are never
-- stored. Replay handling is performed by the mobile-auth repository.

CREATE TRIGGER `mobile_sessions_validate_refresh_rotation`
BEFORE UPDATE OF
  `refresh_token_hash`,
  `refresh_rotation`,
  `refresh_family_id`
ON `mobile_sessions`
WHEN OLD.`refresh_token_hash` <> NEW.`refresh_token_hash`
BEGIN
  SELECT CASE
    WHEN NEW.`refresh_rotation` <> OLD.`refresh_rotation` + 1
      OR NEW.`refresh_family_id` <> OLD.`refresh_family_id`
    THEN RAISE(
      ABORT,
      'Invalid mobile refresh-token rotation'
    )
  END;
END;

--> statement-breakpoint

CREATE TRIGGER `mobile_sessions_record_refresh_use`
AFTER UPDATE OF `refresh_token_hash`
ON `mobile_sessions`
WHEN OLD.`refresh_token_hash` <> NEW.`refresh_token_hash`
BEGIN
  INSERT INTO `mobile_refresh_token_uses` (
    `id`,
    `tenant_id`,
    `session_id`,
    `refresh_family_id`,
    `token_hash`,
    `rotation`,
    `used_at`,
    `device_id_hash`,
    `ip_hash`
  )
  VALUES (
    OLD.`id` || ':rotation:' || OLD.`refresh_rotation`,
    OLD.`tenant_id`,
    OLD.`id`,
    OLD.`refresh_family_id`,
    OLD.`refresh_token_hash`,
    OLD.`refresh_rotation`,
    NEW.`last_seen_at`,
    NEW.`device_id_hash`,
    NEW.`ip_hash`
  );
END;
