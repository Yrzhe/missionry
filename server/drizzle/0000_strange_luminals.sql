CREATE TABLE `agent_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`role` text NOT NULL,
	`display_alias` text,
	`work_state_json` text NOT NULL,
	`isolation_json` text NOT NULL,
	`equipped_skill_overrides_json` text NOT NULL,
	`r2_prefix` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_json` text NOT NULL,
	`global_identity_json` text NOT NULL,
	`equipped_skill_ids_json` text NOT NULL,
	`r2_prefix` text NOT NULL,
	`audit_head_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_slug_unique` ON `agents` (`slug`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`mission_id` text,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`actor_json` text NOT NULL,
	`action` text NOT NULL,
	`client_action_id` text,
	`diff_summary` text NOT NULL,
	`payload_ref_json` text,
	`reversible` integer DEFAULT 0 NOT NULL,
	`rollback_available` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_event_id_unique` ON `audit_events` (`event_id`);--> statement-breakpoint
CREATE TABLE `budget_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`daily_budget_cents` integer NOT NULL,
	`global_cap_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`reset_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `direct_thread_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`mission_id` text NOT NULL,
	`agent_instance_id` text NOT NULL,
	`sender_type` text NOT NULL,
	`sender_id` text NOT NULL,
	`body` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `direct_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`agent_instance_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `growth_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`rationale` text NOT NULL,
	`evidence_event_ids_json` text NOT NULL,
	`source_mission_ids_json` text NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`estimated_future_cost_hint` text,
	`created_at` text NOT NULL,
	`enabled_at` text,
	`enabled_by` text
);
--> statement-breakpoint
CREATE TABLE `mission_spend` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`client_action_id` text,
	`agent_id` text,
	`instance_id` text,
	`model` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`cost_cents` integer NOT NULL,
	`sandbox_id` text,
	`sandbox_seconds` real,
	`event_type` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `missions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`objective` text NOT NULL,
	`status` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_user_id` text,
	`owner_agent_id` text,
	`owner_instance_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`state_json` text NOT NULL,
	`mission_spend_cents` integer DEFAULT 0 NOT NULL,
	`llm_spend_cents` integer DEFAULT 0 NOT NULL,
	`sandbox_spend_cents` integer DEFAULT 0 NOT NULL,
	`burn_rate_cents_per_minute` real DEFAULT 0 NOT NULL,
	`daily_budget_cents` integer DEFAULT 500 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sandbox_runtime` (
	`sandbox_id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`instance_id` text,
	`tier` text NOT NULL,
	`state` text NOT NULL,
	`e2b_sandbox_id` text,
	`last_activity_at` text,
	`active_since` text,
	`burn_rate_cents_per_minute` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`daily_budget_cents` integer DEFAULT 2000 NOT NULL,
	`daily_spend_cents` integer DEFAULT 0 NOT NULL,
	`daily_window_start_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_profile_email_unique` ON `users_profile` (`email`);--> statement-breakpoint
CREATE TABLE `whitelist_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_whitelist_entries_type_value` ON `whitelist_entries` (`type`,`value`);--> statement-breakpoint
CREATE TABLE `work_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`pm_instance_id` text,
	`assignee_instance_id` text,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`sandbox_affinity_json` text NOT NULL,
	`dependencies_json` text NOT NULL,
	`issue_ids_json` text NOT NULL,
	`cost_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
