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

**Required Upstash settings:**

- **TLS is mandatory.** The connection string must start with `rediss://`, not
  `redis://`. A plaintext URL will not connect, and because every store falls
  back to in-process memory, that failure is silent — the app keeps serving with
  per-instance state and nothing says why. The server logs its Redis target at
  startup (`🔴 Redis: <host> (Upstash, TLS)`) so this is visible; check that line
  after deploying.
- **Leave eviction disabled.** It is off by default, and it must stay off.
  Eviction is designed for cache data; this database also holds BullMQ job state,
  and evicting it drops queued work. Upstash rejects writes once the 256 MB limit
  is reached rather than evicting — the correct behaviour here.
- **Keys are namespaced by `NODE_ENV`.** Every cache entry, rate-limit counter,
  OTP, and the BullMQ queue name carries the environment as a prefix
  (`production:categories:all`, queue `ecom-jobs-production`). Without this a
  developer pointed at this `REDIS_URL` shares one keyspace with production — which
  during testing caused local rows to be written into the production response cache
  and served to API clients while the production database was empty, and let a local
  worker consume production jobs. Set `NODE_ENV=production` on Render or the
  namespace will read `development`.
- **A malformed `REDIS_URL` degrades, it does not crash.** Both clients are
  constructed defensively, so pasting the REST URL disables Redis and logs an
  error rather than failing the boot.

**On plan choice:** Upstash's own BullMQ guidance warns that "BullMQ accesses
Redis regularly, even when there is no queue activity. This can incur extra costs
because Upstash charges per request on the Pay-As-You-Go plan," and recommends a
Fixed plan for BullMQ workloads. That is why `drainDelay: 30` is tuned the way it
is — see the command-quota section below before changing it.

If `REDIS_URL` is unset the app still runs: every queue producer falls back to
doing the work inline, so behavior degrades to the pre-queue latency rather than
dropping jobs.

Redis also backs three request-path stores — rate-limit counters, password-reset
OTPs, and the product/category response cache. All three fall back to in-process
memory when `REDIS_URL` is unset **or when Redis is unreachable**, so an outage
costs shared state, not availability. Unsetting `REDIS_URL` reverts every one of
them to the pre-Redis behaviour with no code change; that is the escape hatch if
the command budget below becomes a problem.

### 3. Resend (email)

Create an API key, then **add and verify a sending domain** — this is the step
that gates real email. Until a domain is verified, Resend only accepts
`onboarding@resend.dev` as the sender and only delivers to the address that owns
the account, which is enough for a smoke test and useless for customers.

Set `RESEND_API_KEY` and `EMAIL_FROM` (an address on the verified domain) on Render.

The free tier allows **100 emails/day**. Order confirmations, shipping updates,
and password-reset codes all draw on that budget, so a busy day of orders is the
constraint to watch, not the monthly total.

Provider precedence is `RESEND_API_KEY` → SMTP → dev mock, mirroring the storage
service. Leaving all of them unset is supported: the mock writes `.html` files to
`./uploads/emails` and the app runs normally.

### 4. Cloudflare R2

Create a bucket and an API token, and expose the bucket publicly. `R2_PUBLIC_URL`
is the public base URL.

**Production refuses to boot without cloud storage.** Render's filesystem is
ephemeral, so a local-disk fallback would return URLs that 404 after the next
restart. The server exits non-zero at startup if `NODE_ENV=production` and
neither R2 nor Cloudinary is configured.

### 5. Render (API)

| Setting | Value |
|---|---|
| Root directory | *(repo root — the build uses npm workspaces)* |
| Build command | `npm install --include=dev && npm run build --workspace=server` |
| Start command | `npm start --workspace=server` |
| Health check path | `/health` |

`--include=dev` is load-bearing. `typescript`, `prisma`, and every `@types/*`
package are `devDependencies`, and npm omits those when `NODE_ENV=production` —
which this service sets. Without the flag the install drops from 418 packages to
303, taking `tsc` and `@types/node` with it, and the build dies in a wall of
`Cannot find name 'process'` / `Cannot find name 'console'` errors that look like
a tsconfig problem rather than a missing-install one.

If you set the root directory to `server` instead of the repo root, drop the
`--workspace=server` flag from both commands (`npm install --include=dev &&
npm run build`, and `npm start`) — `server/` is not a workspace root, so the flag
fails there with `No workspaces found`. That variant installs 418 packages rather
than the whole monorepo, but `server/` has no lockfile, so versions resolve fresh
on every build.

### 6. Vercel (web and admin)

Two separate projects from the same repository.

| Setting | `web` | `admin` |
|---|---|---|
| Root directory | `apps/web` | `apps/admin` |
| Framework | Next.js (auto-detected) | Next.js (auto-detected) |

**`R2_PUBLIC_URL` must be set as a build-time variable in both projects.**
`next.config.js` derives the image optimizer's allowed remote hosts from it at
build time. If it is missing during the build, every product image fails with an
"unconfigured host" error even though the value is present at runtime.

**Clerk is optional and mounts only when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is
set.** Clerk throws on a missing key, and because the integration is still
passive — the JWT-cookie auth remains the system of record — an unconditional
provider failed the prerender of every static page on any environment without the
key, which is exactly what CI is. Both apps now guard the provider, the
middleware, and the sign-in controls on that variable, mirroring the API. Set it
in Vercel to show the Clerk controls; leave it unset and the apps build and run
on JWT-cookie auth alone.

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
| `SERVER_BASE_URL` | no | Only read by the local-disk storage branch, which production never reaches. Harmless to set; nothing on Render reads it |
| `R2_ACCOUNT_ID` | yes\* | \*R2 or Cloudinary required in production |
| `R2_ACCESS_KEY_ID` | yes\* | |
| `R2_SECRET_ACCESS_KEY` | yes\* | |
| `R2_BUCKET_NAME` | yes\* | |
| `R2_PUBLIC_URL` | yes\* | |
| `CLOUDINARY_CLOUD_NAME` | alt | Fallback if R2 unset |
| `CLOUDINARY_API_KEY` | alt | |
| `CLOUDINARY_API_SECRET` | alt | |
| `RESEND_API_KEY` | yes\*\* | \*\*Preferred email provider. Unset ⇒ falls back to SMTP, then to a dev mock |
| `EMAIL_FROM` | yes\*\* | Must be on a domain verified in Resend |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | optional | Fallback only, used when `RESEND_API_KEY` is unset. Email no-ops if neither is set |
| `LOGISTICS_WEBHOOK_SECRET` | optional | Verifier fails closed — while unset, `/webhooks/logistics` rejects every request |
| `PAYMENTS_MOCK` | **must be unset** | Dev/test only — bypasses signature verification |

### Vercel (`web`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Render API URL + `/api/v1`. SSR fetches only |
| `R2_PUBLIC_URL` | yes | **Build-time.** See above |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | no | Enables the Clerk sign-in controls. Unset ⇒ Clerk does not mount and the JWT-cookie auth is used alone |
| `CLERK_SECRET_KEY` | no | Required only if the publishable key is set |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | no | Optional overrides |

Clerk is optional — see above. No Razorpay key is needed here — checkout receives it
from the API's create-order response, so the key exists only as the server's
`RAZORPAY_KEY_ID`. Store name comes from `Store.config.json`, not env.

### Vercel (`admin`)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Render API URL + `/api/v1`. SSR fetches only |
| `R2_PUBLIC_URL` | yes | **Build-time.** See above |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | no | Enables the Clerk sign-in controls. Unset ⇒ Clerk does not mount and the JWT-cookie auth is used alone |
| `CLERK_SECRET_KEY` | no | Required only if the publishable key is set |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | no | Optional overrides |

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

**Upstash command quota — this is now a traffic ceiling, not just a worker
budget.** The free tier allows **500,000 commands/month** (≈16,700/day).

The worker's `drainDelay: 30` caps idle polling at roughly 2 blocking reads per
minute (~2,880/day ≈ 86,400/month), leaving ≈413,600/month for everything else.
Since rate limiting moved to Redis, **every `/api/v1/*` request spends at least
one command**, and product/category requests spend a second on the response
cache:

| Consumer | Commands |
|---|---|
| Worker idle polling | ~2,880/day |
| Rate limiter (every API request) | 1 |
| Response cache (product/category) | 1 hit, 2 on miss |
| OTP set/verify | 1–2 per password reset |

At a blended ~1.5 commands per request that is roughly **9,200 API requests/day**,
and since a storefront page view makes 4–6 API calls, roughly **1,800 page
views/day**.

This ceiling did not exist before these stores moved to Redis, and it is a
deliberate, accepted trade. If you approach it, in order of preference: revert
the response cache to in-process (it has no correctness value — the cache is a
latency optimisation and behaves identically either way), then the rate limiter,
or move off the free tier. Unsetting `REDIS_URL` reverts everything at once.

Raising worker concurrency or lowering `drainDelay` also raises the number —
check the quota before changing either.

**Rate limiting is shared across instances when `REDIS_URL` is set.** Counters
live in Redis via a single Lua `EVAL` per request (one command, not three). If
Redis is unreachable the limiter **fails open** to per-instance memory counting:
enforcement degrades to what it was before, rather than locking users out of a
working store because a cache is down. That is a deliberate choice — see the
`redis-shared-state-v1` plan artifact.

**OTPs survive restarts when `REDIS_URL` is set.** Password-reset OTPs are
written to Redis with a 600s TTL *and* to in-process memory. Previously they were
memory-only, which was actively broken on this topology: the 10-minute OTP TTL is
shorter than the ~15-minute idle spin-down, so the sequence "request OTP → open
email → return" routinely woke a fresh instance holding no code, and the user got
`INVALID_OTP` for a code that had not expired.

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
