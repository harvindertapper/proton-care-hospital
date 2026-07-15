import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["SUPER_ADMIN", "STAFF"] }).notNull().default("STAFF"),
  passwordHash: text("password_hash"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role", { enum: ["SUPER_ADMIN", "STAFF"] }).notNull().default("STAFF"),
  csrf: text("csrf").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at").notNull(),
  revoked: integer("revoked").notNull().default(0),
});

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  patientName: text("patient_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  departmentSlug: text("department_slug").notNull(),
  departmentName: text("department_name").notNull(),
  requestedDate: text("requested_date").notNull(),
  requestedTime: text("requested_time").notNull(),
  concern: text("concern").notNull(),
  consent: integer("consent", { mode: "boolean" }).notNull().default(false),
  otpVerified: integer("otp_verified", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("NEW"),
  internalNotes: text("internal_notes").notNull().default(""),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  scheduleVersion: integer("schedule_version").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const otpChallenges = sqliteTable("otp_challenges", {
  id: text("id").primaryKey(),
  purpose: text("purpose").notNull(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  ipAddress: text("ip_address"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  verifiedAt: text("verified_at"),
});

export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  patientName: text("patient_name").notNull(),
  phone: text("phone").notNull(),
  rating: integer("rating"),
  message: text("message").notNull(),
  consent: integer("consent", { mode: "boolean" }).notNull().default(false),
  otpVerified: integer("otp_verified", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("NEEDS_REVIEW"),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const contactMessages = sqliteTable("contact_messages", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email").notNull(),
  subject: text("subject"),
  message: text("message").notNull(),
  status: text("status").notNull().default("NEW"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const departmentTimings = sqliteTable("department_timings", {
  id: text("id").primaryKey(),
  departmentSlug: text("department_slug").notNull().unique(),
  departmentName: text("department_name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  days: text("days").notNull().default("Mon-Sat"),
  slotGapMinutes: integer("slot_gap_minutes").notNull().default(15),
  status: text("status").notNull().default("APPROVED"),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
  proposedBy: text("proposed_by"),
  approvedBy: text("approved_by"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const doctorProfiles = sqliteTable("doctor_profiles", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  speciality: text("speciality").notNull(),
  qualification: text("qualification"),
  departmentSlug: text("department_slug").notNull(),
  photoUrl: text("photo_url"),
  profileNote: text("profile_note").notNull().default(""),
  consentStatus: text("consent_status").notNull().default("APPROVED_SOURCE"),
  status: text("status").notNull().default("APPROVED"),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
  proposedBy: text("proposed_by"),
  approvedBy: text("approved_by"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const contentRevisions = sqliteTable("content_revisions", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  title: text("title").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull().default("NEEDS_REVIEW"),
  proposedBy: text("proposed_by").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  reviewedAt: text("reviewed_at"),
});

export const blogPosts = sqliteTable("blog_posts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("NEEDS_REVIEW"),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(false),
  sourceNote: text("source_note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const careerJobs = sqliteTable("career_jobs", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  department: text("department"),
  employmentType: text("employment_type"),
  description: text("description").notNull(),
  status: text("status").notNull().default("NEEDS_REVIEW"),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const patientVideos = sqliteTable("patient_videos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  youtubeId: text("youtube_id").notNull(),
  consentNote: text("consent_note").notNull(),
  status: text("status").notNull().default("NEEDS_REVIEW"),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  r2Key: text("r2_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  purpose: text("purpose").notNull().default("admin-upload"),
  uploadedBy: text("uploaded_by").notNull(),
  consentNote: text("consent_note").notNull().default(""),
  status: text("status").notNull().default("APPROVED"),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull().default("system"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  details: text("details").notNull().default(""),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  identifier: text("identifier").notNull(),
  count: integer("count").notNull().default(0),
  resetAt: integer("reset_at").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const idempotentRequests = sqliteTable("idempotent_requests", {
  id: text("id").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: integer("created_at").notNull(),
});
