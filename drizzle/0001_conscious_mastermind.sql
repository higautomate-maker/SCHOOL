CREATE TABLE `idempotency_records` (
	`key` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`operation` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idempotency_expiry_idx` ON `idempotency_records` (`expires_at`);--> statement-breakpoint
CREATE TABLE `school_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`email` text NOT NULL,
	`role_key` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` text NOT NULL,
	`invited_by` text NOT NULL,
	`accepted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_invitations_tenant_email_uq` ON `school_invitations` (`tenant_id`,`email`);--> statement-breakpoint
CREATE INDEX `school_invitations_status_idx` ON `school_invitations` (`status`,`expires_at`);