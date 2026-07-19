# Admin Architecture & Module Boundaries

This document defines the architectural boundaries, domain modularization, data storage rules, and release constraints for the Protone Care Hospital Admin and Content Management System rebuild.

---

## 1. Scope and Architectural Objectives

- **Bundle B0 Purpose:** Establish versioned D1 migrations, static validation tooling, and operational backup runbooks without modifying existing runtime code or site behaviour.
- **Incremental Refactoring:** The rebuild preserves full operational compatibility. Monolithic server functions will be extracted into clean, domain-specific modules in subsequent controlled bundles.
- **Runtime Alter Free Guarantee:** Following the introduction of `migrations/0000_baseline.sql`, no new ad-hoc runtime `ALTER TABLE` or `CREATE TABLE` execution loops shall be added. Schema evolution must occur exclusively through numbered, versioned `.sql` files checked by `scripts/check-migrations.mjs`.

---

## 2. Target Domain Modules

| Module Name | Responsibilities | Core Entities / Schemas |
|---|---|---|
| **`auth`** | Session management, RBAC, OTP generation, password hashing, CSRF protection. | `admin_users`, `sessions`, `admin_email_otps` |
| **`content`** | Management of public medical directory profiles, leadership, blogs, careers, department schedules, and patient video links. | `doctor_profiles`, `blog_posts`, `career_jobs`, `patient_videos`, `department_timings`, `content_revisions` |
| **`media`** | Asset registration, image metadata tracking, placement assignment, and secure serving via R2. | `media_assets`, R2 (`pch` bucket) |
| **`operations`** | Inbound patient workflows: appointment requests, contact messages, patient feedback, and department closures. | `appointments`, `contact_messages`, `feedback`, `department_closures` |
| **`audit`** | Security logging, admin action tracking, rate limiting, and system event analytics. | `audit_logs`, `rate_limits`, `site_analytics` |
| **`db/migrations`** | Versioned D1 schema definitions, migration validation scripts, and backup procedures. | `migrations/`, `scripts/check-migrations.mjs` |

---

## 3. Storage Division & Asset Policy

1. **Git / `public/` Directory:**
   - Reserved exclusively for **immutable developer assets** (e.g., brand logos, UI icons, structural graphics, baseline layout illustrations).
   - Code deployments contain only static assets version-controlled in Git.

2. **Cloudflare D1 (`site-creator-d1`):**
   - Serves as the **single source of truth** for all structured metadata, operational submissions, content revisions, sessions, audit trails, and asset metadata.
   - Every published media file (whether in `public/` or R2) must have a corresponding metadata record in D1.

3. **Cloudflare R2 (`pch` Bucket):**
   - Serves as **storage for dynamically uploaded administrative binary assets** (e.g., new gallery uploads, doctor headshots uploaded via Admin).
   - Direct unauthenticated key access is prohibited for draft/hidden assets. All R2 asset access must be validated against published D1 metadata via `/api/media/[...key]`.

---

## 4. Content Release & Operational Isolation

- **Isolation Rule:** Operational patient records (`appointments`, `contact_messages`, `feedback`, patient consent records, user sessions, audit logs, and rate limit counters) belong to live operational data and are **strictly isolated** from content publishing workflows.
- Content revisions or site rollbacks affect ONLY published domain content (`doctor_profiles`, `blog_posts`, `media_assets`, etc.) and must never alter, wipe, or roll back operational patient submissions.
