# Admin Architecture & Module Boundaries

This document defines the architectural boundaries, domain modularization, data storage rules, target authorization requirements, and release constraints for the Protone Care Hospital Admin and Content Management System rebuild.

---

## 1. Scope & System Status Transition

- **Current State (B0 Baseline):** The system relies on a monolithic `app/lib/server.ts` that executes ad-hoc `tableStatements` and `adminUserMigrationStatements` during request initialization. R2 media serving (`/api/media/[...key]`) currently streams objects directly without verifying D1 asset publication status.
- **Target Architecture:** Phased extraction of server logic into modular domain packages. Schema evolution must occur exclusively through numbered, versioned `.sql` migrations checked statically by `scripts/check-migrations.mjs`.
- **Runtime Alter Free Guarantee:** Following `migrations/0000_baseline.sql`, no new ad-hoc runtime `ALTER TABLE` or `CREATE TABLE` loops shall be added to production code paths.

---

## 2. Target Domain Modules

| Module Name | Responsibilities | Core Entities / Schemas |
|---|---|---|
| **`auth`** | Session management, RBAC, OTP generation, password hashing, CSRF protection. | `admin_users`, `sessions`, `admin_email_otps` |
| **`content`** | Management of public medical directory profiles, leadership, blogs, careers, department schedules, and patient video links. | `doctor_profiles`, `blog_posts`, `career_jobs`, `patient_videos`, `department_timings`, `content_revisions` |
| **`media`** | Asset registration, image metadata tracking, placement assignment, and secure serving via R2. | `media_assets`, R2 (`pch` bucket) |
| **`releases`** | Versioned content publication releases, release items, active release pointers, diff/compare, and rollback. **Explicitly excludes all operational patient data.** | `content_releases`, `release_items` |
| **`operations`** | Inbound patient workflows: appointment requests, contact messages, patient feedback, and department closures. | `appointments`, `contact_messages`, `feedback`, `department_closures` |
| **`audit`** | Security logging, admin action tracking, rate limiting, and system event analytics. | `audit_logs`, `rate_limits`, `site_analytics` |
| **`db/migrations`** | Versioned D1 schema definitions, migration validation scripts, and backup procedures. | `migrations/`, `scripts/check-migrations.mjs` |

---

## 3. Storage Division & Asset Policy

1. **Git / `public/` Directory (Immutable Asset Location):**
   - Reserved for **immutable developer assets** (e.g., brand logos, UI icons, structural graphics, baseline layout illustrations).
   - Existing repository images remain hosted via Git/public and are never duplicated into R2.

2. **Cloudflare D1 (`site-creator-d1`):**
   - Serves as the **single source of truth** for all structured metadata, operational submissions, content revisions, content releases, sessions, audit trails, and asset metadata.

3. **Cloudflare R2 (`pch` Bucket - Limited Binary Storage):**
   - Limited strictly to **Admin-uploaded dynamic binaries** (e.g., new gallery uploads, uploaded doctor headshots).
   - **Target Authorization Requirement (Bundle B5):** Public object serving at `/api/media/[...key]` must be updated in Bundle B5 to check D1 metadata (`status = 'PUBLISHED'` and `deleted_at IS NULL`) before serving R2 objects, returning `404` for draft/hidden/deleted assets.

---

## 4. Content Release & Operational Data Exclusion

- **Isolation Rule:** Operational patient submissions (`appointments`, `contact_messages`, `feedback`, patient consent records, user sessions, audit logs, and rate limit counters) belong to live operational data and are **strictly isolated** from content publishing workflows.
- Content releases managed by the **`releases`** module contain ONLY versioned site content pointers (`doctor_profiles`, `blog_posts`, `media_assets`, etc.). Content rollbacks or releases must **never alter, wipe, or revert operational patient data**.
