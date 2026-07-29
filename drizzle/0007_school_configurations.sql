CREATE TABLE `school_configurations` (
	`tenant_id` text NOT NULL,
	`config_key` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `config_key`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
