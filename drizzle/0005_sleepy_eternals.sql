CREATE TABLE `fee_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`academic_session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`fee_type` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`paid_paise` integer DEFAULT 0 NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'due' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_session_id`) REFERENCES `academic_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fee_invoices_tenant_session_idx` ON `fee_invoices` (`tenant_id`,`academic_session_id`);--> statement-breakpoint
CREATE INDEX `fee_invoices_student_idx` ON `fee_invoices` (`student_id`);--> statement-breakpoint
CREATE INDEX `fee_invoices_due_idx` ON `fee_invoices` (`due_date`,`status`);--> statement-breakpoint
CREATE TABLE `fee_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`student_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`paid_on` text NOT NULL,
	`received_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `fee_invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`received_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fee_payments_invoice_idx` ON `fee_payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `fee_payments_tenant_date_idx` ON `fee_payments` (`tenant_id`,`paid_on`);--> statement-breakpoint
CREATE TABLE `student_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`academic_session_id` text NOT NULL,
	`student_id` text NOT NULL,
	`attendance_date` text NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`marked_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`academic_session_id`) REFERENCES `academic_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_student_date_uq` ON `student_attendance` (`student_id`,`attendance_date`);--> statement-breakpoint
CREATE INDEX `attendance_tenant_session_date_idx` ON `student_attendance` (`tenant_id`,`academic_session_id`,`attendance_date`);