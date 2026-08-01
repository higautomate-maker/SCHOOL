ALTER TABLE `memberships` ADD `status` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `memberships` ADD `updated_at` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;
--> statement-breakpoint
DROP INDEX `users_email_uq`;
CREATE UNIQUE INDEX `users_email_uq` ON `users` (lower(`email`));
--> statement-breakpoint
CREATE TABLE `auth_credentials` (`user_id` text PRIMARY KEY NOT NULL,`password_hash` text NOT NULL,`credential_version` integer DEFAULT 1 NOT NULL,`must_change_password` integer DEFAULT false NOT NULL,`password_changed_at` text NOT NULL,`disabled_at` text,`created_at` text NOT NULL,`updated_at` text NOT NULL,FOREIGN KEY (`user_id`) REFERENCES `users`(`id`));
--> statement-breakpoint
CREATE TABLE `auth_sessions` (`id` text PRIMARY KEY NOT NULL,`token_hash` text NOT NULL,`user_id` text NOT NULL,`active_tenant_id` text,`credential_version` integer NOT NULL,`csrf_hash` text NOT NULL,`issued_at` text NOT NULL,`last_seen_at` text NOT NULL,`idle_expires_at` text NOT NULL,`absolute_expires_at` text NOT NULL,`revoked_at` text,`revoke_reason` text,`ip_hash` text,`user_agent_hash` text,FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),FOREIGN KEY (`active_tenant_id`) REFERENCES `tenants`(`id`));
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_uq` ON `auth_sessions` (`token_hash`);
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`idle_expires_at`,`absolute_expires_at`);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (`id` text PRIMARY KEY NOT NULL,`user_id` text NOT NULL,`token_hash` text NOT NULL,`expires_at` text NOT NULL,`consumed_at` text,`requested_at` text NOT NULL,`ip_hash` text,FOREIGN KEY (`user_id`) REFERENCES `users`(`id`));
CREATE UNIQUE INDEX `password_reset_token_hash_uq` ON `password_reset_tokens` (`token_hash`);
CREATE INDEX `password_reset_expiry_idx` ON `password_reset_tokens` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `platform_role_assignments` (`user_id` text NOT NULL,`role_key` text NOT NULL,`created_at` text NOT NULL,PRIMARY KEY(`user_id`,`role_key`),FOREIGN KEY (`user_id`) REFERENCES `users`(`id`));
CREATE INDEX `school_invitations_token_hash_idx` ON `school_invitations` (`token_hash`);
