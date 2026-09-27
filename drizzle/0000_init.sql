CREATE TABLE `adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text NOT NULL,
	`team_id` text NOT NULL,
	`points` integer NOT NULL,
	`reason` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `adjustments_hunt_idx` ON `adjustments` (`hunt_id`);--> statement-breakpoint
CREATE INDEX `adjustments_team_idx` ON `adjustments` (`team_id`);--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `announcements_hunt_idx` ON `announcements` (`hunt_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`target_kind` text,
	`target_id` text,
	`data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_hunt_idx` ON `audit_log` (`hunt_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_target_idx` ON `audit_log` (`hunt_id`,`target_kind`,`target_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text,
	`owner_kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`ext` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`original_name` text,
	`variants` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `files_owner_idx` ON `files` (`owner_kind`,`owner_id`);--> statement-breakpoint
CREATE INDEX `files_hunt_idx` ON `files` (`hunt_id`);--> statement-breakpoint
CREATE TABLE `hint_unlocks` (
	`hint_id` text NOT NULL,
	`team_id` text NOT NULL,
	`hunt_id` text NOT NULL,
	`player_id` text,
	`cost` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`hint_id`, `team_id`),
	FOREIGN KEY (`hint_id`) REFERENCES `hints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `hint_unlocks_hunt_idx` ON `hint_unlocks` (`hunt_id`);--> statement-breakpoint
CREATE INDEX `hint_unlocks_team_idx` ON `hint_unlocks` (`team_id`);--> statement-breakpoint
CREATE TABLE `hints` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text NOT NULL,
	`task_id` text NOT NULL,
	`body` text NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hints_task_idx` ON `hints` (`task_id`);--> statement-breakpoint
CREATE TABLE `hunt_staff` (
	`hunt_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`hunt_id`, `user_id`),
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hunt_staff_user_idx` ON `hunt_staff` (`user_id`);--> statement-breakpoint
CREATE TABLE `hunts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tagline` text,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`join_code` text NOT NULL,
	`join_mode` text DEFAULT 'code' NOT NULL,
	`team_creation` text DEFAULT 'players' NOT NULL,
	`registration_open` integer DEFAULT true NOT NULL,
	`max_team_size` integer,
	`scoreboard_visibility` text DEFAULT 'players' NOT NULL,
	`freeze_at` integer,
	`gallery_mode` text DEFAULT 'after' NOT NULL,
	`accent` text DEFAULT 'overprint' NOT NULL,
	`cover_file_id` text,
	`feedback_templates` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hunts_slug_uq` ON `hunts` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `hunts_join_code_uq` ON `hunts` (`join_code`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text,
	`role` text DEFAULT 'judge' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invites_hunt_idx` ON `invites` (`hunt_id`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text NOT NULL,
	`team_id` text NOT NULL,
	`session_id` text,
	`name` text NOT NULL,
	`is_captain` integer DEFAULT false NOT NULL,
	`seen_updates_at` integer,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `players_team_idx` ON `players` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_hunt_session_uq` ON `players` (`hunt_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `players_session_idx` ON `players` (`session_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`session_id` text NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_endpoint_uq` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_session_idx` ON `push_subscriptions` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_uq` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text NOT NULL,
	`task_id` text NOT NULL,
	`team_id` text NOT NULL,
	`player_id` text,
	`client_id` text,
	`text` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`points_override` integer,
	`contest_value` real,
	`feedback` text,
	`judged_by` text,
	`judged_at` integer,
	`auto_judged` integer DEFAULT false NOT NULL,
	`claimed_by` text,
	`claimed_at` integer,
	`lat` real,
	`lng` real,
	`accuracy` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`judged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`claimed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `submissions_queue_idx` ON `submissions` (`hunt_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `submissions_hunt_created_idx` ON `submissions` (`hunt_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `submissions_team_task_idx` ON `submissions` (`team_id`,`task_id`);--> statement-breakpoint
CREATE INDEX `submissions_task_idx` ON `submissions` (`task_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_team_client_uq` ON `submissions` (`team_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text NOT NULL,
	`code` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'media' NOT NULL,
	`media_accept` text DEFAULT 'photo' NOT NULL,
	`answers` text NOT NULL,
	`answer_match` text DEFAULT 'loose' NOT NULL,
	`checkpoint_code` text,
	`scoring` text DEFAULT 'fixed' NOT NULL,
	`points` integer DEFAULT 100 NOT NULL,
	`min_points` integer DEFAULT 0 NOT NULL,
	`decay_solves` integer DEFAULT 10 NOT NULL,
	`contest_rank` text DEFAULT 'highest' NOT NULL,
	`contest_places` integer DEFAULT 3 NOT NULL,
	`contest_unit` text,
	`auto_approve` integer DEFAULT false NOT NULL,
	`max_attempts` integer,
	`category` text,
	`unlock_at` integer,
	`lock_at` integer,
	`hidden` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tasks_hunt_idx` ON `tasks` (`hunt_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_hunt_code_uq` ON `tasks` (`hunt_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_hunt_checkpoint_uq` ON `tasks` (`hunt_id`,`checkpoint_code`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`hunt_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`emoji` text NOT NULL,
	`color` text NOT NULL,
	`code` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`origin` text DEFAULT 'player' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`hunt_id`) REFERENCES `hunts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teams_hunt_idx` ON `teams` (`hunt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_hunt_code_uq` ON `teams` (`hunt_id`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_hunt_name_uq` ON `teams` (`hunt_id`,`name_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`can_create_hunts` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);