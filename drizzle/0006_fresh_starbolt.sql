CREATE TABLE `module_records` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`academic_session_id` text,
	`module_key` text NOT NULL,
	`workflow` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`record_date` text NOT NULL,
	`due_date` text,
	`amount_paise` integer,
	`assignee` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_session_id`) REFERENCES `academic_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `module_records_tenant_module_idx` ON `module_records` (`tenant_id`,`module_key`,`status`);--> statement-breakpoint
CREATE INDEX `module_records_session_idx` ON `module_records` (`academic_session_id`);--> statement-breakpoint
CREATE INDEX `module_records_due_idx` ON `module_records` (`due_date`,`status`);