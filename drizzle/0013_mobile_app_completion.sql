-- Stage 9 mobile application completion SQLite parity.

CREATE TABLE `mobile_device_registrations` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `user_id` text NOT NULL,
  `mobile_identity_id` text,
  `session_id` text NOT NULL,
  `platform` text NOT NULL,
  `provider` text NOT NULL,
  `token_hash` text NOT NULL,
  `token_ciphertext` text NOT NULL,
  `app_id` text NOT NULL,
  `app_version` text,
  `status` text DEFAULT 'active' NOT NULL,
  `last_seen_at` text NOT NULL,
  `revoked_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  FOREIGN KEY (`tenant_id`, `mobile_identity_id`) REFERENCES `mobile_identities`(`tenant_id`, `id`) ON DELETE cascade,
  FOREIGN KEY (`tenant_id`, `session_id`) REFERENCES `mobile_sessions`(`tenant_id`, `id`) ON DELETE cascade,
  CHECK (`platform` IN ('android', 'ios')),
  CHECK (`provider` IN ('firebase', 'apns')),
  CHECK (`status` IN ('active', 'revoked')),
  CHECK ((`status` = 'active' AND `revoked_at` IS NULL) OR (`status` = 'revoked' AND `revoked_at` IS NOT NULL))
);

--> statement-breakpoint
CREATE TRIGGER `mobile_sessions_revoke_device_registrations`
AFTER UPDATE OF `revoked_at` ON `mobile_sessions`
WHEN OLD.`revoked_at` IS NULL AND NEW.`revoked_at` IS NOT NULL
BEGIN
  UPDATE `mobile_device_registrations`
     SET `status` = 'revoked',
         `revoked_at` = COALESCE(`revoked_at`, NEW.`revoked_at`),
         `updated_at` = NEW.`revoked_at`
   WHERE `tenant_id` = NEW.`tenant_id`
     AND `session_id` = NEW.`id`
     AND `status` = 'active';
END;

--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_device_registrations_token_uq`
  ON `mobile_device_registrations` (`tenant_id`, `token_hash`);
--> statement-breakpoint
CREATE INDEX `mobile_device_registrations_user_idx`
  ON `mobile_device_registrations` (`tenant_id`, `user_id`, `status`);
--> statement-breakpoint
CREATE INDEX `mobile_device_registrations_session_idx`
  ON `mobile_device_registrations` (`tenant_id`, `session_id`, `status`);

--> statement-breakpoint
CREATE UNIQUE INDEX `students_tenant_id_uq`
  ON `students` (`tenant_id`, `id`);

--> statement-breakpoint
CREATE TABLE `mobile_transport_events` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `mobile_identity_id` text NOT NULL,
  `session_id` text NOT NULL,
  `trip_id` text,
  `student_id` text,
  `event_type` text NOT NULL,
  `latitude` real,
  `longitude` real,
  `accuracy_meters` real,
  `speed_kph` real,
  `heading_degrees` real,
  `captured_at` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade,
  FOREIGN KEY (`tenant_id`, `mobile_identity_id`) REFERENCES `mobile_identities`(`tenant_id`, `id`) ON DELETE cascade,
  FOREIGN KEY (`tenant_id`, `session_id`) REFERENCES `mobile_sessions`(`tenant_id`, `id`) ON DELETE cascade,
  FOREIGN KEY (`tenant_id`, `student_id`) REFERENCES `students`(`tenant_id`, `id`) ON DELETE SET NULL,
  CHECK (`event_type` IN ('trip_started', 'trip_paused', 'trip_completed', 'location', 'student_boarded', 'student_dropped', 'sos')),
  CHECK ((`latitude` IS NULL OR `latitude` BETWEEN -90 AND 90)
    AND (`longitude` IS NULL OR `longitude` BETWEEN -180 AND 180)
    AND (`accuracy_meters` IS NULL OR `accuracy_meters` BETWEEN 0 AND 10000)
    AND (`speed_kph` IS NULL OR `speed_kph` BETWEEN 0 AND 400)
    AND (`heading_degrees` IS NULL OR `heading_degrees` BETWEEN 0 AND 360)
    AND (`event_type` <> 'location' OR (`latitude` IS NOT NULL AND `longitude` IS NOT NULL))),
  CHECK (`event_type` NOT IN ('student_boarded', 'student_dropped') OR `student_id` IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_transport_events_idempotency_uq`
  ON `mobile_transport_events` (`tenant_id`, `mobile_identity_id`, `idempotency_key`);
--> statement-breakpoint
CREATE INDEX `mobile_transport_events_trip_idx`
  ON `mobile_transport_events` (`tenant_id`, `trip_id`, `captured_at` DESC);
--> statement-breakpoint
CREATE INDEX `mobile_transport_events_identity_idx`
  ON `mobile_transport_events` (`tenant_id`, `mobile_identity_id`, `captured_at` DESC);
