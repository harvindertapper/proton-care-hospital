# Protone Care Hospital Sites App

Fresh single-app build for `Protonecarehospital.com`.

## Scope

- Public hospital website routes: home, about, departments, doctors, TPA/insurance, appointment, feedback, testimonials, blog, careers, contact, privacy, and terms/disclaimer.
- Protected `/admin` routes in the same app with separate layout, session auth, CSRF checks, role checks, audit logs, and noindex rules.
- `/api/*` endpoints for OTP, appointments, feedback, contact, admin actions, approval review, media upload, and published content support.
- Sites D1 binding: `DB`.
- Sites R2 binding: `MEDIA`.

## Commands

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
npm run db:generate
```

## Production Gates

Set the values in `.env.example` before launch:

- `ADMIN_SESSION_SECRET` or `AUTH_SECRET`
- `ADMIN_SUPER_EMAIL` and the Cloudflare secret `ADMIN_SUPER_PASSWORD` (15-128 characters)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`
- `SMS91_AUTH_KEY`, approved OTP template ID, and sender ID
- `OTP_HASH_SECRET`

SMS91/MSG91 and Turnstile are production-ready adapters, but live launch proof is blocked until credentials, DLT/template approval, and test delivery are configured.

`ADMIN_SUPER_PASSWORD` is used only when the first super admin is created (or when the one known legacy fallback account is migrated). Later password changes are stored in D1 and are never overwritten by the environment value. Staff accounts are created by the super admin in the admin console; no `ADMIN_STAFF_*`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD` variables are used.

## Appointment Rule

The public appointment flow is request-only and department-only. Patients choose department, date, and a 15-minute preferred slot. Hospital staff confirms final availability manually.
