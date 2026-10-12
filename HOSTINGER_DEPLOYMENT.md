# KORA — Hostinger cPanel + Node.js Deployment Guide

Exact deployment instructions for this project: a **fully server-rendered
Next.js 16 application** (80 pages, 128 API routes, PostgreSQL/Drizzle,
JWT-cookie auth, Paystack payments, optional Firebase Google sign-in).
It is **not** a static site — it must run as a persistent Node.js
application. Do not use cPanel's static-file or PHP flows for it.

> Nobody has deployed this yet — this guide prepares every step for you to
> run in your own Hostinger/cPanel account.

## 0. Facts about this project (audit §1)

| Item | Value |
|------|-------|
| Framework | Next.js 16.2.6 (App Router, server-rendered, no static export) |
| Language | TypeScript (strict, `tsc --noEmit` clean) |
| Package manager | npm (`package-lock.json` is committed — use `npm ci`) |
| Node.js required | ≥ 18.18.0 (`engines` in package.json); use **20.x LTS** on the host |
| Dev | `npm run dev` |
| Build | `npm run build` (verified: exit 0) |
| Start (standard) | `npm start` = `next start` (verified working) |
| Start (cPanel) | `node server.js` — startup FILE for cPanel's Node.js manager (verified working, exact equivalent of `npm start`) |
| Database | PostgreSQL via Drizzle ORM + `pg` Pool (does **not** run on MySQL) |
| Auth | JWT in `auth_token` cookie (`Secure`+`HttpOnly`+`SameSite=Lax` in production) + optional Firebase Google sign-in |
| Payments | Paystack (server SDK calls + signed webhooks + popup) |
| Uploads | DB data-URLs + remote URLs — **no filesystem writes**, no `public/` dir needed, no image-optimization natives, no webfonts |

## 1. What you need in cPanel/WHM

- A plan with **Setup Node.js App** (CloudLinux Node.js Selector) and
  **PostgreSQL** databases. If only MySQL exists, stop — this app needs
  Postgres.
- Your domain added to cPanel with a valid SSL certificate
  (cPanel → SSL/TLS Status → include the domain; force HTTPS redirect ON).

## 2. Files to upload & application root

Upload the **entire repository** except the items below. Application root
example: `/home/<cpanel-user>/kora` (NOT `public_html` — the Node.js app
lives outside the web root; cPanel proxies to it).

**Upload:** everything, including `server.js`, `.next/` is NOT uploaded
(you build on the server), `package-lock.json`, `scripts/`,
`HOSTINGER_DEPLOYMENT.md`, `.env.example`.

**Do NOT upload / never commit:**

- `node_modules/` (installed on the server)
- `.next/` (built on the server)
- `.env`, `.env.local`, `.env*.local` (secrets stay in cPanel env vars)
- `pgvenv/`, `.cache/` (sandbox-only Postgres)

`.gitignore` already excludes all of these. `.env.example` contains every
variable name with **no real secrets** — safe to upload.

## 3. cPanel "Setup Node.js App" settings

Create the application with these exact settings:

| Field | Value |
|-------|-------|
| Node.js version | **20.x** (any ≥ 18.18 works; 20 LTS recommended) |
| Application mode | Production |
| Application root | `/home/<user>/kora` (your upload dir) |
| Application URL | your domain (https://…) |
| **Application startup file** | **`server.js`** |
| Passenger log / app log | enabled (for troubleshooting) |

Why `server.js`: cPanel launches apps from a startup *file*, not an npm
command, and `next start` cannot be used as that file. `server.js` (in the
repo root) is the verified equivalent of `npm start` — it serves the
prebuilt `.next` output on the port cPanel assigns via `PORT`.

## 4. Install, env vars, build (run in the app's terminal)

Open the app's terminal (cPanel → Setup Node.js App → pencil icon →
"Open terminal into application environment", or SSH with the app's
virtualenv activated):

```bash
cd /home/<user>/kora
npm ci            # reproducible install from package-lock.json
```

Then set **Environment variables** in the Node.js app panel (all names +
notes are in `.env.example`). Required:

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:5432/DATABASE` — from cPanel → PostgreSQL Databases. Append `?sslmode=require` only if your host requires SSL for Postgres |
| `JWT_SECRET` | long random string. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. The app **refuses to sign sessions without it** |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` (no trailing slash) — drives Paystack callbacks, email links, metadata |
| `PAYSTACK_SECRET_KEY` | `sk_test_…` first; `sk_live_…` at go-live |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | matching `pk_test_…` / `pk_live_…` — **never mix test + live** |

Optional: `NEXT_PUBLIC_FIREBASE_*` (Google sign-in, §7), `EMAIL_PROVIDER` +
`RESEND_API_KEY` or `SMTP_*` (else in-app inbox only), one-time
`ALLOW_SEED=true` (§5, remove afterwards). Never set `PAYSTACK_SIMULATE`
or `PAYSTACK_API_URL` here — automated-test hooks only.

Then build and restart:

```bash
npm run build     # must exit 0; bakes NEXT_PUBLIC_* vars in
# back in the Node.js app panel: press RESTART (or: touch tmp/restart.txt)
```

Whenever you change a `NEXT_PUBLIC_*` var you must **rebuild + restart**
(Next.js embeds them at build time). Other vars need only a restart.

## 5. Database setup (PostgreSQL)

1. cPanel → PostgreSQL Databases → create database + user, note the host
   (often `localhost`) and credentials → compose `DATABASE_URL`.
2. Create the schema (app terminal):
   `npx drizzle-kit push`
   (reads `src/db/schema.ts`; on an existing DB first run the additive,
   idempotent `scripts/migrate_tracking.sql` if its tables are missing).
3. Seed **once** (demo catalog + default logins): temporarily set
   `ALLOW_SEED=true`, restart, then as admin
   `POST https://your-domain/api/admin/seed`, then **remove `ALLOW_SEED`
   and restart**. Without the flag the endpoint returns 403 in production
   (it truncates the DB, so this guard is deliberate).
4. **Immediately change the seeded passwords.** The seed creates
   publicly-documented logins (`admin/seller/customer@marketplace.com`).
   Log in as each one and change its password under Account → Security
   (or delete the demo seller/customer accounts) before going live —
   otherwise anyone can sign straight into your admin panel.

## 6. Domain, HTTPS, cookies, CORS

- Point the domain's A record at the server; attach the domain to the
  Node.js app URL; enable **Force HTTPS redirect**.
- The app is **same-origin** (no CORS config needed): browser ↔ your
  domain only; server-to-Paystack/Firebase calls are server-side.
- Cookies: `auth_token` is `Secure` in production (requires HTTPS —
  another reason HTTP must redirect), `HttpOnly`, `SameSite=Lax`.
- Security headers are already configured in `next.config.ts`
  (`nosniff`, strict referrer policy, restricted permissions policy,
  HSTS once HTTPS is live).

## 7. Paystack configuration

1. Use **test keys** first. Place an order with Paystack's test card and
   confirm the webhook marks it paid.
2. Dashboard → Settings → Webhooks → add
   `https://YOUR-DOMAIN/api/payments/paystack/webhook`, enable
   `charge.success`, `charge.failed`, `transfer.success`,
   `transfer.failed`, `transfer.reversed`. Verification is HMAC with your
   secret key — no separate webhook secret.
3. The popup return URL is built from `NEXT_PUBLIC_SITE_URL`
   (`/checkout/paystack/callback?reference=…`), so that var must be exact.
4. Swap to **live keys** only after test mode passes end to end. Mode is
   derived from the secret-key prefix — there is no toggle to forget.

## 8. Firebase configuration (optional Google sign-in)

Skip this whole section to run on email/password only — the Google button
hides itself when these vars are absent.

1. Firebase console → Project settings → Your apps → Web → copy the six
   `NEXT_PUBLIC_FIREBASE_*` values into the cPanel env panel.
2. Authentication → Sign-in method → enable **Google**.
3. Authentication → Settings → **Authorized domains** → add your domain
   (Google rejects sign-ins from unlisted domains).
4. `npm run build` + restart (NEXT_PUBLIC vars bake in at build time).
5. Backend check: `POST /api/auth/firebase` cryptographically verifies
   Google ID tokens (JWKS) in production and links accounts by email.

## 9. Post-deploy verification checklist

- [ ] Homepage loads over HTTPS with no browser console errors.
- [ ] `/login` shows **no** demo-account buttons (dev-only) and no
      "Continue with Google" unless Firebase is configured.
- [ ] Register → login → cart → (test) checkout → order + tracking
      timeline in Account → Orders.
- [ ] Seller login → fulfill an order; Admin → Finance shows commission.
- [ ] `POST /api/admin/seed` → 403 (guard active, `ALLOW_SEED` removed).
- [ ] `Set-Cookie: auth_token` includes `Secure; HttpOnly; SameSite=Lax`.
- [ ] Admin → Settings → Marketplace: set real contact email (replaces
      the `support@kora.com.gh` placeholder), name, currency, fees.

## 10. Redeploys & rollback

Pull/upload changes → `npm ci` (only if deps changed) → `npm run build` →
RESTART the Node.js app. Schema changes: `npx drizzle-kit push`
(additive). Rollback: re-upload the previous release dir (keep one backup
copy, e.g. `kora-prev/`) → restart.

## 11. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| App won't start, log mentions `next` | `npm ci` didn't finish, or wrong Node version — set 20.x |
| 503 / "Cannot GET /" | startup file isn't `server.js`, or `.next/` missing → `npm run build` |
| `DATABASE_URL is required` | env var not set in the app panel (`.env.local` is never uploaded) |
| Login loops back to `/login` | site served over HTTP — force HTTPS redirect (Secure cookie) |
| Paystack popup fails / no callback | `NEXT_PUBLIC_SITE_URL` wrong or mixed test/live keys |
| Google button missing | Firebase vars absent (by design) — see §8 |
| Google sign-in "unauthorized domain" | add domain under Firebase Authorized domains |
