CREATE TABLE `admin_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`author_type` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
