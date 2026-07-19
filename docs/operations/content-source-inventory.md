# Content Source Inventory

This inventory maps all administrative and public website content types across the Protone Care Hospital platform to their current code sources, D1 database tables, R2 storage bindings, read/write API routes, fallback behaviours, and targeted owner refactoring bundles.

| Content / Domain Type | Current Git / Code Source | Current D1 Table | R2 Storage Involvement | Public Read Path / API | Admin Management Path | Known Fallback / Seed Behaviour | Target Migration Bundle |
|---|---|---|---|---|---|---|---|
| **Doctors** | `app/lib/data.ts` (`doctors`) | `doctor_profiles` | None (Image URLs in D1/public) | `/doctors`, `/doctors/[slug]`, `getPublicDoctors()` | Admin Console > Doctors | Static `doctors` fallback if D1 empty (to be eliminated) | Bundle B1 / B4 |
| **Leadership** | `app/lib/data.ts` | None | None (`public/assets/leadership/*.jpeg`) | `/about` | None (Hardcoded in About UI) | Static code rendering only | Bundle B4 |
| **Gallery** | `app/lib/data.ts` | None | Partial (`MEDIA` binding configured) | `/gallery`, `/api/gallery` | Admin Console > Media | `presetAssets` array fallback in `GalleryClient` | Bundle B2 |
| **Media Assets** | `public/assets/` | `media_assets` | Active (`pch` bucket via `MEDIA`) | `/api/media/[...key]` | `/api/admin/media` | Direct public static assets | Bundle B2 |
| **Blogs & Guides** | `app/lib/data.ts` | `blog_posts` | None | `/blog`, `/blog/[slug]` | Admin Console > Blogs | Static blog entries if D1 empty | Bundle B4 |
| **Careers & Jobs** | `app/lib/data.ts` | `career_jobs` | None | `/careers`, `/careers/[slug]` | Admin Console > Careers | Static job listings if D1 empty | Bundle B4 |
| **Testimonials & Feedback** | None | `feedback` | None | `/testimonials`, `getPublishedReviews()` | Admin Console > Feedback | Database query only (`public_consent = 1`) | Bundle B4 |
| **Patient Videos** | None | `patient_videos` | None | Public Video Component | Admin Console > Videos | Empty list if no database rows | Bundle B4 |
| **Department Timings** | `app/lib/data.ts` (`approvedTimingDepartments`) | `department_timings` | None | `/api/department-slots` | Admin Console > Timings | Seeded automatically during `getD1()` init | Bundle B4 |
| **Hospital Facts & Config** | `app/lib/data.ts` (`hospital`) | `site_configs` | None | Global Site Shell / Layout | Admin Console > Settings | Hardcoded constants in `app/lib/data.ts` | Bundle B4 |
| **TPA Insurance Panels** | `app/lib/data.ts` | None | None (`public/assets/tpa/`) | `/tpa-insurance` | None | Static code rendering only | Bundle B4 |
| **Appointment Requests** | None | `appointments` | None | `/appointment`, `/api/appointments` | Admin Console > Appointments | Department-based validation & D1 store | Bundle B1 / B3 |
| **Contact Messages** | None | `contact_messages` | None | `/contact`, `/api/contact` | Admin Console > Contact | Direct D1 insert | Bundle B1 / B3 |
| **Admin Sessions & Users** | `app/lib/adminAuth.ts` | `admin_users`, `sessions` | None | `/admin/login`, `/api/admin/login` | Admin Console > Staff | Super Admin bootstrap on start | Bundle B1 / B3 |
| **Audit Logs** | None | `audit_logs` | None | Internal Audit System | Admin Console > Audit | Direct D1 insert on admin action | Bundle B1 / B3 |
| **Rate Limits** | None | `rate_limits` | None | Internal middleware/APIs | None | Ephemeral sliding window in D1 | Bundle B1 |
| **Site Analytics** | None | `site_analytics` | None | Internal Analytics API | Admin Console > Overview | Privacy-safe hash tracking in D1 | Bundle B1 / B3 |
| **Department Closures** | None | `department_closures` | None | `/api/department-slots` | Admin Console > Timings | D1 date closure lookup | Bundle B4 |
| **Admin Webhooks** | None | `admin_webhooks` | None | Internal Webhook Trigger | Admin Console > Webhooks | Optional dispatch on content publish | Bundle B4 |
