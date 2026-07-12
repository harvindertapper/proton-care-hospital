CREATE TABLE `admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'STAFF' NOT NULL,
	`password_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_email_unique` ON `admin_users` (`email`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`patient_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`department_slug` text NOT NULL,
	`department_name` text NOT NULL,
	`requested_date` text NOT NULL,
	`requested_time` text NOT NULL,
	`concern` text NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	`otp_verified` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`internal_notes` text DEFAULT '' NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointments_request_id_unique` ON `appointments` (`request_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text DEFAULT 'system' NOT NULL,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`details` text DEFAULT '' NOT NULL,
	`ip_address` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'NEEDS_REVIEW' NOT NULL,
	`is_visible` integer DEFAULT false NOT NULL,
	`source_note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_slug_unique` ON `blog_posts` (`slug`);--> statement-breakpoint
CREATE TABLE `career_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`department` text,
	`employment_type` text,
	`description` text NOT NULL,
	`status` text DEFAULT 'NEEDS_REVIEW' NOT NULL,
	`is_visible` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_jobs_slug_unique` ON `career_jobs` (`slug`);--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text NOT NULL,
	`subject` text,
	`message` text NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`ip_address` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`title` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'NEEDS_REVIEW' NOT NULL,
	`proposed_by` text NOT NULL,
	`reviewed_by` text,
	`review_note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE TABLE `department_timings` (
	`id` text PRIMARY KEY NOT NULL,
	`department_slug` text NOT NULL,
	`department_name` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`days` text DEFAULT 'Mon-Sat' NOT NULL,
	`slot_gap_minutes` integer DEFAULT 15 NOT NULL,
	`status` text DEFAULT 'APPROVED' NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`proposed_by` text,
	`approved_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `department_timings_department_slug_unique` ON `department_timings` (`department_slug`);--> statement-breakpoint
CREATE TABLE `doctor_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`speciality` text NOT NULL,
	`qualification` text,
	`department_slug` text NOT NULL,
	`photo_url` text,
	`profile_note` text DEFAULT '' NOT NULL,
	`consent_status` text DEFAULT 'APPROVED_SOURCE' NOT NULL,
	`status` text DEFAULT 'APPROVED' NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`proposed_by` text,
	`approved_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `doctor_profiles_slug_unique` ON `doctor_profiles` (`slug`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_name` text NOT NULL,
	`phone` text NOT NULL,
	`rating` integer,
	`message` text NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	`otp_verified` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'NEEDS_REVIEW' NOT NULL,
	`is_visible` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`purpose` text DEFAULT 'admin-upload' NOT NULL,
	`uploaded_by` text NOT NULL,
	`consent_note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_r2_key_unique` ON `media_assets` (`r2_key`);--> statement-breakpoint
CREATE TABLE `otp_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`phone` text NOT NULL,
	`code_hash` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`ip_address` text,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`verified_at` text
);
--> statement-breakpoint
CREATE TABLE `patient_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`youtube_url` text NOT NULL,
	`youtube_id` text NOT NULL,
	`consent_note` text NOT NULL,
	`status` text DEFAULT 'NEEDS_REVIEW' NOT NULL,
	`is_visible` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`identifier` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
