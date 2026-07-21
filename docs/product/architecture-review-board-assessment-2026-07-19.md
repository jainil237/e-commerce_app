# Architecture Review Board — Engineering Assessment

**Date:** 2026-07-19
**Scope:** Entire repository (`server`, `apps/web`, `apps/admin`, `shared`, config, workflow)
**Engagement type:** Documentation-only. No code was modified. All recommendations are future work.
**Reviewed by:** Independent Architecture Review Board (Distinguished Engineer, Principal Software Architect, Principal Security Architect, Staff Platform Engineer, Senior SRE, Performance Engineer, Technical Product Architect)

**Relationship to prior audit:** `docs/product/architecture-audit-and-refactor-plan.md` (an earlier three-part audit) already registers many findings. This assessment independently re-verified the highest-impact items against current code, marks which remain live, and adds new findings not in that register — most importantly a payment-verification order-binding flaw (SEC-1) that the prior audit does not cover.

---

# 1. Executive Summary

| Dimension | Score (of 10) | Basis |
|---|---|---|
| Overall health | **5.0** | Functionally rich MVP; correctness and operational gaps in the money path |
| Architecture | 5.5 | Clean monorepo shape; no domain layer; 37 KB route-file god objects |
| Security | **4.0** | Solid auth foundations undermined by payment-verification binding flaw and fail-open mock modes |
| Maintainability | 5.0 | Consistent patterns, good docs volume; zero tests, heavy duplication in route handlers |
| Scalability | 4.5 | Stateless-ish API but in-memory OTP/rate-limit state and per-item query loops block horizontal scale |
| Operational maturity | **2.5** | No CI, no containers, no metrics/tracing/alerting, no backup/DR strategy |
| Engineering maturity | 4.0 | Strong workflow/docs discipline; no automated testing or delivery pipeline |

**Top strengths**

1. Coherent, well-indexed monorepo with genuinely shared code (`shared/pages` with `viewer` context prop avoids web/admin duplication).
2. Correct auth fundamentals: bcrypt(12), httpOnly cookies, refresh-token rotation with DB-backed revocation (`server/src/routes/auth.routes.ts:320-376`), session revocation on password reset.
3. RMA subsystem is the best-engineered domain: transactional service class, Serializable isolation on money paths, idempotent refund guard, consistent audit-log writes (`server/src/services/rma.service.ts`).
4. Row-level `SELECT … FOR UPDATE` locking with sorted-ID deadlock avoidance at checkout (`server/src/routes/order.routes.ts:68-88`).
5. Storage abstraction with graceful degradation (R2 → Cloudinary → local disk) and email service that no-ops safely when unconfigured.
6. Unusually strong documentation culture: prior 100 KB audit, MVP gap registers, lifecycle workflow, per-page briefs.

**Top risks**

1. **SEC-1 (Critical, new):** `POST /orders/verify-payment` does not bind the submitted Razorpay order id to the database order — a valid signature from any cheap paid order can mark any of the attacker's unpaid orders as PAID.
2. **SEC-2 (Critical):** Payment signature verification fails open in "mock mode" triggered purely by env-var shape; a production misconfiguration silently disables payment verification.
3. **INV-1 (High):** Stock is hard-decremented at order creation with no release for abandoned PENDING orders; the `StockReservation` model that was designed to solve this is entirely unused. Inventory bleeds until manual intervention.
4. **OPS-1 (High):** No tests, no CI, no containerization, no observability. Every release is a manual, unverified deployment of a payment-handling system.
5. **SEC-3 (High, pre-registered as P0-3, still live):** Webhook HMAC computed over `JSON.stringify(req.body)` rather than the raw body — legitimate Razorpay webhooks can fail verification, and verification correctness depends on serializer coincidence.

---

# 2. System Overview

**Purpose:** Full-stack e-commerce platform for physical goods in the Indian market (INR, GST, Razorpay, Indian courier partners): storefront, admin dashboard, REST API, returns/replacements (RMA), invoicing, transactional email.

**Architecture style:** Modular monolith API + two BFF-less Next.js frontends calling it directly (via Next rewrites `/api/* → server`). No queues, no workers, no cache tier. Single MySQL database.

**Technology stack:** Node ≥20, TypeScript 5.3, Express **5.0.0-beta.1**, Prisma 5 + MySQL, Zod, JWT (httpOnly cookies), Razorpay, Nodemailer, PDFKit, Next.js 14 App Router, React 18, SWR, SCSS-BEM (migrating off Tailwind), D3/Recharts (admin).

```
                ┌──────────────────┐        ┌──────────────────┐
                │  apps/web :3000  │        │ apps/admin :3001 │
                │  Next 14 + SWR   │        │  Next 14 + SWR   │
                └────────┬─────────┘        └────────┬─────────┘
                         │  /api/* rewrite (cookies) │
                         ▼                           ▼
                ┌────────────────────────────────────────────┐
                │            server :4000 (Express 5)        │
                │  /api/v1/{auth,products,cart,orders,       │
                │   coupons,admin,rma,webhooks,...}          │
                │  route files = validation + business logic │
                │  services: rma, storage, email, invoice    │
                └───────┬───────────┬───────────┬────────────┘
                        │           │           │
              ┌─────────▼──┐  ┌─────▼─────┐  ┌──▼─────────────┐
              │ MySQL      │  │ Razorpay  │  │ Storage:       │
              │ (Prisma 5) │  │ + webhook │  │ R2→Cloudinary→ │
              └────────────┘  └───────────┘  │ local disk     │
                    ▲                        └────────────────┘
                    │              ┌──────────────┐ ┌─────────┐
                    └──────────────│ SMTP (email) │ │ Courier │
                                   └──────────────┘ │ webhook │
                                                    └─────────┘
```

**High-level request flow (checkout):** web cart (localStorage) → `POST /cart/validate-checkout` (row-locked stock check) → `POST /orders` (row-locked stock **decrement**, coupon check, Razorpay order create, DB order PENDING) → client-side Razorpay checkout → `POST /orders/verify-payment` (HMAC check, order → PAID/CONFIRMED, invoice PDF, email) — with `POST /webhooks/razorpay` as the asynchronous confirmation path duplicating much of this logic.

**Key shared components:** `shared/types`, `shared/components/UIPrimitives.tsx`, `shared/pages/*` (viewer-context pattern), `config/store.config.json` runtime config.

---

# 3. Architecture Assessment

## Strengths

- **Module boundaries at the deployable level are clean.** Three deployables with a single shared source-level library; dependency direction is uniformly frontend → API → DB; no circular dependencies observed at package level.
- **The viewer-context pattern** (`shared/pages/order/OrderDetailsPage.tsx` taking `viewer: 'customer' | 'admin'`) is a deliberate, working answer to web/admin duplication.
- **RMA is a template for where the rest of the server should go:** `RmaService` static class, `$transaction` everywhere, explicit isolation levels, audit log in every mutation, idempotency guard on refunds (`rma.service.ts:317-322`).
- **Config externalization** (`config/store.config.json`) keeps store-brand and business values out of code.

## Weaknesses and architecture smells

1. **No domain/service layer for the core commerce domain.** Orders, coupons, stock, and payment confirmation live inline in route files. `admin.routes.ts` is 37 KB and is the platform's de facto operations engine (products, categories, orders, shipments, coupons, inventory). (Pre-registered P2-1; confirmed live.)
2. **Payment confirmation logic is duplicated in two places with drift.** `verify-payment` (order.routes.ts:256-391) and the webhook `payment.captured` branch (webhook.routes.ts:67-103) both mark orders paid, generate invoices, and email — but **only verify-payment increments coupon usage**, and **neither writes an `OrderAuditLog`**, violating the repo's own stated invariant ("Order status mutations must write an OrderAuditLog entry" — CLAUDE.md). Webhook-confirmed orders never consume coupon quota.
3. **Design–implementation drift (documentation lies):**
   - CLAUDE.md: "stock is soft-locked during checkout via `StockReservation`". Reality: `StockReservation` appears only in `schema.prisma:219-236`; zero references in `server/src` (verified by grep). Checkout hard-decrements stock (order.routes.ts:69-88). (Pre-registered P1-10; live.)
   - CLAUDE.md: cart is "server-synced". Reality: cart is localStorage-only (`apps/web/src/contexts/cart.context.tsx`); server exposes only stateless `snapshot`/`validate-checkout` endpoints.
   - CLAUDE.md: "`Store.config.json` at repo root loaded at runtime". Reality: the loader reads `../config/store.config.json` relative to cwd (`server/src/utils/config.ts`), and the two files have drifted — root `Store.config.json` lacks `features.emailService`, which the code requires. Two sources of truth for business config.
   - `features.guestCheckout: true`, and `Order.userId` is nullable "for guest checkout" — but `POST /orders` requires `authenticate`. Guest checkout does not exist.
4. **Two config files + a cwd-relative path** make server startup location-sensitive and config drift invisible.
5. **Four Prisma connection pools.** `rma.service.ts:20`, both RMA controllers, and `utils/prisma.ts` each construct their own `PrismaClient` (self-documented as debt in the code).
6. **Express 5.0.0-beta.1 in production dependencies** — a beta web framework under a payment system.
7. **Frontend:** no API client abstraction (raw fetch/SWR per component, pre-registered P2-3), no memoized context values (P2-2), admin duplicates web's provider stack (P2-5). Admin `(dashboard)/layout.tsx` gates on "logged in", not on role — any customer sees the admin shell while its API calls 403 (P0-4 partially live; API itself is correctly protected by `authenticate`+`authorizeAdmin` at `admin.routes.ts:20-21`).

## Domain modeling observations

- **Aggregates are implicit.** Order + OrderItems + Shipment + AuditLog form an aggregate whose invariants (audit on transition, stock symmetry) are enforced only by developer discipline, and inconsistently: `verify-payment`, `cancel`, and admin coupon/shipment mutations skip the audit log; only `admin.routes.ts:884` and the RMA/logistics paths write it.
- **Money is handled as `Number(decimal)` in checkout math** (order.routes.ts:103-178) while RMA correctly uses `Prisma.Decimal` arithmetic — two idioms for money in one codebase; float arithmetic on order totals is a rounding-drift risk with GST-inclusive pricing.
- **`gstAmount` is always 0** ("GST is now inclusive", order.routes.ts:92) but the column, invoices, and RMA refund math still treat GST as additive (`rma.service.ts:128-131` adds GST on top of unitPrice). A returned item can therefore refund **more** than was charged for it.
- **Return-window anchor is wrong:** measured from `order.updatedAt`, which any later write resets (self-documented at `rma.service.ts:85-97`); `Shipment.deliveredAt` exists and is populated but unused for this.

## Coupling & cohesion

Low structural coupling between deployables; high internal coupling inside route files (validation + business rules + persistence + side effects like email/invoice in one handler). Cohesion is good in `services/` and poor in `routes/`.

---

# 4. Security Assessment

Trust boundaries: browser ↔ API (cookies, CORS-scoped), Razorpay/courier webhooks ↔ API (HMAC), API ↔ storage/SMTP (env credentials). No multi-tenancy; single-store model, so tenant isolation is N/A.

## Critical

**SEC-1 — Payment verification does not bind the Razorpay order to the database order (NEW — not in prior audit).**
`POST /orders/verify-payment` (`order.routes.ts:256-319`) verifies `HMAC(razorpayOrderId + "|" + razorpayPaymentId)` and then loads the order by `{ id: orderId, userId }` — **it never checks `order.razorpayOrderId === razorpayOrderId`**. Any user holding one genuine signature (e.g., from a ₹49 order they actually paid) can replay it with the `orderId` of any other unpaid order they created (₹50,000 cart) and have it flipped to PAID/CONFIRMED, invoice emailed.
*Risk: direct revenue loss. Likelihood: medium (requires one real payment + API replay; trivial with browser devtools). Impact: critical. Mitigation (future work): compare submitted `razorpayOrderId` with the stored one, verify captured amount against `order.total` via Razorpay fetch, and make the webhook the authoritative confirmation path.*

**SEC-2 — Signature verification fails open on env misconfiguration.**
Mock mode is entered when `RAZORPAY_KEY_ID` is **unset** or placeholder-prefixed (`order.routes.ts:265-267`), skipping signature verification entirely; the same pattern gates refunds (`rma.service.ts:326`). A missing env var in production = unverifiable payments accepted. (Prior audit F-2; live.)
*Mitigation: fail closed — require an explicit `PAYMENTS_MOCK=true` flag, and refuse to boot in production without real keys.*

## High

**SEC-3 — Webhook HMAC over re-serialized JSON, not raw body** (`webhook.routes.ts:16-25`, both Razorpay and logistics). `express.json()` has already parsed the payload; `JSON.stringify` will not byte-match Razorpay's signed raw body whenever the raw body differs in whitespace/key order/unicode escaping. Consequence today is availability (valid webhooks rejected → orders stuck PENDING); it also makes verification correctness accidental. (Prior audit P0-3; live. Requires `express.raw()` on webhook routes — protected path, needs explicit approval.)

**SEC-4 — JWT `verify` does not pin algorithm or issuer** (`auth.middleware.ts:47-57`). With HS256 secrets this is currently exploitable only via weak-secret scenarios, but it is a standard hardening gap. (Prior P1-6; live.)

**SEC-5 — In-memory OTP store with no per-account attempt counter** (`auth.routes.ts:16, 262-291`). OTPs die on restart (availability), and guessing is throttled only by the per-IP `authLimiter` (5/15 min prod) — a distributed guesser gets ~6 attempts × N IPs against a 10-minute 6-digit OTP. `Math.random()` is not a CSPRNG for OTP generation. (Prior P1-9; live.)

## Medium

- **SEC-6 — Refresh tokens stored in plaintext** in `RefreshToken.token`; DB read access = session takeover. Rotation exists but there is no reuse detection (old token replay after rotation is merely rejected, not treated as compromise). Multiple valid refresh tokens accumulate per user (one per login; only cleaned on logout/reset).
- **SEC-7 — Error handler leaks stack + route details whenever `NODE_ENV=development`**, and Zod validation errors surface as 500s with masked messages in production (no `ZodError` branch in `error.middleware.ts`) — an availability/UX defect with security-relevant logging noise. (Prior P0-2; live.)
- **SEC-8 — Uploads: MIME/extension trust** on `upload.array('images')` in admin products and RMA images; local-disk fallback serves `server/uploads` statically. (Prior P1-7; unable to fully confirm current multer fileFilter from evidence sampled — flagged for verification.)
- **SEC-9 — Admin UI role gap:** dashboard shell renders for any authenticated customer (`apps/admin/(dashboard)/layout.tsx` checks `user` only). API-side authorization is correct, so impact is information-architecture exposure, not data exposure.
- **SEC-10 — `/_next/image` open image proxy** — both apps allow `hostname: '**'` remote patterns (`apps/*/next.config.js`), making the image optimizer an SSRF-ish open proxy/bandwidth sink. (Prior F-1; live.)
- **SEC-11 — Helmet CSP disabled** (`index.ts:66-69`); XSS mitigation rests entirely on React escaping.

## Low

- 6-digit numeric OTP logged to server console when email service off (`auth.routes.ts:269`) — acceptable dev-only if config is honest, but config drift (two config files) makes "email off" plausible in prod.
- Rate limiter and OTP cache are per-process (see scalability) — also a security consistency issue behind a load balancer.
- `orders` list `limit` query param is uncapped (`order.routes.ts:397`) — a client can request arbitrarily large pages (DoS-lite; same pattern likely elsewhere).

## OWASP Top-10 mapping (abridged)

| OWASP 2021 | Status |
|---|---|
| A01 Broken Access Control | SEC-1 (business-object binding), SEC-9 (UI only) |
| A02 Cryptographic Failures | SEC-4, SEC-6, OTP via `Math.random()` |
| A03 Injection | Low risk — Prisma parameterization + Zod throughout; raw SQL confined to `FOR UPDATE` with bound params |
| A04 Insecure Design | INV-1 (no reservation), dual confirmation paths |
| A05 Security Misconfiguration | SEC-2, SEC-11, config-file duplication |
| A07 Auth Failures | SEC-5, refresh-token reuse detection absent |
| A08 Software/Data Integrity | SEC-3 (webhook signature) |
| A09 Logging/Monitoring | No security event log, no alerting (see §7) |
| A10 SSRF | SEC-10 |

---

# 5. Technical Debt Register

| ID | Category | Description | Evidence | Business Impact | Priority | Est. Effort |
|---|---|---|---|---|---|---|
| TD-1 | Security | Payment verify lacks order↔razorpayOrder binding and amount check | `order.routes.ts:256-319` | Direct fraud/revenue loss | **P0** | S (days) |
| TD-2 | Security | Fail-open mock modes for signatures & refunds | `order.routes.ts:265-267`, `rma.service.ts:326` | Silent payment bypass on misconfig | **P0** | S |
| TD-3 | Security/Correctness | Webhook HMAC over re-serialized body | `webhook.routes.ts:19` | Stuck orders; fragile verification | **P0** | S (protected path — needs approval) |
| TD-4 | Architecture | Stock hard-decremented at PENDING; `StockReservation` unused; no abandoned-order reclaim job | `order.routes.ts:69-88`; grep: model unused | Phantom stock-outs, lost sales | **P0** | M (weeks) |
| TD-5 | Correctness | Coupon lifecycle: usage counted only on verify-payment path; check/increment not atomic; discount not clamped (negative totals possible) | `order.routes.ts:124-178, 325-355` | Coupon over-redemption; pricing errors | P1 | S–M |
| TD-6 | Correctness | Audit-log invariant unenforced: verify-payment, cancel, most admin mutations skip `OrderAuditLog` | one write in `admin.routes.ts:884`; none in order.routes | Broken audit trail for disputes/compliance | P1 | M |
| TD-7 | Correctness | GST double-standard: order charges GST-inclusive (`gstAmount=0`) but RMA refunds add GST on top | `order.routes.ts:92`, `rma.service.ts:128-131` | Over-refunding on returns | P1 | S |
| TD-8 | Correctness | Return window anchored to `order.updatedAt`; `refund.created` webhook refunds/restocks whole order regardless of partial RMA | `rma.service.ts:85-97`, `webhook.routes.ts:123-139` | Wrong return acceptance; stock drift | P1 | M |
| TD-9 | Testing | Zero automated tests; no CI pipeline | no test config in any package.json; no `.github/` | Every change is unverified | **P0** (practice) | M–L |
| TD-10 | Architecture | God route files; no service layer for orders/coupons/stock | `admin.routes.ts` (37 KB), `order.routes.ts` (18 KB) | Slows every future change; bug surface | P2 | L (incremental) |
| TD-11 | Infrastructure | Express 5 beta; 4 PrismaClient pools; no Docker; cwd-relative config path; duplicate config files | package.json; `rma.service.ts:15-20`; `utils/config.ts` | Fragile deploys, connection exhaustion | P1 | S–M |
| TD-12 | Operational | In-memory rate limiter + OTP cache block multi-instance deploys | `index.ts:92`, `auth.routes.ts:16` | Cannot scale horizontally safely | P1 | S (Redis) |
| TD-13 | Documentation | CLAUDE.md materially wrong (reservations, server cart, config path, guest checkout) | §3 drift list | Misleads every future contributor/agent | P1 | S |
| TD-14 | Performance | Per-item sequential queries in hot loops (stock restore, locks); uncapped pagination | `order.routes.ts:657-662`, `webhook.routes.ts:114-139` | Latency + DoS surface at scale | P2 | S |
| TD-15 | Frontend | No API client; unmemoized contexts; admin/web provider duplication; Tailwind→BEM migration half-done | prior audit P2-2/3/5, confirmed structure | Slow feature velocity, inconsistency | P2 | M |

---

# 6. Refactoring Recommendations (future work only)

## R-1 — Harden the payment confirmation path (Epic: "Trustworthy Payments")

- **Problem:** SEC-1/2/3 + duplicated confirmation logic between `verify-payment` and webhook, with coupon/audit drift.
- **Evidence:** `order.routes.ts:256-391`, `webhook.routes.ts:27-147`.
- **Why it matters:** This is the revenue path; every defect here is money or a stuck customer.
- **Strategy:** Extract a single `OrderPaymentService.confirmPayment(orderId, razorpayOrderId, paymentId, source)` used by both entry points; it binds razorpayOrderId, verifies amount, increments coupons atomically, writes audit log, generates invoice, emails — idempotently. Move webhook route to `express.raw()` body with HMAC over raw bytes. Replace implicit mock mode with an explicit env flag that refuses to activate when `NODE_ENV=production`.
- **Dependencies:** touching `webhook.routes.ts` is a protected path — requires explicit approval per repo policy.
- **Stories:** (1) order-binding + amount check; (2) raw-body HMAC; (3) explicit mock flag; (4) unified confirmation service; (5) coupon atomicity; (6) audit-log coverage. **Effort:** ~1–2 weeks. **Priority: P0.**
- **Success criteria:** signature replay across orders rejected (test); webhook from Razorpay test console verifies; coupon usage identical via either confirmation path; every status transition has an audit row.

## R-2 — Activate stock reservations (Epic: "Inventory Integrity")

- **Problem:** TD-4; the schema already models the fix.
- **Strategy:** On order create: create `StockReservation(ACTIVE, expiresAt=+15m)` instead of decrementing; convert on payment; a scheduled job (cron/worker) expires stale reservations and cancels stale PENDING orders. `validate-checkout`/`snapshot` compute availability as `stock − active reservations`.
- **Migration considerations:** dual-write window; backfill none needed (reservations are transient). **Effort:** 2–3 weeks. **Priority: P0/P1.**
- **Success criteria:** abandoned checkout returns stock within the configured window without human action; no oversell under concurrent load test.

## R-3 — Extract an order/commerce service layer (Epic: "Domain Layer")

- **Problem:** TD-10, TD-6. Route files own business rules; invariants unenforceable.
- **Strategy:** Follow the existing `RmaService` pattern (it is already the house style): `OrderService`, `CouponService`, `InventoryService`, each transactional, each writing audit logs, all sharing the single `utils/prisma` client (fixes the 4-pool debt). Strangler-fig: new/changed endpoints call services; old handlers migrate opportunistically.
- **Effort:** 4–6 weeks incremental. **Priority: P1–P2.**
- **Success criteria:** no `prisma.order.update` outside `OrderService`; audit-log coverage measurable by grep/CI rule.

## R-4 — Money and GST normalization

- **Problem:** TD-5 (discount clamping), TD-7 (GST refund asymmetry), float math on totals.
- **Strategy:** One documented pricing function using `Prisma.Decimal` end-to-end; clamp `discount ≤ subtotal + shipping`; refund amount derived from what was actually charged (GST-inclusive), not recomputed additively. **Effort:** ~1 week + reconciliation of historical data decision. **Priority: P1.**

## R-5 — Test & CI foundation (Epic: "Safety Net")

- **Strategy:** Vitest + supertest for the API against a disposable MySQL (docker-compose); first suites target R-1/R-2 behaviors (payment binding, reservation expiry, coupon limits, RMA state machine); GitHub Actions running `lint → tsc → tests → prisma migrate diff` on PR. Contract-level smoke for web via Playwright on the checkout happy path. **Effort:** 2–3 weeks to seed, then continuous. **Priority: P0 as practice.**

## R-6 — Operational baseline (Epic: "Run It Like Production")

- Dockerfiles + compose for the three deployables and MySQL; externalize OTP + rate-limit state to Redis; deepen `/health` (DB ping, storage provider, config checksum); structured logging (pino) with request ids; error tracking (Sentry) and minimal RED metrics; documented backup/restore for MySQL and uploads. **Effort:** 2–4 weeks. **Priority: P1.**

## R-7 — Configuration unification

- Single config file, path resolved from repo root not cwd, validated with Zod at boot (fail fast on missing `features.emailService` etc.); delete the stale root `Store.config.json` or make it the only one; update CLAUDE.md. **Effort:** days. **Priority: P1.**

## R-8 — Frontend data layer (defer until R-1/R-5 land)

- Adopt the prior audit's RTK-Query-or-typed-SWR-client recommendation; memoize contexts; single API client module with typed endpoints; finish Tailwind→BEM migration page-by-page. **Priority: P2.**

---

# 7. Missing Engineering Practices

| Missing | Why it matters | Recommended future implementation | Priority |
|---|---|---|---|
| Automated tests (unit/integration/contract) | Payment platform with zero regression protection | R-5 | **P0** |
| CI/CD pipeline | No gate between a laptop and production | GitHub Actions per R-5; later deploy workflow | **P0** |
| Containerization / reproducible deploys | "Works on my machine" runtime; cwd-sensitive config | R-6 Dockerfiles | P1 |
| Metrics, tracing, alerting | Outages and payment failures discoverable only by customers | RED metrics + Sentry + uptime alerts (R-6) | P1 |
| Structured/security event logging | `console.log` only; no auth-event trail, OTPs in logs | pino + security event channel | P1 |
| DB backup & disaster-recovery runbook | Single MySQL holds all money data; no documented recovery | Automated dumps + restore drill doc | P1 |
| Background job runner | Reservation expiry, webhook retries, email retries all need one | node-cron/BullMQ (needs Redis from R-6) | P1 |
| Deep health checks / readiness probes | `/health` returns 200 even if DB is down (`index.ts:111-113`) | DB-inclusive readiness endpoint | P2 |
| Dependency vulnerability scanning | Express beta, multer 1.x, no audit gate | `npm audit`/Dependabot in CI | P2 |
| ADRs | Big decisions (GST-inclusive pricing, cookie auth, no reservations) live only in commit history | Lightweight ADR folder; workflow already supports artifacts | P2 |
| API documentation / OpenAPI | Two frontends + webhooks integrate against undocumented endpoints | Generate from Zod schemas | P2 |
| Operational runbooks | No documented response to "webhook failing", "stock drifted" | Runbook per external integration | P2 |

(Notably *not* missing: architecture documentation volume, audit-log schema, workflow governance — those exist; the gap is enforcement and automation.)

---

# 8. Risk Register

| # | Risk | Likelihood | Impact | Mitigation (future) | Priority | Suggested Owner |
|---|---|---|---|---|---|---|
| R1 | Payment fraud via verify-payment order swap (SEC-1) | Medium | Critical | R-1 story 1 | **P0** | Backend/Payments |
| R2 | Prod env misconfig silently disables payment verification (SEC-2) | Medium | Critical | R-1 story 3 | **P0** | Backend + Ops |
| R3 | Legit webhooks rejected → orders stuck PENDING, stock leaked (SEC-3 + INV-1 compound) | High | High | R-1 story 2 + R-2 | **P0** | Backend |
| R4 | Inventory drift from abandoned orders / cancel-restore races / whole-order restock on partial refund | High | High (lost sales, oversell) | R-2, R-4 | P0/P1 | Backend |
| R5 | Unverified releases regress money paths (no tests/CI) | High | High | R-5 | P0 | All eng |
| R6 | Data loss — no backups/DR for MySQL & uploads | Low–Med | Critical | R-6 | P1 | Ops/SRE |
| R7 | Horizontal scaling breaks auth (OTP) & rate limits (in-memory state); 100 req/15 min prod limit throttles real shoppers at modest traffic | Certain at 10x | Medium | R-6 Redis + limit review | P1 | Platform |
| R8 | Express 5 beta / multer 1.x vulnerabilities or breaking GA changes | Medium | Medium | Upgrade plan + scanning | P1 | Backend |
| R9 | Over-refunding via GST asymmetry & unclamped discounts | Medium | Medium (margin leak) | R-4 | P1 | Backend/Finance |
| R10 | Compliance/dispute failure from incomplete audit trail | Medium | Medium | R-3 audit enforcement | P1 | Backend |
| R11 | Config drift between two store.config files causes wrong runtime behavior | Medium | Medium | R-7 | P1 | Backend |
| R12 | Documentation drift misleads contributors/AI agents into wrong assumptions | High | Low–Med | TD-13 doc fix | P2 | Eng leads |

## Scalability outlook

- **10x users:** in-memory rate limiter + prod cap of 100 req/15 min becomes the first outage; Razorpay-order-per-checkout and per-item query loops raise p95. Fixable with R-6 + R-14-class query batching.
- **100x users:** single MySQL write master is the ceiling; needs read replicas for catalog, Redis cache for products/config, a queue for email/invoice/webhook side effects (currently inline in request handlers).
- **1000x users:** requires the R-3 service layer as the seam for extracting inventory and payments into separately scaled services; current route-file architecture has no such seam.

## Future readiness (summary)

Ready-ish: long-term maintenance (docs discipline), continuous delivery *culture* (workflow gates exist). Not ready: large teams (no tests/CI to protect parallel work), enterprise/regulated use (audit gaps, no DR, secrets hygiene unverified), high availability (single instance, stateful process), multi-region (single DB, local-disk fallback storage), event-driven migration (no queue, but audit-log schema is a good event seed).

---

## Evidence caveats

- Upload MIME filtering (SEC-8) and parts of the 37 KB `admin.routes.ts` were sampled, not exhaustively read; findings there defer to the prior audit's register. Unable to confirm from available evidence: production deployment topology, secret management in the real environment, and `server/.env` contents (deliberately not read).
- Prior-audit items re-verified as **still live**: P0-2, P0-3, P1-6, P1-9, P1-10, P2-1/2/3/5, F-1, F-2. Re-verified as **fixed since**: P1-4 (refresh rotation now implemented, `auth.routes.ts:320-376`).
