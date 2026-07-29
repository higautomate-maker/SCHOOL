CREATE TABLE `academic_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_sessions_tenant_name_uq` ON `academic_sessions` (`tenant_id`,`name`);--> statement-breakpoint
CREATE INDEX `academic_sessions_tenant_status_idx` ON `academic_sessions` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `class_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`class_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer DEFAULT 40 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`class_id`) REFERENCES `school_classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_sections_class_name_uq` ON `class_sections` (`class_id`,`name`);--> statement-breakpoint
CREATE INDEX `class_sections_tenant_idx` ON `class_sections` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `school_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_classes_tenant_code_uq` ON `school_classes` (`tenant_id`,`code`);--> statement-breakpoint
CREATE INDEX `school_classes_tenant_order_idx` ON `school_classes` (`tenant_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `school_settings` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`short_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`principal_name` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`currency_code` text DEFAULT 'INR' NOT NULL,
	`admission_prefix` text DEFAULT 'HIG' NOT NULL,
	`receipt_prefix` text DEFAULT 'RCPT' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`type` text DEFAULT 'core' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_tenant_code_uq` ON `subjects` (`tenant_id`,`code`);--> statement-breakpoint
CREATE INDEX `subjects_tenant_idx` ON `subjects` (`tenant_id`);--> statement-breakpoint
ALTER TABLE `students` ADD `academic_session_id` text REFERENCES academic_sessions(id);--> statement-breakpoint
CREATE INDEX `students_session_idx` ON `students` (`academic_session_id`);