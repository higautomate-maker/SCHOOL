CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`role_id`, `permission`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `role_permissions_permission_idx` ON `role_permissions` (`permission`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`system` integer DEFAULT false NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_tenant_key_uq` ON `roles` (`tenant_id`,`key`);--> statement-breakpoint
CREATE INDEX `roles_tenant_idx` ON `roles` (`tenant_id`);