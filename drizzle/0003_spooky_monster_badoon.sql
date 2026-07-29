CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`campus_id` text NOT NULL,
	`admission_number` text NOT NULL,
	`roll_number` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`gender` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`admission_date` text NOT NULL,
	`class_name` text NOT NULL,
	`section_name` text NOT NULL,
	`guardian_name` text NOT NULL,
	`guardian_phone` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_tenant_admission_uq` ON `students` (`tenant_id`,`admission_number`);--> statement-breakpoint
CREATE INDEX `students_tenant_class_idx` ON `students` (`tenant_id`,`class_name`,`section_name`);--> statement-breakpoint
CREATE INDEX `students_campus_idx` ON `students` (`campus_id`);