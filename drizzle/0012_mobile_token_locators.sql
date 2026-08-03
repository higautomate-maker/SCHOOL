-- Stage 9 Batch 1: SQLite global opaque-token locator parity.

CREATE TABLE `mobile_token_locators` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `token_kind` text NOT NULL,
  `tenant_id` text NOT NULL,
  `session_id` text NOT NULL,
  `user_id` text NOT NULL,
  `refresh_family_id` text NOT NULL,
  `rotation` integer NOT NULL,
  `state` text DEFAULT 'active' NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `used_at` text,
  `revoked_at` text,
  `revoke_reason` text,

  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`tenant_id`, `session_id`)
    REFERENCES `mobile_sessions`(`tenant_id`, `id`)
    ON DELETE cascade,

  CHECK (`token_kind` IN ('access', 'refresh')),
  CHECK (`state` IN ('active', 'used', 'revoked', 'expired')),
  CHECK (`rotation` >= 0),
  CHECK (
    (`state` = 'used' AND `token_kind` = 'refresh' AND `used_at` IS NOT NULL)
    OR (`state` = 'revoked' AND `revoked_at` IS NOT NULL)
    OR `state` IN ('active', 'expired')
  )
);

--> statement-breakpoint
CREATE INDEX `mobile_token_locators_session_idx`
  ON `mobile_token_locators` (`session_id`, `state`);
--> statement-breakpoint
CREATE INDEX `mobile_token_locators_user_idx`
  ON `mobile_token_locators` (`user_id`, `state`);
--> statement-breakpoint
CREATE INDEX `mobile_token_locators_family_idx`
  ON `mobile_token_locators` (`refresh_family_id`, `state`);
--> statement-breakpoint
CREATE INDEX `mobile_token_locators_expiry_idx`
  ON `mobile_token_locators` (`expires_at`, `state`);

--> statement-breakpoint
CREATE TRIGGER `mobile_sessions_locator_insert`
AFTER INSERT ON `mobile_sessions`
BEGIN
  INSERT INTO `mobile_token_locators` (
    `token_hash`, `token_kind`, `tenant_id`, `session_id`, `user_id`,
    `refresh_family_id`, `rotation`, `state`, `expires_at`,
    `created_at`, `updated_at`
  ) VALUES
    (
      NEW.`access_token_hash`, 'access', NEW.`tenant_id`, NEW.`id`, NEW.`user_id`,
      NEW.`refresh_family_id`, NEW.`refresh_rotation`, 'active',
      NEW.`access_expires_at`, NEW.`issued_at`, NEW.`issued_at`
    ),
    (
      NEW.`refresh_token_hash`, 'refresh', NEW.`tenant_id`, NEW.`id`, NEW.`user_id`,
      NEW.`refresh_family_id`, NEW.`refresh_rotation`, 'active',
      NEW.`refresh_expires_at`, NEW.`issued_at`, NEW.`issued_at`
    );

  INSERT INTO `audit_events` (
    `id`, `tenant_id`, `actor_id`, `action`, `resource_type`, `resource_id`,
    `reason`, `ip_hash`, `metadata_json`, `occurred_at`
  ) VALUES (
    lower(hex(randomblob(16))), NEW.`tenant_id`, NEW.`user_id`,
    'mobile.auth.login.success', 'authentication', NEW.`id`, 'success',
    NEW.`ip_hash`,
    json_object(
      'principalType', NEW.`principal_type`,
      'deviceIdHash', NEW.`device_id_hash`,
      'devicePlatform', NEW.`device_platform`,
      'appVersion', NEW.`app_version`,
      'userAgentHash', NEW.`user_agent_hash`
    ),
    NEW.`issued_at`
  );
END;

--> statement-breakpoint
CREATE TRIGGER `mobile_sessions_validate_locator_rotation`
BEFORE UPDATE OF
  `access_token_hash`,
  `refresh_token_hash`,
  `refresh_rotation`,
  `refresh_family_id`
ON `mobile_sessions`
WHEN
  (
    OLD.`access_token_hash` <> NEW.`access_token_hash`
    AND OLD.`refresh_token_hash` = NEW.`refresh_token_hash`
  )
  OR (
    OLD.`access_token_hash` = NEW.`access_token_hash`
    AND OLD.`refresh_token_hash` <> NEW.`refresh_token_hash`
  )
  OR (
    OLD.`refresh_token_hash` = NEW.`refresh_token_hash`
    AND (
      OLD.`refresh_rotation` <> NEW.`refresh_rotation`
      OR OLD.`refresh_family_id` <> NEW.`refresh_family_id`
    )
  )
  OR (
    OLD.`access_token_hash` <> NEW.`access_token_hash`
    AND OLD.`refresh_token_hash` <> NEW.`refresh_token_hash`
    AND (
      NEW.`refresh_rotation` <> OLD.`refresh_rotation` + 1
      OR NEW.`refresh_family_id` <> OLD.`refresh_family_id`
    )
  )
BEGIN
  SELECT RAISE(
    ABORT,
    'Mobile access and refresh rotation must remain atomic'
  );
END;

--> statement-breakpoint
CREATE TRIGGER `mobile_sessions_locator_rotation`
AFTER UPDATE OF `access_token_hash`, `refresh_token_hash`
ON `mobile_sessions`
WHEN OLD.`refresh_token_hash` <> NEW.`refresh_token_hash`
BEGIN
  UPDATE `mobile_token_locators`
     SET `state` = 'revoked',
         `revoked_at` = COALESCE(`revoked_at`, NEW.`last_seen_at`),
         `revoke_reason` = COALESCE(`revoke_reason`, 'rotated'),
         `updated_at` = NEW.`last_seen_at`
   WHERE `token_hash` = OLD.`access_token_hash`
     AND `token_kind` = 'access'
     AND `state` = 'active';

  UPDATE `mobile_token_locators`
     SET `state` = 'used',
         `used_at` = COALESCE(`used_at`, NEW.`last_seen_at`),
         `updated_at` = NEW.`last_seen_at`
   WHERE `token_hash` = OLD.`refresh_token_hash`
     AND `token_kind` = 'refresh'
     AND `state` = 'active';

  INSERT INTO `mobile_token_locators` (
    `token_hash`, `token_kind`, `tenant_id`, `session_id`, `user_id`,
    `refresh_family_id`, `rotation`, `state`, `expires_at`,
    `created_at`, `updated_at`
  ) VALUES
    (
      NEW.`access_token_hash`, 'access', NEW.`tenant_id`, NEW.`id`, NEW.`user_id`,
      NEW.`refresh_family_id`, NEW.`refresh_rotation`, 'active',
      NEW.`access_expires_at`, NEW.`last_seen_at`, NEW.`last_seen_at`
    ),
    (
      NEW.`refresh_token_hash`, 'refresh', NEW.`tenant_id`, NEW.`id`, NEW.`user_id`,
      NEW.`refresh_family_id`, NEW.`refresh_rotation`, 'active',
      NEW.`refresh_expires_at`, NEW.`last_seen_at`, NEW.`last_seen_at`
    );

  INSERT INTO `audit_events` (
    `id`, `tenant_id`, `actor_id`, `action`, `resource_type`, `resource_id`,
    `reason`, `ip_hash`, `metadata_json`, `occurred_at`
  ) VALUES (
    lower(hex(randomblob(16))), NEW.`tenant_id`, NEW.`user_id`,
    'mobile.auth.refresh.success', 'authentication', NEW.`id`, 'success',
    NEW.`ip_hash`,
    json_object(
      'principalType', NEW.`principal_type`,
      'rotation', NEW.`refresh_rotation`,
      'deviceIdHash', NEW.`device_id_hash`,
      'devicePlatform', NEW.`device_platform`,
      'appVersion', NEW.`app_version`,
      'userAgentHash', NEW.`user_agent_hash`
    ),
    NEW.`last_seen_at`
  );
END;

--> statement-breakpoint
CREATE TRIGGER `mobile_sessions_locator_revoke`
AFTER UPDATE OF `revoked_at`, `revoke_reason`
ON `mobile_sessions`
WHEN OLD.`revoked_at` IS NULL AND NEW.`revoked_at` IS NOT NULL
BEGIN
  UPDATE `mobile_token_locators`
     SET `state` = 'revoked',
         `revoked_at` = COALESCE(`revoked_at`, NEW.`revoked_at`),
         `revoke_reason` = COALESCE(`revoke_reason`, NEW.`revoke_reason`, 'revoked'),
         `updated_at` = NEW.`revoked_at`
   WHERE `session_id` = NEW.`id`
     AND `state` = 'active';

  INSERT INTO `audit_events` (
    `id`, `tenant_id`, `actor_id`, `action`, `resource_type`, `resource_id`,
    `reason`, `ip_hash`, `metadata_json`, `occurred_at`
  ) VALUES (
    lower(hex(randomblob(16))), NEW.`tenant_id`, NEW.`user_id`,
    CASE
      WHEN NEW.`revoke_reason` = 'logout' THEN 'mobile.auth.logout'
      ELSE 'mobile.auth.session.revoked'
    END,
    'authentication', NEW.`id`, 'success', NEW.`ip_hash`,
    json_object(
      'principalType', NEW.`principal_type`,
      'revokeReason', COALESCE(NEW.`revoke_reason`, 'revoked'),
      'deviceIdHash', NEW.`device_id_hash`,
      'devicePlatform', NEW.`device_platform`,
      'appVersion', NEW.`app_version`,
      'userAgentHash', NEW.`user_agent_hash`
    ),
    NEW.`revoked_at`
  );
END;
