CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`mission_id` text,
	`agent_instance_id` text,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`interval_minutes` integer NOT NULL,
	`next_run_at` text NOT NULL,
	`last_run_at` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
