CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`reason` text,
	`ip_hash` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_tenant_time_idx` ON `audit_events` (`tenant_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_actor_time_idx` ON `audit_events` (`actor_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `campuses` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`city` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campuses_tenant_code_uq` ON `campuses` (`tenant_id`,`code`);--> statement-breakpoint
CREATE INDEX `campuses_tenant_idx` ON `campuses` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_key` text NOT NULL,
	`campus_id` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `user_id`, `role_key`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `module_policies` (
	`tenant_id` text NOT NULL,
	`module_key` text NOT NULL,
	`enabled` integer NOT NULL,
	`source` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `module_key`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`monthly_price_paise` integer NOT NULL,
	`annual_price_paise` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text NOT NULL,
	`period_ends_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscriptions_tenant_idx` ON `subscriptions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_idx` ON `subscriptions` (`status`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text NOT NULL,
	`country_code` text DEFAULT 'IN' NOT NULL,
	`custom_domain` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_uq` ON `tenants` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_domain_uq` ON `tenants` (`custom_domain`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`status` text NOT NULL,
	`mfa_enabled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);