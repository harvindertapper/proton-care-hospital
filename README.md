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
- `ADMIN_SUPER_EMAIL` / `ADMIN_SUPER_PASSWORD`
- `ADMIN_STAFF_EMAIL` / `ADMIN_STAFF_PASSWORD`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`
- `SMS91_AUTH_KEY`, approved OTP template ID, and sender ID
- `OTP_HASH_SECRET`

SMS91/MSG91 and Turnstile are production-ready adapters, but live launch proof is blocked until credentials, DLT/template approval, and test delivery are configured.

## Appointment Rule

The public appointment flow is request-only and department-only. Patients choose department, date, and a 15-minute preferred slot. Hospital staff confirms final availability manually.
