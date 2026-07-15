# Protone Care Hospital Cloudflare Worker

Fresh single-app build for `Protonecarehospital.com`.

## Scope

- Public hospital website routes: home, about, departments, doctors, TPA/insurance, appointment, feedback, testimonials, blog, careers, contact, privacy, and terms/disclaimer.
- Protected `/admin` routes in the same app with separate layout, session auth, CSRF checks, role checks, audit logs, and noindex rules.
- `/api/*` endpoints for OTP, appointments, feedback, contact, admin actions, approval review, media upload, and published content support.
- Cloudflare D1 binding: `DB` (`site-creator-d1`).
- Cloudflare R2 binding: `MEDIA` (`pch`).
- Cloudflare Images binding: `IMAGES` for Vinext image optimization.

## Cloudflare architecture

This project deploys as one Cloudflare Worker with bundled static assets. D1 is
the relational store for admin, appointment, and content data; R2 stores uploaded
media. Pages, Durable Objects, KV, and Containers are not required for the
current application.

## Commands

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
npm run db:generate
npm run cf:types
```

## Cloudflare deployment

`wrangler.jsonc` is the source of truth for the existing
`proton-care-hospital` Worker and its production bindings.

```bash
npx wrangler login
npm run cf:whoami
npm run deploy:check-env
npm run deploy:dry-run
npm run deploy
```

Before the first production deployment, configure the required encrypted
bindings. The first three commands below are already present on the current
Worker; all five are listed so a fresh setup is reproducible.

```bash
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put OTP_HASH_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put ADMIN_SUPER_EMAIL
npx wrangler secret put ADMIN_SUPER_PASSWORD
```

`ADMIN_SUPER_PASSWORD` is bootstrap-only. After the first successful admin
login creates the D1 account, remove it from the Worker and from
`secrets.required` in `wrangler.jsonc`.

Put the `NEXT_PUBLIC_*` build-time values from `.env.example` in an ignored
`.env.production.local` file. The production deploy command validates those
names before building and never prints their values.

## Production Gates

Set the values in `.env.example` before launch:

- `ADMIN_SESSION_SECRET` or `AUTH_SECRET`
- `ADMIN_SUPER_EMAIL` and the Cloudflare secret `ADMIN_SUPER_PASSWORD` (15-128 characters)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`
- `OTP_HASH_SECRET`

Firebase Phone Auth and Turnstile are production adapters, but live launch proof
remains blocked until their credentials and test flows are verified.

`ADMIN_SUPER_PASSWORD` is used only when the first super admin is created (or when the one known legacy fallback account is migrated). Later password changes are stored in D1 and are never overwritten by the environment value. Staff accounts are created by the super admin in the admin console; no `ADMIN_STAFF_*`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD` variables are used.

## Appointment Rule

The public appointment flow is request-only and department-only. Patients choose department, date, and a 15-minute preferred slot. Hospital staff confirms final availability manually.
