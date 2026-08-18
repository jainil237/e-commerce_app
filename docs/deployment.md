# Deployment

Three independently deployed services, all on free tiers.

| Service | Host | Notes |
|---|---|---|
| `apps/web` | Vercel | Storefront |
| `apps/admin` | Vercel | Admin dashboard |
| `server` | Render | Express API + in-process queue worker |
| Database | TiDB Serverless | MySQL wire-compatible |
| Queue | Upstash Redis | BullMQ backend |
| Object storage | Cloudflare R2 | Product images, invoice PDFs |

## Why this split

The API is not on Vercel because Render runs a long-lived process, which the
queue worker needs — Render's free tier has no background-worker service type,
so the worker runs *inside* the web service. Serverless functions would also
have made Prisma connection pooling and the raw-body Razorpay webhook harder to
get right.

## Session isolation

`web` and `admin` deploy to sibling subdomains. Both apps send browser requests
to their own relative `/api/*` path, which each app's `next.config.js` rewrites
server-side to the API. Auth cookies therefore land **host-only on each app's
own origin**, so a customer session on `web` and an admin session on `admin` can
be held simultaneously in one browser without collision.

This is load-bearing. Do not point browser-side authenticated `fetch` calls at
an absolute cross-origin API URL — that would place one cookie jar under both
apps and collapse the isolation. `NEXT_PUBLIC_API_URL` is for server-side/SSR
fetches only.

## Provisioning

### 1. TiDB Serverless

Create a cluster, then take its connection string. TiDB requires TLS — use the
parameters TiDB's console gives you verbatim.

`schema.prisma` keeps `provider = "mysql"`; no schema change is needed.

Apply migrations:

```bash
DATABASE_URL='<tidb-connection-string>' npm run db:migrate:deploy --workspace=server
```

**Note on isolation:** TiDB implements `SERIALIZABLE` as snapshot isolation
rather than true serializability. The RMA transactions therefore use explicit
`SELECT ... FOR UPDATE` row locks instead of an isolation-level hint. Do **not**
set `tidb_skip_isolation_level_check` — it silences the incompatibility instead
of fixing it, leaving the code looking like it requests a guarantee it does not get.

### 2. Upstash Redis

Create a database and take the **`rediss://` TCP connection string**, not the
REST URL — BullMQ uses ioredis, which cannot speak Upstash's REST API.

Set it as `REDIS_URL` on Render.

If `REDIS_URL` is unset the app still runs: every queue producer falls back to
doing the work inline, so behavior degrades to the pre-queue latency rather than
dropping jobs.

### 3. Cloudflare R2

Create a bucket and an API token, and expose the bucket publicly. `R2_PUBLIC_URL`
is the public base URL.

**Production refuses to boot without cloud storage.** Render's filesystem is
ephemeral, so a local-disk fallback would return URLs that 404 after the next
restart. The server exits non-zero at startup if `NODE_ENV=production` and
neither R2 nor Cloudinary is configured.

### 4. Render (API)

| Setting | Value |
|---|---|
| Root directory | *(repo root — the build uses npm workspaces)* |
| Build command | `npm install && npm run build --workspace=server` |
| Start command | `npm start --workspace=server` |
| Health check path | `/health` |

### 5. Vercel (web and admin)

Two separate projects from the same repository.

| Setting | `web` | `admin` |
|---|---|---|
| Root directory | `apps/web` | `apps/admin` |
| Framework | Next.js (auto-detected) | Next.js (auto-detected) |

**`R2_PUBLIC_URL` must be set as a build-time variable in both projects.**
`next.config.js` derives the image optimizer's allowed remote hosts from it at
build time. If it is missing during the build, every product image fails with an
"unconfigured host" error even though the value is present at runtime.

## Environment variables

Names only — see each service's `.env.example` / `.env.local.example` for the
full annotated list. Never commit real values.

### Render (`server`)

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `DATABASE_URL` | yes | TiDB connection string, TLS params included |
| `JWT_SECRET` | yes | |
| `JWT_REFRESH_SECRET` | yes | |
| `RAZORPAY_KEY_ID` | yes | |
| `RAZORPAY_KEY_SECRET` | yes | |
| `RAZORPAY_WEBHOOK_SECRET` | yes | |
| `REDIS_URL` | recommended | Upstash `rediss://`. Unset ⇒ jobs run inline |
| `FRONTEND_URL` | yes | Real Vercel origin of `web`; feeds the CORS allowlist |
| `ADMIN_URL` | yes | Real Vercel origin of `admin`; feeds the CORS allowlist |
| `SERVER_BASE_URL` | yes | The Render service URL |
| `R2_ACCOUNT_ID` | yes\* | \*R2 or Cloudinary required in production |
| `R2_ACCESS_KEY_ID` | yes\* | |
| `R2_SECRET_ACCESS_KEY` | yes\* | |
| `R2_BUCKET_NAME` | yes\* | |
| `R2_PUBLIC_URL` | yes\* | |
| `CLOUDINARY_CLOUD_NAME` | alt | Fallback if R2 unset |
| `CLOUDINARY_API_KEY` | alt | |
| `CLOUDINARY_API_SECRET` | alt | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | optional | Email no-ops if unset |
| `LOGISTICS_WEBHOOK_SECRET` | optional | |
| `PAYMENTS_MOCK` | **must be unset** | Dev/test only — bypasses signature verification |

### Vercel (`web`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Render API URL + `/api/v1`. SSR fetches only |
| `R2_PUBLIC_URL` | yes | **Build-time.** See above |

That is the whole list. No Razorpay key is needed here — checkout receives it
from the API's create-order response, so the key exists only as the server's
`RAZORPAY_KEY_ID`. Store name comes from `Store.config.json`, not env.

### Vercel (`admin`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Render API URL + `/api/v1`. SSR fetches only |
| `R2_PUBLIC_URL` | yes | **Build-time.** See above |

## Operational behaviour to expect

**Cold starts.** Render free web services spin down after ~15 minutes idle and
take roughly 50 seconds to wake. The first visitor after a quiet period waits.

**The queue worker sleeps with the service.** It runs in-process, so it stops
consuming while spun down and resumes on the next request that wakes the
service. Nothing depends on punctual execution:

- The reservation sweeper is *cleanup only*. Availability already ignores lapsed
  reservations at read time, so a delayed sweep never oversells — rows just sit
  in `ACTIVE` a while longer.
- Order confirmation and shipping emails are queued with retries and backoff, so
  a delayed pickup means a late email, not a lost one.

**Upstash command quota.** BullMQ polls Redis continuously and Upstash bills per
command. The worker sets `drainDelay: 30`, capping idle polling at roughly 2
blocking reads per minute per worker (~2,880/day), which sits inside the free
daily allotment. Raising concurrency or lowering `drainDelay` raises that
number — check the quota before changing either.

**Rate limiting is per-instance.** `express-rate-limit` keeps counters in memory.
With a single free-tier instance this is accurate; it would under-enforce if the
service were ever scaled out.

**OTPs are held in memory.** Password-reset OTPs live in an in-process
`NodeCache`, so a restart or spin-down discards pending codes and the user must
request a new one.

## Verification after deploying

```bash
# API is up
curl https://<render-service>/health

# Migrations applied
DATABASE_URL='<tidb-connection-string>' npx prisma migrate status --schema server/prisma/schema.prisma
```

Then, in one browser:

1. Log in on `web` as a customer.
2. Log in on `admin` as an admin, in another tab.
3. Reload both. Both sessions must remain valid.
4. In devtools, confirm the `accessToken` / `refreshToken` cookies on each
   origin have **no `Domain` attribute** — host-only is what keeps them isolated.
