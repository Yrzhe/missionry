CREATE TABLE `agent_response_cursors` (
	`mission_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`last_responded_message_id` text,
	`last_responded_at` text,
	PRIMARY KEY(`mission_id`, `instance_id`)
);
--> statement-breakpoint
CREATE TABLE `mission_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`author_type` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`mentions_json` text NOT NULL,
	`is_silent` integer DEFAULT 0 NOT NULL,
	`reply_to_message_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mission_leader` (
	`mission_id` text PRIMARY KEY NOT NULL,
	`leader_instance_id` text NOT NULL,
	`promoted_by` text NOT NULL,
	`promoted_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `work_cards` ADD `reviewer_instance_id` text;