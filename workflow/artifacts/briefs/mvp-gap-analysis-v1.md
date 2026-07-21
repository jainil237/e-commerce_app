# MVP Gap Analysis — ecommerce-platform

status: ready-for-next-phase
date: 2026-07-19
scope: full-stack audit (server, apps/web, apps/admin, schema) against e-commerce MVP baseline
method: static evidence from the codebase. Every claim below cites a file:line. Runtime behaviour
        was verified in Chrome only where noted.

> **Note on method:** `/multi-workflow`, `/multi-frontend`, `/multi-backend` all require the external
> `ccg-workflow` runtime (`~/.claude/bin/codeagent-wrapper`, `~/.claude/.ccg/prompts/*`). None of it
> is installed and neither `codex` nor `gemini` is on PATH, so the multi-model orchestration could not
> run. This document follows those commands' Research → Analysis → Plan structure, executed single-model.

---

## P0 — Correctness and money. Fix before any real traffic.

### 1. Overselling race: stock is validated against a stale read
`server/src/routes/order.routes.ts:53` fetches `products` **outside** the transaction.
`:68-88` then opens a transaction, takes `SELECT … FOR UPDATE` row locks, and checks
`product.stock < item.quantity` — but `product` is the pre-lock copy.

The locks serialise the writes; they do not refresh the values being compared. Two concurrent
orders for the last unit both read `stock: 1`, both pass the check, both decrement. Stock goes
negative and both orders are accepted.

Fix: re-read stock inside the transaction (`tx.product.findMany`) and compare that, or replace the
check with a conditional update (`updateMany where stock >= qty`) and treat `count === 0` as failure.

### 2. `StockReservation` is dead code — and the docs describe it as the live mechanism
The model exists (`schema.prisma`) and has a migration, but `grep -rn "stockReservation" server/src`
returns **zero** hits. Checkout decrements stock directly (`order.routes.ts:85`).

`CLAUDE.md` states: *"Stock changes during checkout go through `StockReservation` (soft-lock), not
direct decrements"* and documents `inventory.reservationDurationMinutes`. That is not what the code
does. Either implement the soft-lock or delete the model and correct the docs — right now a future
contributor will trust the doc over the code.

### 3. Password-reset OTPs live in process memory
`auth.routes.ts:16` — `new NodeCache({ stdTTL: 600 })`. Consequences:
- every server restart invalidates in-flight resets;
- with more than one instance, the OTP is only valid on the node that issued it;
- `:262` generates it with `Math.random()`, which is not cryptographically secure and is
  predictable enough to matter for an auth primitive.

Fix: persist to a `PasswordResetToken` table (or Redis) with a hashed token, and generate via
`crypto.randomInt`.

---

## P1 — MVP-blocking functional gaps

### 4. The entire RMA feature has no customer UI
Backend is complete and hardened: `rma.routes.ts`, `admin.rma.routes.ts`, `rma.service.ts`
(full state machine), `rma.controller.ts`, `admin.rma.controller.ts`, RMA emails, and the
logistics webhook that auto-refunds on reverse delivery.

**A customer has no way to reach any of it.** There is no return-request page
(`find apps/web/src/app -ipath "*rma*"` → nothing), and `apps/web/src/app/orders/[id]/page.tsx`
has no return/replace action. `/returns` is a static policy page.

Admin is *read-only*: `apps/admin/src/app/(dashboard)/orders/page.tsx:120` fetches
`/api/v1/admin/rma` and lists results, but there are no approve / reject / schedule-pickup /
mark-received / issue-refund controls — none of those endpoint names appear in any admin page.

This is the single largest gap: a fully built, tested, committed backend feature that no user
can invoke. Needs a customer "Request return/replacement" flow on the order detail page and an
admin RMA workspace driving the six existing endpoints.

### 5. Forgot-password has a backend and no frontend
`POST /auth/forgot-password` and `POST /auth/reset-password` exist. There is no
`/account/forgot-password` or `/account/reset-password` page, and the login page links to neither.
Users who forget a password are locked out permanently.

### 6. No product reviews or ratings
No `Review` model; no rating fields on `Product`. Table stakes for e-commerce — drives conversion
and is expected on any PDP. Needs model + moderation + PDP display + "verified purchase" tie-back
to `OrderItem`.

### 7. Guest checkout is documented but not implemented
`Order.userId` is nullable specifically to support guests, and `CLAUDE.md` says `optionalAuth` is
"used for guest checkout routes". In reality `optionalAuth` appears only on product **read** routes
(`product.routes.ts:12,164,204,266`), and order creation is `router.post('/', authenticate, …)`
(`order.routes.ts:34`). Forced registration is a well-known conversion killer; the schema is already
ready for it.

### 8. No email verification
`User` has no `emailVerified` / verification-token field. Anyone can register with an address they
don't control and receive order mail at it.

---

## P2 — Quality, safety, operability

### 9. Zero automated tests
No `*.test.ts` / `*.spec.ts` anywhere in the repo. `CLAUDE.md` says "No test suite is currently
configured." Every regression to date has been caught by hand. The Playwright lifecycle spec written
this session is stashed (`stash@{0}`), not committed — it is the natural seed for a suite.

### 10. `npm run lint` is broken repo-wide
ESLint is unconfigured in both Next apps (it drops into an interactive setup prompt) and `server`
has no `lint` script at all. The lint gate listed in `.claude/CLAUDE.md` verification commands does
not actually run.

### 11. Migration history does not reproduce the schema
`isReturnable`, `isReplaceable`, and `CouponUsage` are absent from `prisma/migrations/`. The dev DB
is correct only because it was rebuilt with `db push`. A fresh `migrate deploy` from zero will not
arrive at the current schema. Needs a squashed baseline migration.

### 12. `LOGISTICS_WEBHOOK_SECRET` is unset
The logistics webhook fails closed (400 on everything) until it is set in `server/.env` and the
courier is configured to send `x-logistics-signature`.

### 13. Checkout UX friction (observed in Chrome)
- A newly saved address is **not** auto-selected, leaving "Pay" disabled with no explanation.
- Checkout's "Add Address" navigates away to `/account/addresses`, losing checkout context.
- Form inputs carry no `name` or `id` attributes anywhere — breaks password managers, browser
  autofill, and label association (an accessibility problem, not just a testing inconvenience).

### 14. Known deferred debt
Two `ponytail: DEBT` markers in `rma.service.ts`: stray `PrismaClient` instances bypassing the
`utils/prisma` singleton (4 connection pools), and the return window measured from
`order.updatedAt` rather than actual delivery date.

---

## What already works (verified, not assumed)

Confirmed end-to-end in Chrome this session: register → browse → cart → checkout → payment →
admin ship → deliver, with the order reaching `DELIVERED`/`PAID` and both `OrderAuditLog` rows
written. Also solid: coupon validation with per-user usage caps, invoice PDF generation and email,
wishlist, address CRUD, admin dashboard analytics, product/category/coupon admin CRUD, JWT
httpOnly-cookie auth with refresh rotation, storage-provider abstraction (R2 → Cloudinary → disk),
and rate limiting on auth routes.

---

## Recommended order of work

| # | Item | Why first |
|---|------|-----------|
| 1 | Oversell race (#1) | Silent data corruption, accepts unfulfillable orders |
| 2 | RMA UI, customer + admin (#4) | Largest built-but-unreachable surface; returns are a legal requirement in most markets |
| 3 | Forgot-password UI (#5) | Permanent lockout; backend already done, pure frontend work |
| 4 | OTP persistence (#3) | Auth primitive on `Math.random()` + in-memory store |
| 5 | Guest checkout (#7) | Direct conversion impact; schema already supports it |
| 6 | Reviews (#6) | Largest net-new feature; conversion driver |
| 7 | Migration baseline (#11) | Blocks any deploy to a fresh environment |
| 8 | Tests + lint (#9, #10) | Compounding — cheapest before the above lands, not after |

Items 1, 3, 5 are backend-only. Item 2 is the big one and is full-stack. Items 5 and 13 are
frontend-only against existing APIs.
