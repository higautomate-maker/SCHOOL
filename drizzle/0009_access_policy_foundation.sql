CREATE TABLE `plan_module_policies` (
  `plan_id` text NOT NULL,
  `module_key` text NOT NULL,
  `enabled` integer DEFAULT 0 NOT NULL,
  `configuration` text DEFAULT '{}' NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL,
  PRIMARY KEY(`plan_id`, `module_key`),
  FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_module_policies_enabled_idx`
  ON `plan_module_policies` (`plan_id`, `enabled`);
--> statement-breakpoint
CREATE TABLE `plan_app_feature_policies` (
  `plan_id` text NOT NULL,
  `audience` text NOT NULL,
  `feature_key` text NOT NULL,
  `enabled` integer DEFAULT 0 NOT NULL,
  `configuration` text DEFAULT '{}' NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL,
  PRIMARY KEY(`plan_id`, `audience`, `feature_key`),
  FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CHECK (`audience` IN ('parent', 'student', 'transporter'))
);
--> statement-breakpoint
CREATE INDEX `plan_app_feature_policies_enabled_idx`
  ON `plan_app_feature_policies` (`plan_id`, `audience`, `enabled`);
--> statement-breakpoint
CREATE TABLE `tenant_app_feature_policies` (
  `tenant_id` text NOT NULL,
  `audience` text NOT NULL,
  `feature_key` text NOT NULL,
  `enabled` integer DEFAULT 0 NOT NULL,
  `source` text NOT NULL,
  `configuration` text DEFAULT '{}' NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL,
  PRIMARY KEY(`tenant_id`, `audience`, `feature_key`),
  FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CHECK (`audience` IN ('parent', 'student', 'transporter')),
  CHECK (`source` IN ('plan', 'override'))
);
--> statement-breakpoint
CREATE INDEX `tenant_app_feature_policies_enabled_idx`
  ON `tenant_app_feature_policies` (`tenant_id`, `audience`, `enabled`);
