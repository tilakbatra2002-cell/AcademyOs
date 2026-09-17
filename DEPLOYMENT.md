# AcademyOS — production deployment runbook

Target architecture:

```
https://academyos.webamazee.com   (Vercel: React + Vite static SPA)
            |  fetch(`${VITE_API_URL}/api/...`, { credentials: 'include' })
            v
https://<YOUR-API-DOMAIN>          (Node 20 + Express, this repo's server/)
            |  mongoose
            v
MongoDB Atlas                      (replica set — transactions are required)
```

Everything in this document has been verified against the compiled production
artifact (`server/dist`) except the two steps that need your accounts: creating
the Atlas cluster and creating the hosting service.

---

## 0. Prerequisites

* A MongoDB Atlas account.
* An account on one Node host — Render, Railway, Fly.io, or any Docker host.
* Access to the Vercel project serving `academyos.webamazee.com`.

Nothing in this repository contains credentials. Every secret is supplied
through the host's environment-variable UI or CLI.

---

## 1. MongoDB Atlas

1. Create a cluster (the free M0 tier is enough to start).
2. **Database Access** → add a user with `readWrite` on the `academyos` database.
   Use a generated password.
3. **Network Access** → allow the egress IPs of your API host. Render and
   Railway do not publish stable egress IPs on their lower tiers, so `0.0.0.0/0`
   is commonly required there; Fly.io can be locked down to its region IPs.
4. Copy the **SRV connection string** and append the database name:

   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/academyos?retryWrites=true&w=majority
   ```

   Atlas clusters are replica sets by default, which this app requires:
   admissions, lead conversion and fee payments all run inside transactions.

> The app creates its own indexes from the Mongoose schemas on first connect.
> No manual index step is needed.

---

## 2. Deploy the API

Pick **one** of the following. All four were prepared and syntax-checked.

### Option A — Render (blueprint committed: `render.yaml`)

1. Render Dashboard → **New** → **Blueprint** → select this repository.
2. Render reads `render.yaml`: root directory `server`, build
   `npm ci && npm run build`, start `npm start`, health check `/api/health`.
3. Set the two secret env vars (marked `sync: false`) in the dashboard:
   `MONGO_URI`, `JWT_SECRET`.
4. Deploy, then note the service URL, e.g. `https://academyos-api.onrender.com`.

### Option B — Railway (`server/railway.json`)

```bash
railway init
railway up                      # builds server/Dockerfile
railway variables set MONGO_URI=... JWT_SECRET=... \
  NODE_ENV=production CLIENT_URL=https://academyos.webamazee.com \
  COOKIE_SECURE=true COOKIE_SAMESITE=none
railway domain                  # note the generated URL
```

### Option C — Fly.io (`server/fly.toml`, region `bom`/Mumbai)

```bash
cd server
fly launch --no-deploy          # keep the committed fly.toml
fly secrets set MONGO_URI=... JWT_SECRET=...
fly deploy
```

### Option D — any Docker host (`server/Dockerfile`)

```bash
docker build -t academyos-api ./server
docker run -d -p 4000:4000 \
  -e NODE_ENV=production \
  -e MONGO_URI=... -e JWT_SECRET=... \
  -e CLIENT_URL=https://academyos.webamazee.com \
  -e COOKIE_SECURE=true -e COOKIE_SAMESITE=none \
  academyos-api
```

The image is multi-stage: TypeScript/tsx/vitest stay in the builder, the
runtime layer holds only production dependencies, runs as the non-root `node`
user, and uses `dumb-init` so `SIGTERM` reaches Node and the graceful-shutdown
handler runs.

---

## 3. API environment variables

Names only — never commit the values.

| Variable | Required | Production value |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `MONGO_URI` | yes | Atlas SRV string — **secret** |
| `JWT_SECRET` | yes | long random string — **secret** |
| `CLIENT_URL` | yes | `https://academyos.webamazee.com` |
| `COOKIE_SECURE` | yes | `true` |
| `COOKIE_SAMESITE` | yes | `none` |
| `PORT` | no | injected by the host; falls back to 4000 |
| `COOKIE_DOMAIN` | no | only for a sibling-subdomain API |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | no | `12h` / `7d` |
| `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_MAX` | no | defaults are sane |
| `STORAGE_DRIVER` | no | `local`; `s3`/`cloudinary` need their own keys |
| `PAYMENT_PROVIDER` | no | `manual` (no gateway credentials needed) |
| `TRIAL_DAYS` | no | `14` |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`CLIENT_URL` drives the CORS allowlist, so it must be the **exact** origin with
no trailing slash. `COOKIE_SECURE=true` + `COOKIE_SAMESITE=none` are mandatory
because the SPA and API are on different registrable domains — without both,
the browser silently discards the auth cookies and every request looks logged
out.

---

## 4. Seed the production database (optional, one-off)

The compiled seeder ships in the image:

```bash
node dist/seed/seed.js
```

It **wipes** the target database and inserts the 3-academy demo dataset, then
prints the login table. Run it only against a database you are happy to reset.

---

## 5. Point the frontend at the API

In the Vercel project for `academyos.webamazee.com`:

* Settings → Environment Variables → add
  `VITE_API_URL = https://<YOUR-API-DOMAIN>` (no trailing slash, no `/api`
  suffix — the client appends `/api` itself) for **Production** (and Preview).
* Settings → Build & Deployment:
  * Root Directory `client`
  * Framework Preset `Vite`
  * Build Command `npm run build`
  * Output Directory `dist`
  * remove any manual `vite build` override
* **Redeploy.** `VITE_*` values are inlined at build time, so changing the
  variable has no effect until a new build runs.

Verify the deployed bundle actually points at the API:

```bash
JS=$(curl -s https://academyos.webamazee.com/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "https://academyos.webamazee.com$JS" | grep -o 'https://<YOUR-API-DOMAIN>'
```

---

## 6. Post-deploy verification

```bash
API=https://<YOUR-API-DOMAIN>
ORIGIN=https://academyos.webamazee.com

# 1. health
curl -i $API/api/health                      # expect 200, database.state=connected

# 2. CORS preflight from the real frontend origin
curl -i -X OPTIONS $API/api/auth/login \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
# expect 204 + Access-Control-Allow-Origin: $ORIGIN
#             + Access-Control-Allow-Credentials: true

# 3. login — inspect the cookie flags
curl -i -X POST $API/api/auth/login -H "Origin: $ORIGIN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@academyos.com","password":"...","portal":"owner"}'
# expect Set-Cookie: aos_at=...; HttpOnly; Secure; SameSite=None

# 4. session persistence
curl -i -b cookies.txt $API/api/auth/me      # expect 200 with the user
```

In the browser, confirm all five deep links load and authenticate:
`/owner/login`, `/admin/login`, `/teacher/login`, `/student/login`,
`/parent/login`.

---

## 7. Operational notes

* **Cold starts.** Render's free tier sleeps; the in-process schedulers
  (overdue fees, trial expiry, reminders) only run while the process is alive.
  Use a paid/always-on tier if those jobs matter.
* **Local file storage is ephemeral.** `STORAGE_DRIVER=local` writes to the
  container filesystem, which is wiped on every deploy. Switch to `s3` or
  `cloudinary` before accepting real uploads.
* **Safari / ITP.** Third-party cookies with `SameSite=None` can be blocked by
  strict privacy settings. The durable fix is to host the API on a sibling
  subdomain (`api.webamazee.com`) and set `COOKIE_DOMAIN=.webamazee.com`, which
  makes the cookies first-party.
