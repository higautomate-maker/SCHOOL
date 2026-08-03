-- Stage 9 Batch 1: SQLite parity for production mobile identity sessions.
--
-- IDs and normalized ISO-8601 timestamps are supplied by the runtime.
-- This migration does not provision users, identities, assignments, or sessions.

CREATE TABLE `mobile_identities` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `user_id` text NOT NULL,
  `audience` text NOT NULL,
  `status` text DEFAULT 'invited' NOT NULL,
  `revoked_at` text,
  `revoked_reason` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,

  UNIQUE(`tenant_id`, `id`),
  UNIQUE(`tenant_id`, `user_id`, `audience`),

  FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants`(`id`)
    ON UPDATE no action
    ON DELETE no action,

  FOREIGN KEY (`user_id`)
    REFERENCES `users`(`id`)
    ON UPDATE no action
    ON DELETE no action,

  CHECK (`audience` IN ('parent', 'student', 'transporter')),

  CHECK (
    `status` IN ('invited', 'active', 'suspended', 'revoked')
  ),

  CHECK (
    (`status` = 'revoked' AND `revoked_at` IS NOT NULL)
    OR `status` <> 'revoked'
  )
);

--> statement-breakpoint

CREATE INDEX `mobile_identities_tenant_audience_status_idx`
  ON `mobile_identities` (
    `tenant_id`,
    `audience`,
    `status`
  );

--> statement-breakpoint

CREATE INDEX `mobile_identities_user_status_idx`
  ON `mobile_identities` (
    `user_id`,
    `status`
  );

--> statement-breakpoint

CREATE TABLE `mobile_identity_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `mobile_identity_id` text NOT NULL,
  `resource_type` text NOT NULL,
  `resource_id` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `revoked_at` text,
  `revoked_reason` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,

  UNIQUE(`tenant_id`, `id`),

  UNIQUE(
    `tenant_id`,
    `mobile_identity_id`,
    `resource_type`,
    `resource_id`
  ),

  FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants`(`id`)
    ON UPDATE no action
    ON DELETE no action,

  FOREIGN KEY (`tenant_id`, `mobile_identity_id`)
    REFERENCES `mobile_identities`(`tenant_id`, `id`)
    ON UPDATE no action
    ON DELETE cascade,

  CHECK (
    `resource_type` IN ('student', 'vehicle', 'route', 'trip')
  ),

  CHECK (
    `status` IN ('active', 'suspended', 'revoked')
  ),

  CHECK (
    (`status` = 'revoked' AND `revoked_at` IS NOT NULL)
    OR `status` <> 'revoked'
  )
);

--> statement-breakpoint

CREATE INDEX `mobile_identity_assignments_lookup_idx`
  ON `mobile_identity_assignments` (
    `tenant_id`,
    `mobile_identity_id`,
    `resource_type`,
    `status`
  );

--> statement-breakpoint

CREATE TABLE `mobile_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `user_id` text NOT NULL,
  `mobile_identity_id` text,
  `principal_type` text NOT NULL,

  `access_token_hash` text NOT NULL,
  `refresh_token_hash` text NOT NULL,
  `refresh_family_id` text NOT NULL,
  `refresh_rotation` integer DEFAULT 0 NOT NULL,
  `credential_version` integer NOT NULL,

  `issued_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `access_expires_at` text NOT NULL,
  `refresh_expires_at` text NOT NULL,

  `revoked_at` text,
  `revoke_reason` text,

  `device_id_hash` text,
  `device_platform` text,
  `app_version` text,
  `ip_hash` text,
  `user_agent_hash` text,

  UNIQUE(`tenant_id`, `id`),

  FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants`(`id`)
    ON UPDATE no action
    ON DELETE no action,

  FOREIGN KEY (`user_id`)
    REFERENCES `users`(`id`)
    ON UPDATE no action
    ON DELETE no action,

  FOREIGN KEY (`tenant_id`, `mobile_identity_id`)
    REFERENCES `mobile_identities`(`tenant_id`, `id`)
    ON UPDATE no action
    ON DELETE no action,

  CHECK (
    `principal_type` IN (
      'school',
      'parent',
      'student',
      'transporter'
    )
  ),

  CHECK (
    (
      `principal_type` = 'school'
      AND `mobile_identity_id` IS NULL
    )
    OR
    (
      `principal_type` <> 'school'
      AND `mobile_identity_id` IS NOT NULL
    )
  ),

  CHECK (`refresh_rotation` >= 0),

  CHECK (
    `issued_at` < `access_expires_at`
    AND `access_expires_at` <= `refresh_expires_at`
  )
);

--> statement-breakpoint

CREATE UNIQUE INDEX `mobile_sessions_access_token_hash_uq`
  ON `mobile_sessions` (`access_token_hash`);

--> statement-breakpoint

CREATE UNIQUE INDEX `mobile_sessions_refresh_token_hash_uq`
  ON `mobile_sessions` (`refresh_token_hash`);

--> statement-breakpoint

CREATE INDEX `mobile_sessions_user_active_idx`
  ON `mobile_sessions` (
    `user_id`,
    `tenant_id`,
    `revoked_at`,
    `refresh_expires_at`
  );

--> statement-breakpoint

CREATE INDEX `mobile_sessions_family_active_idx`
  ON `mobile_sessions` (
    `refresh_family_id`,
    `revoked_at`
  );

--> statement-breakpoint

CREATE INDEX `mobile_sessions_identity_active_idx`
  ON `mobile_sessions` (
    `tenant_id`,
    `mobile_identity_id`,
    `revoked_at`
  );

--> statement-breakpoint

CREATE TABLE `mobile_refresh_token_uses` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `session_id` text NOT NULL,
  `refresh_family_id` text NOT NULL,
  `token_hash` text NOT NULL,
  `rotation` integer NOT NULL,
  `used_at` text NOT NULL,
  `replay_detected_at` text,
  `device_id_hash` text,
  `ip_hash` text,

  FOREIGN KEY (`tenant_id`)
    REFERENCES `tenants`(`id`)
    ON UPDATE no action
    ON DELETE no action,

  FOREIGN KEY (`tenant_id`, `session_id`)
    REFERENCES `mobile_sessions`(`tenant_id`, `id`)
    ON UPDATE no action
    ON DELETE cascade,

  UNIQUE(`token_hash`),
  UNIQUE(`session_id`, `rotation`),

  CHECK (`rotation` >= 0)
);

--> statement-breakpoint

CREATE INDEX `mobile_refresh_token_uses_family_idx`
  ON `mobile_refresh_token_uses` (
    `refresh_family_id`,
    `used_at`
  );

--> statement-breakpoint

CREATE INDEX `mobile_refresh_token_uses_session_idx`
  ON `mobile_refresh_token_uses` (
    `tenant_id`,
    `session_id`,
    `used_at`
  );

--> statement-breakpoint

-- Parent and Student relationships require a Student in the same tenant.
-- Transport resources remain fail-closed until their operational tables exist.

CREATE TRIGGER `mobile_identity_assignments_validate_insert`
BEFORE INSERT ON `mobile_identity_assignments`
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
    )
    THEN RAISE(ABORT, 'Mobile identity is unavailable')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
         AND `audience` IN ('parent', 'student')
    )
    AND NEW.`resource_type` <> 'student'
    THEN RAISE(
      ABORT,
      'Parent and Student identities require a Student assignment'
    )
  END;

  SELECT CASE
    WHEN NEW.`resource_type` = 'student'
    AND NOT EXISTS (
      SELECT 1
        FROM `students`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`resource_id`
    )
    THEN RAISE(
      ABORT,
      'Assigned Student is unavailable in this tenant'
    )
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
         AND `audience` = 'transporter'
    )
    AND NEW.`resource_type` <> 'student'
    THEN RAISE(
      ABORT,
      'Transport resource assignment is not enabled yet'
    )
  END;
END;

--> statement-breakpoint

CREATE TRIGGER `mobile_identity_assignments_validate_update`
BEFORE UPDATE OF
  `tenant_id`,
  `mobile_identity_id`,
  `resource_type`,
  `resource_id`
ON `mobile_identity_assignments`
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
    )
    THEN RAISE(ABORT, 'Mobile identity is unavailable')
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
         AND `audience` IN ('parent', 'student')
    )
    AND NEW.`resource_type` <> 'student'
    THEN RAISE(
      ABORT,
      'Parent and Student identities require a Student assignment'
    )
  END;

  SELECT CASE
    WHEN NEW.`resource_type` = 'student'
    AND NOT EXISTS (
      SELECT 1
        FROM `students`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`resource_id`
    )
    THEN RAISE(
      ABORT,
      'Assigned Student is unavailable in this tenant'
    )
  END;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
         AND `audience` = 'transporter'
    )
    AND NEW.`resource_type` <> 'student'
    THEN RAISE(
      ABORT,
      'Transport resource assignment is not enabled yet'
    )
  END;
END;

--> statement-breakpoint

CREATE TRIGGER `mobile_sessions_validate_insert`
BEFORE INSERT ON `mobile_sessions`
BEGIN
  SELECT CASE
    WHEN NEW.`principal_type` = 'school'
    AND NOT EXISTS (
      SELECT 1
        FROM `memberships`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `user_id` = NEW.`user_id`
         AND `status` = 'active'
    )
    THEN RAISE(
      ABORT,
      'Active School membership is required'
    )
  END;

  SELECT CASE
    WHEN NEW.`principal_type` <> 'school'
    AND NOT EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
         AND `user_id` = NEW.`user_id`
         AND `status` = 'active'
    )
    THEN RAISE(
      ABORT,
      'Active mobile relationship is required'
    )
  END;

  SELECT CASE
    WHEN NEW.`principal_type` <> 'school'
    AND NOT EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
         AND `user_id` = NEW.`user_id`
         AND `status` = 'active'
         AND `audience` = NEW.`principal_type`
    )
    THEN RAISE(
      ABORT,
      'Mobile principal does not match the relationship'
    )
  END;
END;

--> statement-breakpoint

CREATE TRIGGER `mobile_sessions_validate_update`
BEFORE UPDATE OF
  `tenant_id`,
  `user_id`,
  `mobile_identity_id`,
  `principal_type`
ON `mobile_sessions`
BEGIN
  SELECT CASE
    WHEN NEW.`principal_type` = 'school'
    AND NOT EXISTS (
      SELECT 1
        FROM `memberships`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `user_id` = NEW.`user_id`
         AND `status` = 'active'
    )
    THEN RAISE(
      ABORT,
      'Active School membership is required'
    )
  END;

  SELECT CASE
    WHEN NEW.`principal_type` <> 'school'
    AND NOT EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
         AND `user_id` = NEW.`user_id`
         AND `status` = 'active'
    )
    THEN RAISE(
      ABORT,
      'Active mobile relationship is required'
    )
  END;

  SELECT CASE
    WHEN NEW.`principal_type` <> 'school'
    AND NOT EXISTS (
      SELECT 1
        FROM `mobile_identities`
       WHERE `tenant_id` = NEW.`tenant_id`
         AND `id` = NEW.`mobile_identity_id`
         AND `user_id` = NEW.`user_id`
         AND `status` = 'active'
         AND `audience` = NEW.`principal_type`
    )
    THEN RAISE(
      ABORT,
      'Mobile principal does not match the relationship'
    )
  END;
END;
