# MVP Gap Register

**Status:** ACTIVE
**Date:** 2026-07-19
**Branch reviewed:** `feat/homepage-redesign` (294 files, +27,355 vs `main`)
**Commit:** `37e4b18`
**Produced by:** `/plan-ceo-review`, SELECTIVE EXPANSION mode
**Supersedes:** `workflow/artifacts/briefs/mvp-gap-analysis-v1.md`, `mvp-gap-analysis-v2-acceptance-criteria.md`

---

## How to read this document

Every entry carries the same five fields, so you can act on it without re-deriving anything:

| Field | Meaning |
|---|---|
| **Evidence** | `file:line`. If there is no citation, the finding is marked INFERRED. |
| **Customer sees** | The actual user-visible failure, not the technical description. |
| **Business impact** | What it costs in money, trust, or legal exposure. |
| **Blocks launch** | YES means do not take real payments until closed. |
| **Fix shape** | Direction only. Not a design. |

Three tiers: **P0** blocks launch. **P1** is core MVP, ship in the first iteration after launch. **P2** is growth and hardening.

Findings were produced by static code reading. Items marked **VERIFIED IN CHROME** were exercised against a running stack with Playwright. Items marked **UNREPRODUCED** are read from code and have not been observed failing. That distinction is load-bearing: two P0 items are unreproduced.

---

## Payment readiness gate

**The product is not ready to take real money today.** Three defects can take payment from a customer and fail to return it, and one more means a returns request cannot be actioned at all.

```
  ┌──────────────────────────────────────────────────────────────┐
  │  BEFORE ACCEPTING REAL PAYMENTS, CLOSE:                       │
  │                          certainty    trigger                 │
  │   P0-0  Abandoned-cart stock leak  CERTAIN  every abandon     │
  │   P0-2  Paid cancellation          CERTAIN  first cancel      │
  │   P0-4  OTP predictable + logged   CERTAIN  standing exposure │
  │   P0-5  Migration history broken   CERTAIN  first deploy      │
  │   P0-1  Overselling race           RACE     concurrent orders │
  │                                                               │
  │  Ordered by certainty, not severity. The first four fire on   │
  │  normal traffic. P0-1 needs simultaneous last-unit orders.    │
  │                                                               │
  │  P0-3 (RMA has no UI) is the highest-value item in this doc   │
  │  but is NOT launch-blocking. See its entry.                   │
  └──────────────────────────────────────────────────────────────┘
```

---

# PART 1 — P0. Launch gate

## P0-0 · Abandoned checkout permanently burns inventory

- **Evidence:** `server/src/routes/order.routes.ts:83-86` (decrement), `:213-214` (`status: 'PENDING'`, `paymentStatus: 'PENDING'`). No reaper: `grep -rn "setInterval\|cron\|node-schedule" server/src` returns nothing.
- **Status:** VERIFIED by code read. Deterministic, not a race.
- **Customer sees:** Other customers see "out of stock" for items that are physically in the warehouse.
- **Business impact:** Every abandoned checkout permanently destroys sellable inventory. On a store with normal cart-abandonment rates, stock trends to zero while goods sit on the shelf. Lost sales are silent and unattributable.
- **Blocks launch:** YES. This is the most certain defect in the register.

Stock is decremented at order **creation**, before payment, while the order is `PENDING/PENDING`. If the customer closes the Razorpay modal, nothing ever releases it. `payment.failed` (`webhook.routes.ts:105-120`) only fires when Razorpay reports an actual failure, not on abandonment. There is no scheduled job, no expiry sweep, nothing.

```
  create order ──▶ stock -1 ──▶ PENDING ──▶ Razorpay modal
                                                  │
                          ┌───────────────────────┼──────────────────┐
                          ▼                       ▼                  ▼
                     pays                    fails explicitly    CLOSES TAB
                          │                       │                  │
                     stock stays -1          stock +1 restored   stock stays -1
                     CORRECT ✓               CORRECT ✓           LEAKED FOREVER ✗
```

**This is why `StockReservation` exists in the schema.** DRIFT-1 is therefore not a cosmetic documentation error. The soft-lock mechanism `CLAUDE.md` describes is the correct design for exactly this problem, and it was specified, migrated, and then never implemented. The doc describes the fix for a live bug as though it already shipped.

**Fix shape:** Either implement `StockReservation` as designed (reserve on creation, expire after `inventory.reservationDurationMinutes`, convert to a decrement on payment), or decrement only on payment confirmation and accept the smaller oversell window. The first is the design already in your schema.

**Credit:** found by the adversarial review pass, not the primary analysis. I missed it.

## P0-1 · Overselling race: stock validated against a stale read

- **Evidence:** `server/src/routes/order.routes.ts:53` (read), `:68-88` (transaction)
- **Status:** UNREPRODUCED. Read from code, not observed under load.
- **Customer sees:** Order accepted and paid for an item that does not exist. Days later, a cancellation email.
- **Business impact:** Refunds, support load, and a broken promise on the first order. Stock goes negative, so inventory reporting is wrong from that point on.
- **Blocks launch:** YES

`products` is fetched at line 53, outside the transaction. The transaction then takes `SELECT ... FOR UPDATE` row locks and checks `product.stock < item.quantity`, but `product` is the copy read before the lock existed. The locks serialise the writes. They do not refresh the values being compared.

```
  Request A                     Request B              stock
  ─────────────────────────────────────────────────────────────
  read products (stock=1) ····································· 1
                                read products (stock=1)         1
  BEGIN, lock row                                               1
  check 1 >= 1  PASS                                            1
  decrement                                                     0
  COMMIT                                                        0
                                BEGIN, lock row                 0
                                check 1 >= 1  PASS  ← stale!    0
                                decrement                      -1
                                COMMIT                         -1
```

**Fix shape:** Re-read stock inside the transaction, or replace the check with a conditional `updateMany({ where: { stock: { gte: qty } } })` and treat `count === 0` as failure. Add a `CHECK (stock >= 0)` constraint so the invariant cannot be violated by a future code path.

**Proof required before scheduling:** a load test firing N concurrent orders at `stock = 1`. It must fail against current code.

---

## P0-2 · Cancelling a paid order keeps the customer's money

- **Evidence:** `server/src/routes/order.routes.ts:626-676`
- **Status:** UNREPRODUCED. Read from code.
- **Customer sees:** Cancels an order, gets a cancellation email, never gets refunded.
- **Business impact:** Chargebacks, consumer-protection exposure, and the worst possible first impression. There is no audit trail to reconstruct what happened.
- **Blocks launch:** YES

A customer may cancel while `PENDING | CONFIRMED | PROCESSING`. The handler sets `status: 'CANCELLED'`, restores stock, sends an email, and returns. It never issues a Razorpay refund, never creates a `Refund` row, and never touches `paymentStatus`.

A `CONFIRMED` order is by definition already `PAID`, because `verify-payment` sets both. So the common case is: goods released back to inventory, money retained.

Three further defects in the same handler:
1. No `OrderAuditLog` entry, violating the rule in `CLAUDE.md` that every status mutation writes one.
2. The stock-restore loop runs outside a transaction. A mid-loop failure leaves some items restored and others not, with no record.
3. **Coupon usage is never released.** `verify-payment` increments `coupon.usedCount` and upserts `couponUsage` (`order.routes.ts:329-345`). The cancel handler restores stock but contains zero coupon references. A cancelled order permanently consumes the customer's one-per-user coupon, so they cannot re-order with the discount they were promised.

**Fix shape:** Refund, status change, stock restore, coupon release, and audit write inside one transaction. Roll the whole thing back if the Razorpay call fails. Guard against double-cancel and concurrent cancel producing two refunds.

---

## P0-3 · The entire returns feature has no user interface

- **Evidence:** backend complete at `server/src/services/rma.service.ts`, `routes/rma.routes.ts`, `routes/admin.rma.routes.ts`, `controllers/rma.controller.ts`, `controllers/admin.rma.controller.ts`. Customer UI: none. Admin: read-only list at `apps/admin/src/app/(dashboard)/orders/page.tsx:120`.
- **Status:** VERIFIED. No route in `apps/web` calls any `/rma` endpoint.
- **Customer sees:** No way to request a return or replacement. `/returns` is a static policy page describing a process they cannot start.
- **Business impact:** Returns are a legal requirement in most consumer markets. Every return becomes a manual support ticket and a hand-run database change.
- **Blocks launch:** NO, on the register's own definition. Returns can be actioned manually through the admin API for the first weeks, so no customer loses money. **It is the highest value-per-effort item in this document, which is not the same thing as launch-blocking.** Tier kept at P0 only as a visibility flag; sequence it in Wave 1, immediately after the gate. If your market imposes a statutory returns window from day one, it becomes a genuine blocker.

The backend is complete and hardened: a full state machine, six admin endpoints, transactional refunds with idempotency, RMA emails, and a logistics webhook that auto-refunds on reverse delivery. None of it is reachable.

Admin has a read-only list. There are no approve, reject, schedule-pickup, mark-received, issue-refund, or ship-replacement controls anywhere in the admin app.

```
  BUILT                                    REACHABLE
  ─────────────────────────────────────────────────────
  POST /rma/request                        ✗ no UI
  GET  /rma                                ✗ no UI
  POST /rma/:id/cancel                     ✗ no UI
  PATCH /admin/rma/:id/approve             ✗ no UI
  PATCH /admin/rma/:id/reject              ✗ no UI
  POST /admin/rma/:id/schedule-pickup      ✗ no UI
  POST /admin/rma/:id/mark-received        ✗ no UI
  POST /admin/rma/:id/issue-refund         ✗ no UI
  POST /admin/rma/:id/ship-replacement     ✗ no UI
  GET  /admin/rma                          ✓ list only
```

**Fix shape:** A return-request flow on the customer order-detail page (eligibility gating, item and quantity selection, reason, images, refund mode) and an admin RMA workspace exposing each action only in the state where it is legal.

This is the highest value-per-effort item in the register. The expensive half is done.

---

## P0-4 · Password reset OTPs are predictable and written to logs

- **Evidence:** `server/src/routes/auth.routes.ts:16` (NodeCache), `:262` (`Math.random()`), `:268` (`// TODO: Remove console log once email service is purchased`)
- **Status:** VERIFIED by reading. The TODO confirms intent.
- **Customer sees:** Nothing, until an account is taken over.
- **Business impact:** Account takeover leads to order history, addresses, and phone number disclosure. Also: every server restart silently invalidates in-flight resets, and with more than one instance the OTP only works on the node that issued it.
- **Blocks launch:** YES

Three compounding problems in one flow:
1. `Math.random()` is not cryptographically secure. It is predictable enough to matter for an authentication primitive.
2. The OTP is printed to the server console while email is unconfigured. Anyone with log access has every reset code.
3. Storage is in-process memory, so the flow is unreliable on restart and broken across instances.

**Fix shape:** `crypto.randomInt` for generation, a `PasswordResetToken` table storing only a hash, single-use with expiry, per-account rate limiting, and removal of the console log.

---

## P0-5 · Migration history cannot reproduce the schema

- **Evidence:** `server/prisma/migrations/` lacks `isReturnable`, `isReplaceable`, `CouponUsage`, and the `OrderItem` to `orderitem` table naming.
- **Status:** VERIFIED. Reproduce with:
  ```bash
  cd server && npx prisma migrate diff \
    --from-schema-datasource prisma/schema.prisma \
    --to-migrations prisma/migrations \
    --shadow-database-url "<a scratch db url>" --script
  ```
  Non-empty output means the migration set does not reproduce the live schema. When the RMA migration was removed as a control, this reported 16 operations, confirming the check detects drift rather than passing vacuously.
  **Warning:** `--shadow-database-url` *resets whatever database you give it*. Point it at a scratch database, never at your real one. This exact flag wiped the dev database during analysis.
- **Customer sees:** Nothing directly. This blocks you, not them.
- **Business impact:** A fresh environment cannot be built. CI, staging, and production cannot reach the current schema by running migrations. The dev database is correct only because it was rebuilt with `db push`.
- **Blocks launch:** YES, in the sense that you cannot deploy at all.

**Fix shape:** Squash to a single baseline migration generated from the current schema, and baseline existing environments against it.

---

# PART 2 — P1. Core MVP gaps

## P1-1 · Forgot password has a backend and no frontend

- **Evidence:** `POST /auth/forgot-password` and `POST /auth/reset-password` exist. No page under `apps/web/src/app/account/` matches forgot or reset. The login page links to neither.
- **Customer sees:** Forgets their password and is locked out permanently. No self-service path exists.
- **Business impact:** Every forgotten password becomes a support ticket, or more likely a lost customer.
- **Blocks launch:** NO, but it is the cheapest high-impact item in this document. The backend is done; this is two pages.
- **Depends on:** P0-4 (fix the token before exposing the flow).

## P1-2 · No guest checkout

- **Evidence:** `Order.userId` is nullable specifically for guests. `optionalAuth` exists and is used on product read routes (`product.routes.ts:12,164,204,266`) but order creation is `router.post('/', authenticate, ...)` at `order.routes.ts:34`.
- **Customer sees:** Forced to create an account before buying.
- **Business impact:** Forced registration is a well-documented conversion killer. The schema is already built for this; one middleware swap plus a lookup page unlocks it.
- **Blocks launch:** NO
- **Note:** `CLAUDE.md` claims `optionalAuth` guards guest-checkout routes. It does not. See DRIFT-2.

## P1-3 · No email verification

- **Evidence:** `User` model has no `emailVerifiedAt` or verification token field.
- **Customer sees:** Nothing. The problem is invisible to honest users.
- **Business impact:** Anyone can register with an address they do not control. Order confirmations and invoices go to unverified addresses, and typo'd emails silently fail.
- **Blocks launch:** NO

## P1-4 · No pincode serviceability, flat shipping only

- **Evidence:** `order.routes.ts:117-119`. Shipping is `config.shipping.baseShippingCharge`, free above a threshold. No serviceability check anywhere. `Product.weight` exists and is unused for pricing.
- **Customer sees:** Places an order to an address the courier does not serve, and finds out later.
- **Business impact:** Unfulfillable orders, refund cycles, and support load. Also leaves margin on the table by not pricing heavy or distant shipments.
- **Blocks launch:** NO

## P1-5a · Saved address is not auto-selected, Pay stays disabled

- **Evidence:** VERIFIED IN CHROME. `apps/web/src/app/checkout/page.tsx`. With exactly one saved address, its radio renders unselected and the Pay button stays disabled with no message.
- **Customer sees:** Saves their first address, returns to checkout, finds a greyed-out Pay button and no explanation.
- **Business impact:** Abandonment at the final step by first-time buyers, the most expensive place to lose someone.
- **Blocks launch:** NO. Small fix, outsized impact.

The Playwright suite in `stash@{0}` has to click the address radio manually to get through checkout. That workaround exists because of this bug.

## P1-5b · "Add Address" navigates away from checkout

- **Evidence:** VERIFIED IN CHROME. The checkout "Add Address" control routes to `/account/addresses` instead of opening inline.
- **Customer sees:** Mid-checkout, they are thrown to a separate page and must navigate back.
- **Business impact:** Context loss during the highest-intent moment in the funnel.
- **Blocks launch:** NO

## P1-5c · Form inputs have no `name` or `id` attributes

- **Evidence:** VERIFIED IN CHROME. Inspected the register, login, and address forms: inputs expose only `placeholder`. Applies app-wide, not just checkout.
- **Customer sees:** Password managers do not offer to save or fill credentials. Browser autofill does not populate address fields. Screen readers announce inputs without a programmatic label.
- **Business impact:** Friction on every form in the product, plus an accessibility defect that is a compliance risk in some markets.
- **Blocks launch:** NO, but it is app-wide and cheap to fix.

## P1-6 · Placeholder contact number shipped to production

- **Evidence:** `apps/web/src/app/contact/page.tsx:17` renders the literal string `+91-XXXXXXXXXX`.
- **Customer sees:** A contact page with a fake phone number.
- **Business impact:** Directly erodes trust on the page people visit when they already have a problem.
- **Blocks launch:** NO. Trivial fix, high embarrassment.

## P1-7 · Single admin role

- **Evidence:** `enum Role { CUSTOMER, ADMIN }` in `schema.prisma`.
- **Customer sees:** Nothing.
- **Business impact:** Any admin can issue refunds, change prices, and delete products. With RMA refunds landing, that is unbounded financial exposure with no separation of duties.
- **Blocks launch:** NO, assuming a small trusted team. Revisit before hiring support staff.

## P1-8 · No data-rights support (DPDP / GDPR)

- **Evidence:** No account deletion, no data export, no retention policy. `OrderAuditLog` and `Order` retain PII indefinitely.
- **Business impact:** India's DPDP Act and GDPR both require erasure and portability. Non-compliance is a regulatory risk, not a feature gap.
- **Blocks launch:** NO, but it has a legal clock on it.

---

# PART 3 — P2. Accepted growth scope

All seven items below were explicitly accepted during the cherry-pick ceremony. They are recommendations, not defects.

## P2-1 · Product variants — ACCEPTED (E1)

- **Evidence:** `model Product` has a single `sku`, `price`, and `stock`. No variant model exists.
- **Why it matters:** Your seed data ships a "Premium Cotton T-Shirt" under a Fashion category. Apparel is not sellable without size and colour. Every variant is currently a separate product with a separate slug, fragmenting PDPs, search, and inventory.
- **Effort:** human ~1 week / CC ~2-3h. **Risk: HIGH.**
- **Sequencing note:** This is the highest blast-radius item in the register. It touches `OrderItem`, cart payloads, stock logic, and `RMAItem` references. Doing it after launch means migrating live order history. Give it its own wave and its own migration plan.

## P2-2 · Reviews and ratings — ACCEPTED (E2)

- **Evidence:** No `Review` model, no rating fields on `Product`.
- **Why it matters:** Shoppers who cannot see what other buyers thought default to not buying, especially from an unfamiliar store. Verified-purchase gating (reviewable only with a `DELIVERED` order containing that product) is what separates trustworthy ratings from spam.
- **Effort:** human ~3 days / CC ~1h. **Risk: LOW**, purely additive.
- **Includes:** moderation queue, PDP histogram, denormalised aggregate on `Product`, sort-by-rating on listings.

## P2-3 · Cash on Delivery — ACCEPTED (E3)

- **Evidence:** Razorpay prepaid only. No `paymentMethod` field on `Order`.
- **Why it matters:** Everything about this app targets India: rupee pricing, GST fields, Delhivery, six-digit pincodes. COD is how a large share of that market pays. Its absence caps conversion regardless of storefront quality.
- **Effort:** human ~2 days / CC ~45min. **Risk: MED.**
- **Watch:** COD brings return-to-origin losses and cash reconciliation that prepaid does not. Needs eligibility rules (max value, pincode, category) and a `PAID`-on-delivery transition with an audit entry.

## P2-4 · Server-side cart and abandoned-cart recovery — ACCEPTED (E4)

- **Evidence:** `cart.routes.ts` exposes only `/snapshot` and `/validate-checkout`. Cart state lives in `localStorage` (`cart.context.tsx`).
- **Why it matters:** The cart does not follow a signed-in user between devices and is lost when storage is cleared. It is also the prerequisite for abandoned-cart email, typically one of the largest recoverable-revenue levers available.
- **Effort:** human ~3 days / CC ~1h, plus ~1 day / ~20min for recovery emails. **Risk: MED.**
- **Watch:** guest-to-account merge semantics are where cart bugs live, and this is the exact code path that produced the bug fixed in `37e4b18`. Ship it with a regression guard for that bug.

## P2-5 · SEO foundation — ACCEPTED (E5)

- **Evidence:** No `sitemap.ts`, no `robots.ts`, no `generateMetadata` on any page, no JSON-LD anywhere.
- **Why it matters:** Product pages cannot be indexed properly and will never show rich results (price, availability, rating). Organic search compounds slowly, so a late start costs months that money cannot buy back.
- **Effort:** human ~2 days / CC ~30min. **Risk: LOW.**
- **Target:** Lighthouse SEO 95+ on home, listing, and product pages.

## P2-6 · Structured logging and error monitoring — ACCEPTED (E6)

- **Evidence:** `console.log` / `console.error` only. 68 generic catch blocks across `server/src/routes/`. No error tracker.
- **Why it matters:** When a customer says "my payment failed yesterday", there is currently no way to find out what happened. Invisible while things work; the difference between a ten-minute fix and a lost afternoon when they do not.
- **Effort:** human ~2 days / CC ~30min. **Risk: LOW.**
- **Hard rule:** never log secrets, password hashes, OTPs, or full PII records. See P0-4, which is exactly this failure.

## P2-7 · Test and CI baseline — ACCEPTED (E7)

- **Evidence:** Zero `*.test.ts` / `*.spec.ts` files. `npm run lint` fails in all three workspaces: ESLint is unconfigured in both Next apps and drops into an interactive prompt, and `server` has no lint script.
- **Why it matters:** Every regression this session was caught by hand. The Playwright suite that proves register-to-delivery works is uncommitted in `stash@{0}`.
- **Effort:** human ~3 days / CC ~1h. **Risk: LOW.**
- **Sequencing note:** listed last, cheapest applied first. Every other item on this list lands safer with it in place. Recommend pulling lint and the stashed Playwright suite forward into the P0 wave.

## P2-8 · Auth hardening (not part of the ceremony, documented for completeness)

- **No account lockout.** `authLimiter` rate-limits by IP, so distributed credential stuffing is unthrottled per account.
- **No breach check on passwords.** Complexity rules are solid (`auth.routes.ts:31-35` requires 8+ chars plus uppercase, lowercase, digit, and special character), but `Password@1` satisfies all of them and appears in every breach corpus. A HaveIBeenPwned range check is the cheap addition.
- **`sameSite: 'lax'` with no CSRF tokens.** The protection currently relies on an unstated invariant: **every mutating endpoint is POST/PATCH/DELETE.** `lax` still permits cross-site top-level `GET`, so a single `router.get` that mutates state breaks this today, not at some future date. It also breaks entirely if web and API ever move to separate domains and `sameSite` is relaxed to `none`. Make the invariant explicit or add tokens.

> **Correction:** an earlier draft of this register claimed the password policy was `min(8)` with no complexity requirement. That was wrong. The four complexity regexes at `auth.routes.ts:31-35` were missed on first read and caught by the adversarial review.

## P2-9 · Inventory operations (documented, not scheduled)

`Product.stock` is a bare integer. No stock ledger, no reason codes, no back-in-stock notifications. Admin has a low-stock widget and a bulk-restock endpoint, but no record of who changed stock or why.

---

# PART 4 — Documentation drift

Three findings are not missing features. They are places where `CLAUDE.md` describes behaviour the code does not have. This category is dangerous because it makes gaps invisible: a reviewer reads the doc, believes the mechanism exists, and never checks.

| ID | `CLAUDE.md` claims | Reality |
|---|---|---|
| **DRIFT-1** | "Stock changes during checkout go through `StockReservation` (soft-lock), not direct decrements" | `StockReservation` has zero references in `server/src`. Checkout decrements directly at `order.routes.ts:85`. **Not dead code: it is an unimplemented fix for the live P0-0 bug.** The doc describes the correct design as though it shipped, which is why the abandoned-cart leak went unnoticed. |
| **DRIFT-2** | `optionalAuth` is "used for guest checkout routes" | `optionalAuth` appears only on product read routes. Order creation requires `authenticate`. |
| **DRIFT-3** | `CartContext` is "(server-synced)" | Cart is `localStorage` only. |

**Recommendation:** fix the documentation in the same change that fixes the code, or immediately if the code fix is deferred. A wrong map is worse than no map.

---

# PART 5 — What already works

Verified end-to-end in Chrome with Playwright on a freshly migrated and seeded database: register, browse, add to cart, checkout with address, payment, admin ship, admin deliver, customer sees delivered. The order reached `DELIVERED` / `PAID` with both `OrderAuditLog` rows written.

Also solid, and deliberately not re-litigated in this document:

- JWT auth via httpOnly cookies with refresh-token rotation
- Coupon validation with global and per-user usage caps
- Invoice PDF generation and email delivery
- Wishlist, address CRUD, product and category browsing with pagination, search, and filters
- Admin dashboard analytics, product / category / coupon CRUD
- Storage provider abstraction (R2 to Cloudinary to local disk)
- Rate limiting on auth routes, `helmet`, and CORS
- 40 database indexes across the schema
- RMA backend: transactional state machine, refund idempotency under `Serializable`, HMAC-verified logistics webhook

The RMA backend deserves specific mention. It is the best-engineered part of this codebase and it is completely unreachable. That is the register's central finding.

---

# PART 6 — Failure modes registry

Rows where RESCUED is N, TEST is N, and the customer sees nothing are **CRITICAL GAPS**.

**CRITICAL GAP rule:** RESCUED=N and TEST=N and the customer is not told. One row per distinct defect, not per symptom.

```
CODEPATH                          | FAILURE MODE              | RESCUED | TEST | USER SEES        | LOGGED
----------------------------------|---------------------------|---------|------|------------------|--------
order.routes POST /               | abandoned cart, stock     | N ←GAP  | N    | Nothing          | N
                                  |   never released          |         |      |                  |
order.routes POST /               | concurrent stock exhaust  | N ←GAP  | N    | Nothing (accepts)| N
order.routes POST /:id/cancel     | paid order: no refund,    | N ←GAP  | N    | "Cancelled" (lie)| N
                                  |   no coupon release,      |         |      |                  |
                                  |   partial stock restore   |         |      |                  |
auth.routes POST /forgot-password | OTP predictable, in-memory| N ←GAP  | N    | "Invalid OTP"    | Y ←BAD
                                  |   and printed to console  |         |      |                  |
admin PATCH /orders/:id/status    | invalid status value      | N ←GAP  | Y    | 500              | N
product.routes GET /              | cache stale across nodes  | N ←GAP  | N    | Stale listing    | N
----------------------------------|---------------------------|---------|------|------------------|--------
rma.service issueRefund           | Razorpay refund fails     | Y       | Y    | Error message    | Y
rma.service issueRefund           | double refund attempt     | Y       | Y    | "Already issued" | Y
webhook /logistics                | unsigned request          | Y       | Y    | 400              | Y
webhook /logistics                | invalid status enum       | Y       | Y    | 400              | Y
webhook /razorpay                 | signature mismatch        | Y       | N    | 400              | Y
webhook /razorpay                 | replayed capture event    | Y       | N    | 200 no-op        | Y
order.routes POST /verify-payment | signature mismatch        | Y       | N    | 400              | N
```

**Critical gaps: 6** (4 in money or auth paths, 2 operational). Five of the six are silent to the customer.

The count differs from an earlier draft, which listed 5 by splitting the cancel handler across multiple rows and excluding two rows that met the stated rule. Both errors were caught in review; the rule above is now applied consistently.

**Not a gap, verified:** the Razorpay capture handler *is* idempotent. `webhook.routes.ts:68-71` checks `paymentStatus === 'PAID'` and breaks before invoice generation and email, so a redelivered capture cannot double-send. An adversarial reviewer flagged this as a defect; it was checked and rejected.

The contrast is instructive. The RMA and logistics rows are fully rescued, tested, and logged, because they were reviewed and hardened this session. The order-cancellation and oversell rows are not, because they never were. The gap is not skill, it is coverage.

---

# PART 7 — Error and rescue registry (selected)

```
METHOD/CODEPATH              | WHAT CAN GO WRONG            | EXCEPTION / CONDITION
-----------------------------|------------------------------|----------------------
order.routes POST /          | stock exhausted concurrently | stale read, no error raised
                             | Razorpay order creation fails| Razorpay API error
                             | address not owned by user    | createError 400
order.routes cancel          | Razorpay refund fails        | not attempted at all
                             | partial stock restore        | unhandled mid-loop
auth forgot-password         | OTP cache miss after restart | NodeCache eviction
                             | email service unconfigured   | silent no-op + console log
rma.service issueRefund      | already refunded             | guarded, throws
                             | RMA in wrong state           | guarded, throws
                             | Razorpay refund API failure  | throws, transaction rolls back

EXCEPTION / CONDITION         | RESCUED | RESCUE ACTION            | USER SEES
------------------------------|---------|--------------------------|------------------
stale stock read              | N ←GAP  | none                     | Order accepted ←BAD
refund never attempted        | N ←GAP  | none                     | "Cancelled" ←BAD
partial stock restore         | N ←GAP  | none                     | Nothing ←BAD
NodeCache eviction            | N ←GAP  | none                     | "Invalid OTP"
already refunded              | Y       | throw, no second refund  | "Already issued"
Razorpay refund API failure   | Y       | rollback transaction     | Error message
```

**Pattern-level finding:** 68 generic `catch (error)` blocks across `server/src/routes/`. Catch-all handling is a smell in every case. Named conditions with specific recovery are what make Section 2 of a review possible at all.

---

# PART 8 — Diagrams

## Order state machine, with the P0-2 defect marked

```
   PENDING ──payment──▶ CONFIRMED ──▶ PROCESSING ──▶ SHIPPED ──▶ DELIVERED
      │                     │              │                          │
      │                     │              │                          ├──▶ RMA flow
      ▼                     ▼              ▼                          │    (built, no UI)
   CANCELLED            CANCELLED      CANCELLED                       │
      │                     │              │                          ▼
      │                     └──────┬───────┘                      COMPLETED
      │                            │
      │                    ╔═══════▼════════════════════════╗
      └───────────────────▶║ P0-2: paymentStatus stays PAID ║
                           ║ no Refund row, no audit log    ║
                           ║ MONEY RETAINED                 ║
                           ╚════════════════════════════════╝
```

## Cancellation, all four paths

```
  INPUT ────▶ VALIDATE ────▶ MUTATE ────▶ RESTORE ────▶ NOTIFY
    │             │              │            │             │
    ▼             ▼              ▼            ▼             ▼
 [not owner]  [wrong state]  [status set]  [loop fails  [email fails
  404 ✓        400 ✓          ✓             midway] ✗    silently] ~

  HAPPY  : cancelled, stock restored, email sent, MONEY KEPT ✗
  NIL    : order not found            → 404 ✓
  EMPTY  : no items                   → loop no-ops ✓
  ERROR  : mid-loop failure           → partial restore, no record ✗
```

## RMA: built versus reachable

```
  CUSTOMER                    API                      ADMIN
  ────────                    ───                      ─────
  [no UI] ────✗────▶  POST /rma/request    ◀────✗──── [no UI]
  [no UI] ────✗────▶  GET  /rma            ◀──partial─ list only
  [no UI] ────✗────▶  admin/rma/:id/*      ◀────✗──── [no UI]
                             │
                             ▼
                    rma.service.ts
                    (complete, tested,
                     idempotent, audited)
                             │
                             ▼
                    webhook /logistics
                    (HMAC-verified, auto-refund)

  The engine runs. There are no pedals.
```

---

# PART 9 — Sequencing

| Wave | Contents | Why here |
|---|---|---|
| **0. Gate** | P0-0, P0-2, P0-4, P0-5, P0-1, plus lint and the stashed Playwright suite from P2-7 | Money and auth integrity, plus the ability to deploy. Ordered by certainty: P0-0 and P0-2 fire on normal traffic, P0-1 needs a race. Tests come first because every later wave lands safer with them. |
| **1. Unlock built work** | P0-3 (RMA UI), P1-1 (forgot-password UI) | Backends already exist. Highest value per unit of effort in the document. |
| **2. Conversion** | P2-3 (COD), P1-2 (guest checkout), P1-5a/b/c (checkout UX and form attributes), P1-6 (contact number) | Direct revenue impact, low structural risk. |
| **3. Structural** | P2-1 (variants) | Highest blast radius. Isolate it. Do not combine with anything else. |
| **4. Trust** | P2-2 (reviews), P1-3 (email verification), P1-4 (serviceability) | Conversion and fulfilment correctness. |
| **5. Scale** | P2-4 (server cart), P2-5 (SEO), P2-6 (logging), P1-7 (roles), P1-8 (data rights), P2-8 (auth hardening) | Growth and operability. |

**Ongoing, every wave:** fix the `CLAUDE.md` drift for whatever the wave touches. That habit is what prevents the next gap register from finding the same class of problem.

---

# PART 10 — Not in scope

Considered and deliberately excluded, each with a reason:

- **Multi-currency and internationalisation.** The product is clearly single-market India. Adding it speculatively is cost without a customer.
- **Marketplace / multi-vendor.** A different product, not a gap in this one.
- **Subscriptions and recurring billing.** No evidence of intent in the schema or config.
- **Mobile apps.** The responsive web app is the stated surface.
- **Recommendation engine.** Needs order volume that does not exist yet. Revisit after launch data.
- **Effort estimates in ideal-days for the whole backlog.** Sizing needs your team's velocity. Per-item human and CC estimates are given where an accepted expansion required a decision; a full estimated roadmap would be invented confidence.
- **Competitive and market positioning analysis.** I have no verifiable data on your market, pricing, or competitors. Including it would place guesswork next to evidence and devalue both.

---

# PART 11 — Caveats

Read these before acting on the document.

1. **Two P0 items are unreproduced.** P0-1 (oversell) and P0-2 (cancellation refund) are read from code and have not been observed failing. Both look unambiguous, but reproduce them before scheduling work. For P0-1 that means a concurrent load test that fails against current code. Treating an unverified reading as fact is how confident wrong fixes get shipped.

2. **Tiering is my judgment.** The evidence is verifiable; the P0/P1/P2 assignment reflects an assumption that you are about to take real payments from strangers. If this is a portfolio project or a staged internal pilot, the gate loosens considerably.

3. **Effort figures are rough.** Human estimates assume one experienced full-stack developer. CC figures reflect observed compression this session. Neither accounts for review, QA, or your context-switching.

4. **This document supersedes two earlier ones.** `mvp-gap-analysis-v1.md` and `v2-acceptance-criteria.md` in `workflow/artifacts/briefs/` are now redundant. Delete them or mark them superseded, so there is one source of truth rather than three.

5. **Coverage is broad, not exhaustive.** Eleven review dimensions were applied (architecture, errors, security, data flow, quality, tests, performance, observability, deployment, trajectory, design). A dedicated security audit or a load test would find things this did not.

---

---

# PART 12 — Open items not yet triaged

Surfaced during adversarial review, verified as real, but not yet assigned a tier. Listed so they are not lost.

- **No stock re-check at `verify-payment`.** An order can be paid after the product was deactivated or sold out by another buyer, because nothing revalidates between order creation and payment confirmation. Interacts with P0-0.
- **No order-modification window.** A customer cannot change the delivery address or cancel a single line item after purchase. Every such request becomes a support ticket and a manual database edit.
- **COD effort estimate may be optimistic.** P2-3 is costed at CC ~45min, but there is no `Order.paymentMethod` field today, so COD touches every payment branch, the refund paths, and the RMA refund-mode logic. Re-estimate before scheduling.

---

# PART 13 — Review record

This register was produced by `/plan-ceo-review` in SELECTIVE EXPANSION mode and then adversarially reviewed by an independent agent with no access to the analysis conversation.

**Reviewer score: 7/10** on the pre-correction draft. Findings and dispositions:

| # | Finding | Disposition |
|---|---|---|
| 1 | Password-policy claim was false | **ACCEPTED.** Verified: four complexity regexes exist. Claim removed, correction noted in P2-8. |
| 2 | Missed the abandoned-cart stock leak | **ACCEPTED.** Verified: decrement at creation, no reaper. Added as **P0-0**, the most certain defect in the register. Reframes DRIFT-1. |
| 3 | Coupon usage never released on cancel | **ACCEPTED.** Verified: zero coupon references in the cancel handler. Folded into P0-2. |
| 4 | P0-1 and P0-2 not equally certain | **ACCEPTED.** Gate reordered by certainty rather than severity. |
| 5 | P0-3 tier contradicts the P0 definition | **ACCEPTED.** Now explicitly marked not launch-blocking, sequenced into Wave 1. |
| 6 | Critical-gap count inconsistent with its own rule | **ACCEPTED.** Rule stated explicitly, table restructured, count corrected 5 → 6. |
| 7 | "16 pending operations" unverifiable as written | **ACCEPTED.** Exact command added, plus a warning about the destructive flag. |
| 8 | P1-5 bundled three unrelated defects | **ACCEPTED.** Split into P1-5a, P1-5b, P1-5c with separate evidence. |
| 9 | CSRF claim understated the risk | **ACCEPTED.** Rewritten to name the actual invariant being relied on. |
| 10 | Webhook lacks capture idempotency | **REJECTED.** Verified false: `webhook.routes.ts:68-71` checks `paymentStatus === 'PAID'` and breaks before invoice and email. Recorded in Part 6. |

Nine of ten findings accepted. One rejected after verification. Every accepted finding was independently confirmed against the codebase before amendment rather than taken on the reviewer's word.

---

## Change log

| Date | Change |
|---|---|
| 2026-07-19 | Initial register. Absorbs gap analysis v1 and v2. Seven growth items accepted via cherry-pick ceremony (E1 variants, E2 reviews, E3 COD, E4 server cart, E5 SEO, E6 logging, E7 tests). |
| 2026-07-19 | Adversarial review pass. Added P0-0 (abandoned-cart stock leak). Corrected a false password-policy claim. Added coupon-release defect to P0-2. Reordered the gate by certainty. Reclassified P0-3 as not launch-blocking. Split P1-5. Corrected critical-gap count 5 → 6. Rejected one reviewer finding after verification. |
