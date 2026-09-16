# AcademyOS

A multi-tenant SaaS for coaching institutes — CRM + LMS + academy management in one
application, with five separate portals and strict per-tenant data isolation.

Built with React + Vite + TypeScript + Tailwind + TanStack Query + React Router +
React Hook Form + Zod + Recharts + Lucide on the front end, and Node + Express +
TypeScript + Mongoose + MongoDB + JWT (httpOnly cookies) + bcrypt + Zod on the back end.

---

## Quick start

```bash
# 1. MongoDB must be running as a single-node replica set (transactions are required).
#    File descriptors matter: WiredTiger needs far more than the default 1024.
bash -c 'ulimit -n 64000; exec mongod --dbpath /opt/mongo-data \
  --bind_ip 127.0.0.1 --port 27017 --replSet rs0 --wiredTigerCacheSizeGB 0.3'
mongosh --eval 'rs.initiate()'      # once, on a fresh data directory

# 2. Back end
cd server
npm install
cp .env.example .env                # defaults work for local development
npm run seed                        # 3 academies with realistic data
npm run dev                         # http://localhost:4000

# 3. Front end (separate terminal)
cd client
npm install
npm run dev                         # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://127.0.0.1:4000`, so the browser only
ever talks to one origin and the auth cookies are first-party.

### Logins

Every seeded account and its portal is listed in [`CREDENTIALS.md`](./CREDENTIALS.md).

| Portal | URL | Example |
|---|---|---|
| Platform owner | `/owner/login` | `owner@academyos.com` / `Owner@12345` |
| Academy admin | `/admin/login` | `admin@brilliantacademy.test` / `Password@123` |
| Teacher | `/teacher/login` | `teacher2@brilliantacademy.test` / `Password@123` |
| Student | `/student/login` | see `CREDENTIALS.md` (name-derived) |
| Parent | `/parent/login` | see `CREDENTIALS.md` (name-derived) |

Student and parent e-mail addresses are generated from random name pools, so they change
whenever you re-seed. Regenerate the table after seeding; staff addresses are stable.

---

## Architecture

```
server/src
  config/       env, database, RBAC permission matrix, plan limits
  models/       19 Mongoose models, every tenant model carries organizationId
  middleware/   authenticate → tenantScope → requirePermission → validate
  services/     business logic (transactions, invariants, provider abstractions)
  controllers/  HTTP layer only: parse, delegate, respond
  routes/       route tables grouped by domain
  validators/   Zod schemas for body / query / params
  seed/         deterministic fixtures + 3-organization seeder
  tests/        tenant isolation and RBAC escalation suites

client/src
  lib/          api client, auth context, formatting helpers
  hooks/        useApiQuery / useListQuery / useApiMutation
  components/   UI kit, DataTable, StatCard, ResourcePage factory
  layouts/      PortalLayout (sidebar, search, notifications, branding)
  pages/        admin · owner · teacher · student · parent · shared
```

Request flow is always **Route → Controller → Service → Model**.

### Multi-tenancy

`organizationId` is **never** read from the browser. `authenticate` resolves the session
from an httpOnly cookie, `tenantScope` derives `req.orgId` from that session, and
`validate()` strips any client-supplied `organizationId` before it reaches a service.
Cross-tenant reads return `404` rather than `403`, so one academy cannot even confirm
the existence of another's records.

This is enforced by tests, not by convention — see below.

### Authentication

JWT access (12 h) and refresh (7 d) tokens are issued as httpOnly, SameSite cookies
(`aos_at` / `aos_rt`). Nothing sensitive is stored in `localStorage`. Passwords are
hashed with bcrypt. Each user carries a `tokenVersion`; bumping it invalidates every
issued token, which is how suspension and password resets force an immediate sign-out.

Portals are bound to roles: logging into the wrong portal fails with `401` even when the
password is correct.

### Permissions

A central permission matrix (`config/rbac.ts`) maps roles to permissions like
`student:read` or `payment:create`. The front end uses `can()` only to decide what to
*render* — every endpoint independently enforces its own permission, so hiding a button
is never the security boundary.

---

## Verification

Everything below was executed against the running stack.

```bash
# Back end
cd server
npx tsc -p tsconfig.json --noEmit     # 0 errors
npx eslint "src/**/*.ts"              # 0 errors
NODE_ENV=test npx vitest run          # 96 passed (54 isolation + 42 RBAC)

# Front end
cd client
npx tsc -p tsconfig.app.json --noEmit # 0 errors
npm run build                         # production bundle builds

# Browser end-to-end (real Chromium against the live stack)
node e2e/smoke.cjs                    # 65/65 — all 5 portals, every route
node e2e/crud.cjs                     # 11/11 — create/edit/delete, search, RBAC
```

`e2e/smoke.cjs` signs into all five portals through the actual login form and visits
every sidebar route, failing on any console error, page error, or `4xx`/`5xx` API call.

`e2e/crud.cjs` performs a full create → verify-in-database → edit → delete round trip,
checks that search and pagination hit the server, and asserts that a student receives
`403` from finance, people and CRM endpoints and is redirected away from `/admin`.

### Automated security tests

`src/tests/tenant-isolation.test.ts` builds two complete organizations and asserts that
A cannot read, update or delete B's students, leads, courses, videos, payments,
attendance, results or documents.

`src/tests/rbac-escalation.test.ts` asserts that students cannot modify attendance or
results, teachers cannot touch finance, parents cannot modify students, and academy
admins cannot reach owner APIs.

These tests found a genuine bug during development: `STUDENT` and `PARENT` roles had
been granted `payment:read`, `invoice:read`, `receipt:read` and `feeplan:read`, which
exposed **organization-wide** finance data to every student. The fix replaced those with
a scoped `payment:self` permission; students and parents now reach their own fees only
through `/api/portal/me/fees` and `/api/portal/me/children/:studentId/fees`.

---

## Provider abstractions

These are real interfaces with a working local implementation, not stubs that pretend
to succeed.

**Storage** (`STORAGE_DRIVER`) — `local` in development. Video and document binaries are
written to disk, never into MongoDB; only keys and metadata are stored. Private files are
served through short-lived signed URLs (`/api/files/signed/:token`). S3, Cloudinary,
Vimeo and YouTube slot in behind the same interface.

**Payments** (`PAYMENT_PROVIDER`) — `manual` by default, so the whole fee workflow
(plans, instalments, payments, invoices, receipts, refunds) works with no gateway
credentials. Razorpay and Stripe share one interface; with the provider unconfigured,
online-order endpoints return `501 PROVIDER_NOT_CONFIGURED` instead of faking a success.

**Messaging** — email/SMS/WhatsApp return status `NOT_CONFIGURED` when no provider is
set. Delivery is never claimed for a message that was not actually sent.

---

## Notable business rules

- Admissions run in a **MongoDB transaction**: student, parent, enrolment, fee plan,
  instalments, first payment, invoice and receipt all commit together or not at all.
- Fee-plan instalments must sum to the net amount (±1). Payments must be positive and
  cannot exceed the outstanding balance; a payment without an instalment id is allocated
  oldest-first. A refund reopens the plan.
- Batch capacity is enforced server-side; a full batch rejects further enrolment.
- Class scheduling rejects teacher and room conflicts with `409`. Bulk generation is
  capped at 120 days and silently skips clashing slots.
- Attendance can only be marked by the assigned teacher (admins excepted).
- Results compute percentage, grade (A+ ≥ 90 … F < 40) and pass/fail on the server.
- Destructive actions degrade safely: a batch with enrolees is cancelled rather than
  deleted, a course with enrolments is archived, an exam with results refuses deletion.
- Plan limits (students, staff, courses, batches, videos, storage) are checked on every
  create and return `403 PLAN_LIMIT_EXCEEDED`.

---

## API conventions

Success: `{ "success": true, "data": { ... } }`
Failure: `{ "success": false, "error": { "code": "...", "message": "...", "fields": {} } }`

Lists return `{ items, page, limit, total, totalPages }`. Search, filtering, sorting and
pagination are all server-side. `limit` is capped at 100 per request.

Status codes in use: `400`, `401` (unauthenticated / bad credentials), `402`
(subscription inactive), `403` (forbidden / plan limit), `404`, `409` (conflict), `422`
(validation, with per-field messages), `429` (rate limited), `501` (provider not
configured), `500`.

---

## Seeded data

Three isolated academies — Brilliant Academy, ABC Coaching and Future Skills Academy —
with 190 users, 150 students, 100 parents, 10 teachers, 15 courses, 49 modules,
196 lessons, 196 videos, 30 batches, ~246 class sessions, 1,408 attendance records,
38 exams, 257 results, 26 assignments, 150 fee plans, 375 instalments, 179 payments,
50 leads, 76 follow-ups, announcements, notifications and 90 audit-log entries.

Every record belongs to exactly one organization.

---

## Environment

```ini
MONGO_URI=mongodb://127.0.0.1:27017/academyos?replicaSet=rs0&directConnection=true
JWT_SECRET=change-me-in-production
CLIENT_URL=http://localhost:5173
STORAGE_DRIVER=local
PAYMENT_PROVIDER=manual
TRIAL_DAYS=14
PORT=4000
```

Tests use a separate `academyos_test` database and wipe it between runs.
