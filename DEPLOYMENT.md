# KORA — Hostinger Deployment Guide

> **Start here for cPanel:** the authoritative step-by-step guide is now
> **`HOSTINGER_DEPLOYMENT.md`** (cPanel "Setup Node.js App", `server.js`
> startup file, full checklists). This file remains as a supplementary
> reference.

This is the complete, tested deployment procedure for the KORA marketplace
(Next.js 16 + PostgreSQL + Paystack + optional Firebase Google sign-in).
The codebase was audit-hardened for production in September 2026: production
build verified, production-mode smoke-tested, and all e2e suites green.

> Scope note: this guide prepares the codebase only. Nobody has deployed it
> or touched any hosting account yet — follow the steps below when ready.

## 1. What you need from Hostinger

A plan that supports **Node.js 18.18+** (20.x LTS recommended) **and**
a **PostgreSQL** database with a connection string. If your plan only offers
MySQL, upgrade first — the app uses Postgres-specific SQL and Drizzle's
`pg` driver; it will not run on MySQL.

You will need, from hPanel:

| # | Value | Where to find it |
|---|-------|------------------|
| 1 | Your domain, with SSL enabled | Domains → SSL |
| 2 | PostgreSQL host, port, database, user, password | Databases → PostgreSQL |
| 3 | Node.js app root + the Environment Variables panel | Websites → your site → Node.js |

## 2. Deploy the code

1. Upload the repository (Git clone in hPanel's Git tool, or upload a ZIP).
   Use branch `arena/01a08723-my-ecommerce-site` (or `main` after merge).
2. Application startup file: the app is a standard Next.js project:
   - Install: `npm ci` (Node ≥ 18.18, see `engines` in package.json)
   - Build: `npm run build`
   - Start: `npm start` (binds the port Hostinger assigns via `PORT`;
     if hPanel asks for a startup file/command, use `npm start`)
3. Set **all** environment variables from `.env.example` in hPanel's
   Environment Variables panel. The full list (names only — never commit
   real values) with per-variable notes lives in `.env.example`. The
   must-set ones:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:5432/DATABASE` (use the **internal** host if Hostinger provides one — faster and not internet-exposed) |
| `JWT_SECRET` | long random string, e.g. output of `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. **Required** — the app refuses to sign sessions without it in production |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` (no trailing slash) |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` first; `sk_live_...` when going live |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | matching `pk_test_...` / `pk_live_...` — **never mix a test key with a live key** |

Optional groups (also documented in `.env.example`):

- **Firebase Google sign-in** (`NEXT_PUBLIC_FIREBASE_*`): only needed if you
  want the "Continue with Google" button. Without these vars the app runs on
  email/password auth and the button is hidden automatically.
- **Email** (`EMAIL_PROVIDER=resend|smtp` + provider keys): without it, order
  emails are skipped but the in-app notification inbox keeps working.

## 3. Database setup

1. Point `DATABASE_URL` at the Hostinger Postgres database.
2. Create the schema. Two supported ways:
   - `npx drizzle-kit push` (reads `src/db/schema.ts`), or
   - run `scripts/migrate_tracking.sql` on top of an existing database, then
     `push` for the rest.
3. Seed **once** (creates categories, demo sellers/products, and the default
   admin/seller/customer logins):
   - Temporarily set `ALLOW_SEED=true`, then as admin:
     `POST https://your-domain/api/admin/seed`
   - **Remove `ALLOW_SEED` immediately afterwards.** Seeding truncates the
     whole database, and the endpoint refuses to run in production without
     that flag.

## 4. Paystack go-live checklist

1. In the Paystack dashboard, register the webhook URL:
   `https://YOUR-DOMAIN/api/payments/paystack/webhook`
   and enable events: `charge.success`, `charge.failed`, `transfer.success`,
   `transfer.failed`, `transfer.reversed`. Webhooks are verified with your
   secret key (HMAC) — no separate webhook secret needed.
2. Start with **test keys** (`sk_test_`/`pk_test_`): place a test order with
   Paystack's test card and confirm the webhook flips the order to paid.
3. Swap to **live keys** only after test mode works end to end.
   Mode is derived from the secret key — there is no toggle to forget.
4. Never set `PAYSTACK_SIMULATE` or `PAYSTACK_API_URL` in production —
   those exist only for the automated test suite.

## 5. Firebase Google sign-in (optional)

1. Firebase console → Project settings → Your apps → Web app → copy the six
   `NEXT_PUBLIC_FIREBASE_*` values into hPanel env vars and redeploy
   (Next.js bakes `NEXT_PUBLIC_*` vars in at **build** time).
2. Firebase console → Authentication → Settings → Authorized domains → add
   your production domain, or Google will reject the sign-in.
3. Enable the Google provider under Authentication → Sign-in method.
4. Backend verification is automatic: `POST /api/auth/firebase` verifies the
   Google ID token cryptographically (JWKS) in production and mints the app
   session. Accounts link to existing users by email on first sign-in.

## 6. Post-deploy verification (do this before announcing)

- [ ] Homepage loads over HTTPS; no browser console errors.
- [ ] `/login` shows **no** demo-account buttons (removed entirely).
- [ ] Seeded passwords changed (admin/seller/customer).
- [ ] `POST /api/admin/seed` returns 403 (seed guard active).
- [ ] Register → login → add to cart → test checkout → order appears in
      Account → Orders with a tracking timeline.
- [ ] Seller login → fulfill one order; admin login → finance overview shows
      commission rows.
- [ ] Response headers include `X-Content-Type-Options: nosniff` and
      `Strict-Transport-Security` (HSTS only takes effect over HTTPS).
- [ ] Change `support@kora.com.gh` (Admin → Settings → Marketplace →
      contact email) to your real support address.
- [ ] Set the marketplace name/currency/fees in Admin → Settings.

## 7. Production safety features already in the code

- JWT sessions refuse to sign without `JWT_SECRET` in production (no
  guessable fallback); the auth proxy fails closed in the same case.
- `/api/admin/seed` is disabled in production unless `ALLOW_SEED=true`.
- Firebase ID tokens are cryptographically verified (JWKS) in production;
  the claims-only fallback only exists outside production.
- Security headers: `nosniff`, strict referrer policy, restrictive
  permissions policy, HSTS (HTTPS only). No `X-Frame-Options`/CSP, so the
  storefront stays embeddable and Paystack popups keep working.
- Same-origin app — no CORS wildcard anywhere.
- API errors return generic messages; stack traces never leak to clients.
- Demo-account buttons and all `TEMP-DIAG` logging were removed from
  production paths; remaining server logs are operational error logs.
- No TODO/FIXME/lorem/Coming-Soon markers remain in `src/`.

## 8. Rollback / redeploy

Redeploys are: pull latest → `npm ci` → `npm run build` → restart.
Schema changes ship via `npx drizzle-kit push` (additive) — the one
hand-written migration (`scripts/migrate_tracking.sql`) is idempotent
(`IF NOT EXISTS`) and safe to re-run.
