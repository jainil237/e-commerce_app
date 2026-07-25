# MVP Gap Analysis v2 + Acceptance Criteria

status: ready-for-next-phase
date: 2026-07-19
supersedes: mvp-gap-analysis-v1.md (v1 findings carried forward, not repeated in full)
method: static code evidence, file:line cited. Runtime behaviour verified in Chrome only where stated.

---

# PART A — New findings (research pass 2)

## A1 · P0 · Cancelling a paid order keeps the customer's money
`server/src/routes/order.routes.ts:626-676`

A customer may cancel while `PENDING | CONFIRMED | PROCESSING`. The handler sets
`status: 'CANCELLED'`, restores stock, sends an email — and stops.

It never: issues a Razorpay refund, creates a `Refund` row, or changes `paymentStatus`.
A CONFIRMED order is by definition already `PAID` (set by `verify-payment`). So the customer
cancels, the goods are released back to stock, and the money is silently retained.

Also missing: no `OrderAuditLog` entry (violates the `CLAUDE.md` rule that every status mutation
writes one), and the stock restore loop runs outside a transaction — a mid-loop failure leaves
some items restored and others not.

## A2 · P0 · No product variants
`schema.prisma` `model Product` carries a single `sku`, single `price`, single `stock`.
There is no variant/option model.

The seed ships a "Premium Cotton T-Shirt" under a "Fashion" category. Apparel without
size/colour is not sellable. Every variant must currently be modelled as a separate product with
a separate slug, which fragments PDPs, search, and inventory.

This is structural: adding variants later means migrating `OrderItem`, cart payloads, stock
logic, and RMA item references. Cheaper now than after launch.

## A3 · P1 · Zero SEO infrastructure
No `sitemap.ts`, no `robots.ts`, no `generateMetadata` in any page, no JSON-LD anywhere
(`grep "application/ld+json"` → nothing).

For a storefront, organic search is a primary acquisition channel. Product pages currently
cannot rank, and have no rich results (price, availability, rating) in Google.

## A4 · P1 · Cart is device-local, not server-synced
`cart.routes.ts` exposes only `/snapshot` and `/validate-checkout`. Cart state lives in
`localStorage` (`cart.context.tsx`).

`CLAUDE.md` describes `CartContext` as "(server-synced)" — it is not. Consequences: cart does not
follow the user across devices or browsers, and is lost when storage is cleared. This is also the
prerequisite for abandoned-cart recovery, which is typically a large revenue lever.

## A5 · P1 · No pincode serviceability or real shipping rates
Shipping is a flat `config.shipping.baseShippingCharge`, free above a threshold
(`order.routes.ts:117-119`). There is no serviceability check, no zone/weight-based pricing, and
no COD availability check — despite `Product.weight` existing and courier partners being
configured in `Store.config.json`.

Customers in non-serviceable pincodes can place orders that cannot be fulfilled.

## A6 · P1 · No Cash on Delivery
Only Razorpay prepaid. COD is the dominant payment method in the Indian market this app targets
(₹ pricing, GST, Delhivery, pincode format). Its absence is a major conversion ceiling.

## A7 · P2 · Auth hardening gaps
- **No account lockout / failed-attempt tracking** — `authLimiter` rate-limits by IP only, so
  distributed credential stuffing is unthrottled per-account.
- **Weak password policy** — `min(8)` only (`auth.routes.ts:31`); no complexity or breach check.
- **`sameSite: 'lax'`** on auth cookies with **no CSRF tokens**. `lax` blocks cross-site POST, so
  this is not currently exploitable — but any future `sameSite: 'none'` (needed if web and API move
  to different domains) silently opens CSRF across every mutating endpoint.

## A8 · P2 · No structured logging or error monitoring
No winston/pino/Sentry — `console.log`/`console.error` only. In production there is no way to
trace a failed payment, search errors, or alert on a spike. Several catch blocks swallow errors
into `console.error` with a generic 500 to the client.

## A9 · P2 · Single admin role
`enum Role { CUSTOMER, ADMIN }`. Any admin can issue refunds, edit prices, and delete products.
No separation for support staff vs finance vs catalogue管理. Combined with A1/RMA refunds, that is
meaningful financial exposure.

## A10 · P2 · No GDPR/DPDP data rights
No account deletion, no data export. India's DPDP Act and GDPR both require erasure and portability.
`OrderAuditLog` and `Order` retain PII indefinitely with no retention policy.

## A11 · P2 · No inventory operations
`Product.stock` is a bare integer. No stock ledger, no reason codes, no supplier/PO concept, no
back-in-stock notifications. Admin has a `low-stock` dashboard widget and a `bulk-restock`
endpoint, but no audit of who changed stock or why.

---

# PART B — Consolidated backlog

Carried from v1: oversell race (V1-1), dead `StockReservation` (V1-2), in-memory OTP (V1-3),
RMA has no UI (V1-4), no forgot-password UI (V1-5), no reviews (V1-6), no guest checkout (V1-7),
no email verification (V1-8), no tests (V1-9), broken lint (V1-10), incomplete migrations (V1-11),
unset webhook secret (V1-12), checkout UX + missing input `name`/`id` (V1-13), ponytail debt (V1-14).

**Release gate (must ship before real traffic):**
V1-1, A1, V1-3, V1-11, V1-4, V1-5

**Revenue-critical (ship in first iteration after gate):**
A6 (COD), V1-7 (guest checkout), A2 (variants), V1-6 (reviews), A5 (serviceability)

**Growth / hardening (next):**
A3 (SEO), A4 (server cart + abandoned cart), A7, A8, A9, A10, A11, V1-9, V1-10

---

# PART C — Acceptance criteria

Format: each story has a rationale, testable AC in Given/When/Then, and explicit out-of-scope.
"Verified by" names the check that proves it — an automated test where one is reasonable.

---

## EPIC 1 — Payment integrity

### STORY 1.1 · Refund on customer cancellation
**Why:** today a paid cancellation keeps the money (A1).

**AC**
1. GIVEN an order with `paymentStatus = PAID` and status in `PENDING|CONFIRMED|PROCESSING`
   WHEN the customer cancels
   THEN a Razorpay refund is issued for the full order total,
   AND a `Refund` row is created linked to the order,
   AND `paymentStatus` becomes `REFUNDED`,
   AND `status` becomes `CANCELLED`.
2. GIVEN an order with `paymentStatus = PENDING` (never paid)
   WHEN the customer cancels
   THEN no refund is attempted and `status` becomes `CANCELLED`.
3. GIVEN the Razorpay refund API call fails
   WHEN cancellation is attempted
   THEN the whole operation rolls back (order stays un-cancelled, stock unchanged),
   AND the customer sees an actionable error,
   AND the failure is logged with the order id.
4. Cancellation, stock restore, refund, and audit write occur in **one** transaction —
   no partial state is observable.
5. An `OrderAuditLog` row is written with `action='ORDER_CANCELLED'`, `fromState`, `toState`,
   and the acting `userId`.
6. Cancelling an already-`CANCELLED` order is rejected with 400 and issues no second refund.
7. Two concurrent cancel requests for the same order result in exactly **one** refund.

**Out of scope:** partial/line-item cancellation.
**Verified by:** integration test incl. a concurrency case (two parallel cancels → one refund).

### STORY 1.2 · Fix the overselling race
**Why:** stock is compared against a stale pre-transaction read (V1-1).

**AC**
1. GIVEN a product with `stock = 1`
   WHEN two orders for quantity 1 are submitted concurrently
   THEN exactly one succeeds and the other fails with `INSUFFICIENT_STOCK`,
   AND final stock is `0` — never negative.
2. Stock is re-read **inside** the transaction, or enforced via a conditional
   `updateMany(where: { stock: { gte: qty } })` treating `count === 0` as failure.
3. A `CHECK (stock >= 0)` constraint (or equivalent) exists so the invariant cannot be violated
   even by a future code path.
4. Existing single-order checkout behaviour is unchanged.

**Verified by:** a load test firing N concurrent orders at stock = 1, asserting 1 success and
`stock = 0`. This must fail against the current code before the fix lands.

### STORY 1.3 · Persist password-reset OTPs
**Why:** OTPs are in `NodeCache` and generated with `Math.random()` (V1-3).

**AC**
1. OTPs are stored in a `PasswordResetToken` table: `userId`, `tokenHash`, `expiresAt`, `usedAt`.
2. The token is generated with `crypto.randomInt` (or `randomBytes`), never `Math.random`.
3. Only a **hash** of the token is persisted; the plaintext exists only in the email.
4. GIVEN a valid unexpired OTP WHEN used once THEN the reset succeeds and `usedAt` is set;
   a second use is rejected.
5. Tokens expire after 10 minutes; expired tokens are rejected with a distinct message.
6. A server restart does **not** invalidate an in-flight reset.
7. Requesting a new OTP invalidates any previous unused OTP for that user.
8. Response to `/forgot-password` is identical for registered and unregistered emails
   (no enumeration) — preserve existing behaviour.
9. Reset attempts are rate-limited per account, not only per IP.

**Verified by:** integration test covering reuse, expiry, and restart-survival.

---

## EPIC 2 — Make the RMA feature reachable

Backend is complete; nothing here changes it. This is UI only (V1-4).

### STORY 2.1 · Customer return/replacement request
**AC**
1. GIVEN a `DELIVERED` order within the product's `returnWindow`
   THEN the order-detail page shows a "Request return or replacement" action.
2. GIVEN an order that is not `DELIVERED`, or past the window, or whose products are
   `isReturnable = false` / `isReplaceable = false`
   THEN the action is hidden or disabled **with the reason shown** (not silently absent).
3. The customer can select which line items and what quantity — capped at the ordered quantity.
4. The customer picks type (`RETURN` | `REPLACEMENT`) and a `ReturnReason` from the enum.
5. For `RETURN`, the customer picks a refund mode; bank details are required for `BANK_ACCOUNT`.
6. Image upload is supported (`RMAImage`), max 5 images, ≤5 MB each, jpeg/png/webp only —
   matching the existing multer limits.
7. On submit, `POST /api/v1/rma/request` is called; success shows the RMA number and the
   request appears in the customer's RMA list.
8. Server-side validation errors surface as readable messages, not raw API text.
9. The customer can view RMA status and cancel while `PENDING`.

### STORY 2.2 · Admin RMA workspace
**AC**
1. A dedicated admin RMA section lists requests, filterable by `status` and `type`.
2. Each request shows: customer, order number, items, reason, customer note, and images.
3. Actions are available and wired to the existing endpoints, each shown **only** in the
   state where it is legal:
   - `PENDING` → Approve, Reject (reject requires a reason)
   - `APPROVED` → Schedule pickup (courier + AWB)
   - `PICKUP_SCHEDULED` → Mark received (with a restock yes/no choice)
   - `ITEM_RECEIVED` + type `RETURN` → Issue refund
   - `ITEM_RECEIVED` + type `REPLACEMENT` → Ship replacement (courier + AWB)
4. Issue-refund requires an explicit confirmation step stating the amount.
5. After any action the row refreshes to the new state without a full page reload.
6. A failed action shows the server's message and leaves the UI in the prior state.
7. The RMA timeline (status transitions) is visible, sourced from `OrderAuditLog`.

**Out of scope:** bulk actions, CSV export.
**Verified by:** Playwright walking the full RMA lifecycle through the UI.

---

## EPIC 3 — Account access

### STORY 3.1 · Forgot / reset password UI
**Why:** endpoints exist, no pages (V1-5). Depends on Story 1.3.

**AC**
1. The login page links to "Forgot password?".
2. Submitting an email always shows the same confirmation, regardless of registration status.
3. The reset page accepts the OTP and a new password, with confirm-password matching.
4. Password rules are stated up front and validated client- and server-side.
5. On success the user is redirected to login with a success message; the old password no longer works.
6. Invalid/expired OTP produces a specific, non-enumerating error with a "resend" affordance.
7. Resend is rate-limited with a visible cooldown.

### STORY 3.2 · Email verification
**AC**
1. `User` gains `emailVerifiedAt DateTime?`.
2. Registration sends a verification link/OTP; the account is usable but flagged unverified.
3. Unverified users see a persistent, dismissible banner with a resend action.
4. Checkout is **not** blocked by unverified email (avoid killing conversion) — decision recorded here deliberately.
5. Verification is idempotent; an already-verified token is a no-op with a friendly message.
6. Tokens expire after 24 hours; resend is rate-limited.

### STORY 3.3 · Guest checkout
**Why:** `Order.userId` is already nullable; only the route blocks it (V1-7).

**AC**
1. A guest with items in the cart reaches checkout without being forced to register.
2. Guest checkout collects email + phone + address; the order is created with `userId = null`.
3. Order-creation route uses `optionalAuth` rather than `authenticate`.
4. Confirmation email is sent to the guest email; the invoice attaches as it does for users.
5. A guest can look up an order by order number + email (order-tracking page).
6. If the guest email matches an existing account, they are offered login but never blocked.
7. After registering with the same email, prior guest orders are linked to the account.
8. All stock, coupon, and payment rules behave identically to an authenticated checkout.

**Verified by:** end-to-end guest purchase with no session cookie.

---

## EPIC 4 — Catalogue depth

### STORY 4.1 · Product variants
**Why:** apparel is unsellable without it (A2). Structural — do before launch.

**AC**
1. A `ProductVariant` model exists: `productId`, `sku` (unique), `price`, `stock`,
   `attributes` (e.g. `{size, colour}`), `isActive`.
2. `OrderItem`, cart items, `StockReservation`, and `RMAItem` reference the variant, not the product.
3. PDP renders variant selectors; unavailable combinations are disabled, not hidden.
4. Price and stock update on selection without a page reload.
5. Add-to-cart is blocked until a full variant is selected.
6. Admin can create/edit/deactivate variants and set per-variant stock.
7. A product with no variants continues to behave exactly as today (single implicit variant) —
   **existing orders and data must not break**.
8. A migration backfills one implicit variant per existing product; all historical `OrderItem`
   rows resolve correctly afterwards.

**Out of scope:** variant-level images, per-variant weight.
**Risk:** highest-blast-radius item in this document — sequence it with a dedicated migration plan.

### STORY 4.2 · Reviews and ratings
**AC**
1. A `Review` model exists: `productId`, `userId`, `orderId?`, `rating` 1-5, `title?`, `body`,
   `status` (`PENDING|APPROVED|REJECTED`), timestamps.
2. Only a user with a `DELIVERED` order containing that product may review it —
   flagged "Verified purchase".
3. One review per user per product; editable within 30 days.
4. PDP shows average rating, count, and a rating-distribution histogram.
5. Reviews are paginated and sortable (recent / highest / lowest / most helpful).
6. New reviews default to `PENDING`; only `APPROVED` are publicly visible.
7. Admin can approve/reject with a reason.
8. Aggregate rating is denormalised onto `Product` and recomputed on approval/removal.
9. PLP cards and search results can sort by rating.

**Out of scope:** review images, helpful-votes, seller replies (schema should not preclude them).

---

## EPIC 5 — Checkout conversion

### STORY 5.1 · Cash on Delivery
**AC**
1. `Order` gains a `paymentMethod` (`PREPAID | COD`).
2. COD is selectable at checkout when the pincode and cart qualify.
3. COD eligibility is configurable in `Store.config.json`: max order value, allowed pincodes,
   excluded categories.
4. A COD order is created with `paymentStatus = PENDING` and `status = CONFIRMED`, and
   decrements stock exactly as prepaid does.
5. An optional COD fee is added as a visible line item.
6. Marking a COD order delivered sets `paymentStatus = PAID` and writes an audit entry.
7. COD orders are excluded from Razorpay refund flows; RMA refunds use `BANK_ACCOUNT`/`UPI` mode.
8. Admin can filter orders by payment method.

### STORY 5.2 · Pincode serviceability and shipping rates
**AC**
1. A serviceability check runs on the PDP and at checkout for the entered pincode.
2. A non-serviceable pincode blocks checkout with a clear message before payment is attempted.
3. Shipping cost is computed from zone and total weight (`Product.weight` already exists),
   falling back to the flat rate when data is missing.
4. Free-shipping threshold continues to apply and is shown as "₹X away from free delivery".
5. An estimated delivery date range is shown on the PDP and at checkout.
6. Serviceability data is admin-maintainable without a deploy.

### STORY 5.3 · Checkout UX fixes
**Why:** observed in Chrome (V1-13).

**AC**
1. When a user has exactly one saved address, it is pre-selected.
2. When a new address is saved from checkout, it becomes the selected address.
3. "Add Address" opens inline/modal at checkout and never navigates away.
4. When Pay is disabled, the page states why ("Select a delivery address").
5. Every form input has `name` and `id`, with a `<label htmlFor>` — password managers and
   autofill work, and inputs are reachable by accessible name.
6. Double-clicking Pay cannot create two orders (button disables on submit + idempotency key).

**Verified by:** the existing Playwright lifecycle spec, extended — it currently has to click the
address radio manually, which is the bug in AC-1.

---

## EPIC 6 — Growth and operability

### STORY 6.1 · SEO foundation
**AC**
1. `sitemap.ts` emits all active products, categories, and static pages, with `lastModified`.
2. `robots.ts` allows crawling and references the sitemap; `/account`, `/cart`, `/checkout`
   are disallowed.
3. Every product page implements `generateMetadata` — title, description, canonical, OG, Twitter.
4. PDPs emit `Product` JSON-LD with price, currency, availability, and aggregate rating.
5. Category pages emit `BreadcrumbList` JSON-LD.
6. All product images have meaningful `alt` text.
7. Lighthouse SEO ≥ 95 on home, PLP, and PDP.

### STORY 6.2 · Server-side cart
**AC**
1. An authenticated user's cart persists server-side and is identical across devices/browsers.
2. On login, a guest cart merges with the stored cart — quantities summed, capped at stock.
3. Cart survives logout→login without loss (regression guard for the bug fixed in `37e4b18`).
4. Cart operations are optimistic client-side, reconciled with the server.
5. Cart items revalidate price and stock on load; changes are surfaced explicitly.

### STORY 6.3 · Structured logging and error monitoring
**AC**
1. A structured logger (pino/winston) replaces `console.*` in server code.
2. Every request logs a correlation id, propagated into downstream calls.
3. Payment, refund, RMA transition, and webhook events log at info with identifiers —
   never card data, tokens, or secrets.
4. Unhandled errors report to an error tracker with request context.
5. Log level is env-configurable; production defaults to info.
6. No secret, password hash, or full PII record is ever logged.

### STORY 6.4 · Admin roles
**AC**
1. `Role` extends to at least `SUPPORT`, `CATALOGUE_MANAGER`, `FINANCE`, `SUPER_ADMIN`.
2. Refunds and RMA financial actions require `FINANCE` or `SUPER_ADMIN`.
3. Product/category/coupon writes require `CATALOGUE_MANAGER` or `SUPER_ADMIN`.
4. Order status changes and RMA non-financial actions are available to `SUPPORT`.
5. User management requires `SUPER_ADMIN`.
6. Authorisation is enforced **server-side**; hiding UI is not sufficient.
7. Existing `ADMIN` users migrate to `SUPER_ADMIN` with no loss of access.

### STORY 6.5 · Test and lint baseline
**AC**
1. ESLint runs non-interactively in all three workspaces; `npm run lint` exits 0/1 without prompting.
2. `server` has a working `lint` script.
3. A test runner is configured; `npm test` runs at root and per workspace.
4. The stashed Playwright lifecycle spec is committed and runs in CI against a seeded DB.
5. Integration tests cover: oversell race, cancellation refund, RMA lifecycle, coupon limits,
   payment verification.
6. CI runs typecheck + lint + tests on every PR and blocks merge on failure.
7. Test data is created and torn down per test — no reliance on a pre-seeded mutable DB.

### STORY 6.6 · Data rights (DPDP / GDPR)
**AC**
1. A user can request account deletion from their account page.
2. Deletion anonymises PII on orders (legally retained for tax) rather than hard-deleting them.
3. A user can export their data as JSON — profile, orders, addresses, reviews, RMAs.
4. A documented retention policy exists for `OrderAuditLog` and abandoned guest data.
5. Deletion requests are logged and confirmed by email.

---

# PART D — Sequencing

| Wave | Stories | Rationale |
|------|---------|-----------|
| **0 — Gate** | 1.2, 1.1, 1.3, V1-11 (migration baseline) | Money and data integrity; nothing ships past these |
| **1 — Unlock built work** | 2.1, 2.2, 3.1 | Backend already exists; UI-only, high value per effort |
| **2 — Revenue** | 5.1 (COD), 3.3 (guest), 5.3 (checkout UX) | Direct conversion impact, low structural risk |
| **3 — Structural** | 4.1 (variants) | Highest blast radius — isolate it in its own wave |
| **4 — Trust** | 4.2 (reviews), 3.2 (email verification), 5.2 (serviceability) | Conversion + fulfilment correctness |
| **5 — Scale** | 6.1 SEO, 6.2 server cart, 6.3 logging, 6.4 roles, 6.5 tests, 6.6 data rights | Growth and operability |

Wave 6.5 (tests/lint) is listed last but is **cheapest applied early** — every wave above lands
safer with it in place. Recommend pulling its AC-1 through AC-3 forward into Wave 0.

---

# Caveats on this analysis

- All findings are static-evidence based unless marked as Chrome-verified. **A1 (cancellation
  refund) and V1-1 (oversell race) are read from code and have not been reproduced at runtime** —
  reproduce both before scheduling, since each drives a Wave 0 story.
- Three findings are **documentation drift**, where `CLAUDE.md` describes behaviour the code does
  not have: `StockReservation` soft-lock (V1-2), guest checkout via `optionalAuth` (V1-7), and
  server-synced cart (A4). Correct the docs alongside the code, or the next contributor inherits
  the same false map.
- Effort estimates are deliberately absent — sizing needs the team's velocity, not a guess from me.
