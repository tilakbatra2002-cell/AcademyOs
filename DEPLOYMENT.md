# AcademyOS — production deployment runbook (Vercel, single project)

AcademyOS deploys as **one Vercel project, one origin**: the React/Vite SPA is
served as static files and the entire Express API runs as a Vercel Function.

```
https://<your-domain>
  |
  |-- /                      -> client/dist  (static SPA, SPA fallback)
  |-- /api/*                 -> api/index.ts (Vercel Function, whole Express app)
  |-- /api/cron              -> api/cron.ts  (Vercel Cron, Bearer-protected)
                                   |
                                   |  mongoose
                                   v
                              MongoDB Atlas (replica set — transactions required)
```

Because the SPA and the API share an origin, the browser calls **relative
`/api/...` URLs**, and the JWT cookies are **first-party** (`SameSite=Lax`).
There is no CORS preflight, no third-party-cookie problem and no Safari/ITP
exposure. `VITE_API_URL` is intentionally **left empty**.

---

## Repository layout that Vercel expects

| Path            | Role |
| --------------- | ---- |
| `vercel.json`   | Build, routing, function sizing and cron schedule |
| `package.json`  | Root manifest — supplies the **runtime dependencies of the Function** |
| `api/index.ts`  | Serverless entrypoint; imports `createApp()`, never calls `listen()` |
| `api/cron.ts`   | Scheduled-job endpoint, requires `Authorization: Bearer $CRON_SECRET` |
| `server/`       | The unchanged Express application (routes → controllers → services → models) |
| `client/`       | The Vite SPA; built to `client/dist` |

> The root `package.json` is not decoration. Vercel installs dependencies from
> the **Root Directory**, and the Function bundles `server/src/**`, so the
> server's runtime dependencies (express, mongoose, argon2, zod, …) must be
> declared there or the Function fails to boot with `MODULE_NOT_FOUND`.

---

## 0. Prerequisites

* A MongoDB Atlas account (the free M0 tier is enough to start).
* A Vercel account with this repository connected.

Nothing in this repository contains credentials. Every secret is supplied
through the Vercel environment-variable UI or CLI.

---

## 1. MongoDB Atlas

1. Create a cluster.
2. **Database Access** → add a user with `readWrite` on the `academyos` database.
3. **Network Access** → Vercel Functions do **not** have stable egress IPs on
   standard plans, so allow `0.0.0.0/0` (the database user + TLS remain the
   security boundary). Use a Dedicated IP / PrivateLink add-on if you need to
   lock this down.
4. Copy the **SRV connection string** and append the database name:

   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/academyos?retryWrites=true&w=majority
   ```

   Atlas clusters are replica sets by default, which this app requires:
   admissions, lead conversion and fee payments all run inside transactions.

> The app creates its own indexes from the Mongoose schemas on first connect.

**Connection pooling:** serverless instances each hold their own pool. Keep
`MONGO_MAX_POOL_SIZE` small (5 is a good default) so many warm instances do not
exhaust the ~500-connection limit of an M0/M2 cluster.

---

## 2. Vercel project settings

| Setting              | Value |
| -------------------- | ----- |
| **Root Directory**   | `.` (the repository root — **not** `client`) |
| **Framework Preset** | Other |
| Build Command        | from `vercel.json` (leave blank in the UI) |
| Output Directory     | from `vercel.json` (leave blank in the UI) |
| Node.js Version      | 20.x or 22.x |

> If this project previously deployed with Root Directory = `client`, you must
> change it. With `client` as the root, Vercel never sees `api/`, so every
> `/api/*` request falls through to the static router and returns
> `x-vercel-error: NOT_FOUND` — the SPA loads but nothing works.

---

## 3. Environment variables

Set these in **Project → Settings → Environment Variables** (Production and
Preview).

### Required

| Variable      | Notes |
| ------------- | ----- |
| `MONGO_URI`   | 🔒 Atlas SRV string from step 1 |
| `JWT_SECRET`  | 🔒 long random string, e.g. `openssl rand -base64 48` |
| `NODE_ENV`    | `production` |
| `CRON_SECRET` | 🔒 random string; `/api/cron` refuses to run without it |

### Do NOT set

| Variable          | Why |
| ----------------- | --- |
| `VITE_API_URL`    | Must stay **empty**. The SPA calls relative `/api/...`. Setting it re-introduces the cross-origin architecture this deployment removes. |
| `CLIENT_URL`, `COOKIE_SECURE`, `COOKIE_SAMESITE` | Unnecessary same-origin. Cookies are already `Secure` + `HttpOnly` + `SameSite=Lax`. |
| `PORT`            | Vercel owns the socket; the Function never listens. |

### Optional

`JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`,
`TRIAL_DAYS`, `PAYMENT_PROVIDER`, `MONGO_MAX_POOL_SIZE`, and the storage
variables below.

---

## 4. File storage — required before you accept uploads

Vercel Functions have an **ephemeral, read-only-ish filesystem**: anything
written to disk disappears when the instance is recycled and is not shared
between instances. The local-disk storage driver is therefore **development
only** and must not be used in production on Vercel.

Set a real driver:

```
STORAGE_DRIVER=s3
S3_BUCKET=...
S3_REGION=...
S3_ACCESS_KEY_ID=...        # 🔒
S3_SECRET_ACCESS_KEY=...    # 🔒
```

or `STORAGE_DRIVER=cloudinary` with the Cloudinary credentials. The storage
abstraction (`server/src/services/storage/`) is unchanged, so document, video
and material uploads keep working once a driver is configured. Uploads are
parsed in memory (multer memory storage) and streamed to the provider, so
nothing depends on local disk.

**Request-body limit:** Vercel caps a Function request body at ~4.5 MB. Larger
media must use a direct-to-provider upload (S3 presigned POST / Cloudinary
signed upload) rather than passing through the Function.

---

## 5. Scheduled jobs (Vercel Cron)

The four background jobs (`overdueFees`, `trialExpiry`, `reminders`,
`closeStaleClasses`) cannot run on `setInterval` in a serverless runtime: the
instance is frozen between requests, so timers do not fire reliably. They are
therefore driven by **Vercel Cron**, declared in `vercel.json`:

```json
"crons": [{ "path": "/api/cron", "schedule": "0 2 * * *" }]
```

* Runs daily at 02:00 **UTC**.
* Vercel sends the `Authorization: Bearer $CRON_SECRET` header; `api/cron.ts`
  rejects anything else with 401 and refuses to run at all (503) if
  `CRON_SECRET` is unset — it fails closed.
* Each job is isolated: one failure does not abort the others, and the response
  reports per-job status.
* Cron is available on Hobby (limited) and Pro plans; confirm the schedule
  appears under **Project → Cron Jobs** after deploying.

`startJobs()` still exists and still runs under `npm start` (`server/src/index.ts`),
so a traditional always-on host keeps its in-process scheduler.

---

## 6. Deploy

```bash
git push origin main       # Vercel builds automatically
# or
npx vercel --prod
```

Build sequence (from `vercel.json`): `npm install && npm --prefix client ci`
then `npm --prefix client run build`, output `client/dist`.

---

## 7. Post-deploy verification

Run these against the real domain. Do not declare success until they pass.

```bash
BASE=https://<your-domain>

# 1. API is alive and talking to Atlas — must be JSON, not HTML.
curl -s $BASE/api/health | jq
#    expect: {"success":true,"data":{"status":"ok","database":{"state":"connected"}}}

# 2. The old failure mode: a 404 HTML page here means the Function is not wired.
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $BASE/api/health
#    expect: 200 application/json...

# 3. Login sets first-party httpOnly cookies.
curl -s -D - -o /dev/null -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@academyos.com","password":"Owner@12345","portal":"owner"}' \
  | grep -i set-cookie
#    expect: aos_at=...; HttpOnly; Secure; SameSite=Lax

# 4. SPA deep links render the app, not a 404.
curl -s -o /dev/null -w '%{http_code}\n' $BASE/owner/login
```

Then in a browser: log in at `/owner/login`, confirm the dashboard shows real
numbers, open DevTools → Network and confirm every API call goes to
`<your-domain>/api/...` (relative, same-origin) and **not** to any other host.

To verify cron, trigger it manually:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron | jq
```

---

## 8. Seeding production

Seeding runs from your machine against the production `MONGO_URI`; it is not a
Function. **It wipes and recreates the demo data** — never run it against a
database with real customer records.

```bash
cd server
MONGO_URI='mongodb+srv://...' npm run seed
```

For a genuine production launch, create the first organization and admin
through the owner portal instead.

---

## 9. Local development

Two processes, as before — the serverless shape does not change local dev:

```bash
cd server && npm run dev     # Express on :4000 (with in-process jobs)
cd client && npm run dev     # Vite on :5173, proxies /api -> :4000
```

To exercise the **deployed** routing locally (static SPA + Function + SPA
fallback on one origin):

```bash
npm --prefix client run build
npx tsc -p tsconfig.json --noEmit false --outDir .vbuild --rootDir . --declaration false
NODE_ENV=production MONGO_URI='...' JWT_SECRET='...' CRON_SECRET='...' \
  node scripts/vercel-sim.cjs 3000
node e2e/vercel-shape.cjs http://127.0.0.1:3000
```

---

## 10. Known serverless trade-offs

| Area | Behaviour |
| ---- | --------- |
| **Cold starts** | First request after idle pays connection setup (~1–2 s). The Mongo connection promise is cached in module scope and reused by warm invocations. |
| **Rate limiting** | `express-rate-limit` uses an in-memory store, so counters are per-instance and reset on cold start. Limits are therefore approximate. Use a Redis store (e.g. Upstash) for strict enforcement. |
| **Local disk** | Ephemeral — see §4. Configure S3/Cloudinary. |
| **Body size** | ~4.5 MB per request — see §4. |
| **`maxDuration`** | 30 s for `/api/*`, 60 s for cron (`vercel.json`). Long CSV imports may need chunking. |
| **Transactions** | Fully supported; Atlas is a replica set. Unchanged from the always-on deployment. |
