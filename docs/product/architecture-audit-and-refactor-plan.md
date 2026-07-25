# Architecture Audit & Refactor Plan

**Date:** 2026-07-19
**Scope:** whole repo — `server/`, `apps/web`, `apps/admin`, `shared/`
**Method:** static read of every layer. Nothing here was reproduced at runtime; severity is reasoned from code, not from an incident. Items marked **[unverified]** need a runtime check before you act on them.

---

## 1. Architectural overview

```
                    ┌──────────────────────────────┐
                    │  Store.config.json (root)    │
                    │  feature flags, couriers,    │
                    │  shipping, invoice settings  │
                    └───────┬──────────────┬───────┘
                            │              │
        ┌───────────────────▼──┐      ┌────▼────────────────────┐
        │ apps/web  :3000      │      │ apps/admin  :3001       │
        │ Next 14 App Router   │      │ Next 14 App Router      │
        │ 6 React Contexts     │      │ own providers (dup'd)   │
        │ SWR (2 call sites)   │      │ raw fetch + useState    │
        │ ~50 raw fetch sites  │      │ D3 / Recharts           │
        └───────┬──────────────┘      └────┬────────────────────┘
                │  Next rewrites → /api/v1 │
                └────────────┬─────────────┘
                             │  httpOnly cookies
                    ┌────────▼──────────────────────────┐
                    │ server :4000  Express 5           │
                    │                                   │
                    │  index.ts ─ hand-rolled cookie    │
                    │             parser, helmet, cors, │
                    │             rate limits           │
                    │      │                            │
                    │  routes/*.ts  ◄── ALL domain      │
                    │   admin 1370  logic lives here    │
                    │   order  679  (Zod inline,        │
                    │   auth   409   Prisma direct,     │
                    │   ...          try/catch x60)     │
                    │      │                            │
                    │  services/  ← I/O only            │
                    │   email 858, invoice, storage,    │
                    │   r2, cloudinary                  │
                    │   rma.service ← the ONLY domain   │
                    │                  service          │
                    └────────┬──────────────────────────┘
                             │ Prisma 5
                    ┌────────▼──────────┐   ┌──────────────┐
                    │ MySQL · 18 models │   │ Razorpay     │
                    │ indexes: good     │   │ webhook HMAC │
                    └───────────────────┘   └──────────────┘

        shared/  ── not a workspace package. Imported by
                    tsconfig alias in 2 apps, and by 4 raw
                    `../../../../../../shared/` escapes in admin.
```

### The shape of the problem, in one line

The backend has **no domain layer**. Routes are the domain layer. `services/` holds I/O adapters (email, PDF, storage) plus one real service (`rma.service.ts`) that shows what the rest should have looked like. Meanwhile the frontend has **no data layer** — no API client, SWR configured globally but used twice, ~50 hand-rolled `fetch` calls in `useEffect`.

Both gaps produce the same failure mode: logic that should exist once exists N times, and the fixes only land on some of the copies. The clearest evidence is `toast.context.tsx:21` in web, which fixed a colliding-toast-id bug with a random suffix, while `admin/providers.tsx:107` still uses bare `Date.now()` and still has the bug. That is the duplication tax, already being paid.

---

## 2. Findings

Severity: **P0** = correctness/security, fix now. **P1** = real bug or real risk, fix this cycle. **P2** = structural debt, schedule it.

### P0-1 — Stock check reads a stale snapshot; inventory can oversell

`server/src/routes/order.routes.ts:52-88`

```ts
const products = await prisma.product.findMany(...)      // :52  read OUTSIDE the tx
await prisma.$transaction(async (tx) => {
  for (const id of sortedProductIds) {
    await tx.$executeRaw`SELECT id FROM Product WHERE id = ${id} FOR UPDATE`
  }
  for (const item of validatedData.items) {
    const product = products.find(p => p.id === item.productId)!   // stale
    if (product.stock < item.quantity) throw ...                   // :78
    await tx.product.update({ data: { stock: { decrement: item.quantity } } })
  }
})
```

The `FOR UPDATE` rows are locked and then thrown away — the comparison at `:78` uses the array fetched at `:52`, before the transaction opened. Two concurrent orders both snapshot `stock: 1`, both pass, both decrement. Stock goes negative, both orders are accepted. The lock serializes the transactions but the check uses pre-lock data, so serialization buys nothing.

**Fix — delete the raw SQL, use a conditional update.** No explicit lock needed; the DB does it:

```ts
await prisma.$transaction(async (tx) => {
  for (const item of validatedData.items) {
    const { count } = await tx.product.updateMany({
      where: { id: item.productId, stock: { gte: item.quantity } },
      data:  { stock: { decrement: item.quantity } },
    });
    if (count !== 1) throw createError(409, `Insufficient stock`, 'OUT_OF_STOCK');
  }
});
```

One statement per item, atomic by definition, and it removes the only raw SQL in the codebase.

### P0-2 — Every validation error returns 500 in production

`server/src/middleware/error.middleware.ts:9`

The handler has no `ZodError` branch. A `ZodError` carries no `statusCode`, so it falls to the default and, in prod, is masked as `500 "Something went wrong"`. Every `schema.parse(req.body)` call site in the codebase — which is every validated endpoint — lies to the client about what went wrong. A user typing a bad postcode gets a server error.

**Fix — one branch, before the generic case:**

```ts
if (err instanceof ZodError) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    data: err.flatten().fieldErrors,
  });
}
```

### P0-3 — Razorpay webhook HMAC is computed over a re-serialized body

`server/src/routes/webhook.routes.ts:19`

The signature is verified against `JSON.stringify(req.body)` — the output of `express.json()` re-serialized, not the bytes Razorpay signed. Key ordering and whitespace do not reliably survive that round-trip. `timingSafeEqual` and the length guard are correct; the input to them is not.

**Fix:** mount `express.raw({ type: 'application/json' })` on the webhook route only, verify the HMAC against `req.body` (a Buffer), then `JSON.parse` it. Note `.claude/CLAUDE.md` marks this file as requiring explicit approval — **do not change it without a sign-off**, and verify against a real Razorpay test-mode event before merging.

**[unverified]** — if webhooks are landing successfully in production today, the round-trip may happen to be stable for Razorpay's payload shape. That is luck, not a guarantee. Confirm before deprioritizing.

### P0-4 — Admin dashboard renders before any role check

`apps/admin/src/components/providers.tsx:145,169` · `(dashboard)/layout.tsx:21`

The `role !== 'ADMIN'` throw exists only on the login path (`:169`). `checkAuth()` at `:145` calls `setUser(data.data)` with no role test, and the layout guard tests only `!user`. A CUSTOMER cookie that loads `/dashboard` directly renders the full admin shell. The API calls behind it will 403 (`authorizeAdmin` is mounted router-wide server-side, which is the control that matters), so this is a UI-surface leak rather than a data breach — but it exposes admin structure and it is a two-line fix.

**Fix:** add the role check to `checkAuth`, and test `!user || user.role !== 'ADMIN'` in the layout guard.

### P1-1 — Checkout refetch loop

`apps/web/src/app/checkout/page.tsx:131`

`useEffect(..., [items, subtotal])` where `items` is a fresh array identity on every `CartProvider` render, and the effect body calls `setProducts` / `setCheckoutValid` / `setAvailableCoupons`. Each set re-renders → new `items` identity → effect refires. `validate-checkout` and `coupons/available` get hammered continuously while the page is open. Same pattern at `cart/page.tsx:69`.

**Fix:** depend on a stable key, e.g. `useMemo(() => items.map(i => `${i.productId}:${i.quantity}`).join(','), [items])`, and use that string in the dep array. The deeper fix is P2-2 (memoize context values).

### P1-2 — Double-order race at checkout

`apps/web/src/app/checkout/page.tsx:216-246`

`setIsLoading(false)` at `:246` runs while the Razorpay handler is still pending, so the pay button re-enables mid-payment. A second click creates a second order against the same cart. Related: `:200` clears the cart only on the success branch — if `verify-payment` succeeds server-side but the response is lost, the cart survives and the user can re-order.

**Fix:** keep `isLoading` true until the Razorpay callback resolves or the modal is dismissed; guard the handler on entry with a ref, not state. Server-side, add an idempotency key on order creation so a duplicate submit is rejected at the API rather than relying on the button.

### P1-3 — Coupon validated against a price the server disagrees with

`apps/web/src/app/checkout/page.tsx:83,141`

`applyCoupon` posts `orderValue: subtotal`, computed from localStorage prices, while the order total uses server-confirmed prices from `validate-checkout`. `freshSubtotal` is computed at `:83` and then discarded — `total` at `:58` never reads it. A stale localStorage price yields a discount the server would not have granted.

**Fix:** make `freshSubtotal` the single source for both the summary and the coupon call. Server-side, recompute and re-validate the discount at order creation; never trust a client-supplied `orderValue`.

### P1-4 — Refresh tokens are never rotated or invalidated

`server/src/middleware/auth.middleware.ts:64-94` · `auth.routes.ts:125,179`

`findFirst({ token, userId, expiresAt: { gt: now } })` validates and issues a new access token, but the refresh token itself is neither rotated nor consumed. Register and login each *create* a row without clearing prior ones, so rows accumulate per login and every one stays valid for its full 7 days. Logout deletes only the token presented. A stolen refresh token grants 7 days of access with no detection and no revocation path.

**Fix:** rotate on use — delete the presented row, issue a new one, in one transaction. Add reuse detection: a request presenting an already-deleted token invalidates the whole family for that user. Cap or prune rows per user on login.

### P1-5 — Stock restore is non-transactional, in three places

`order.routes.ts:656-661` (cancel) · `webhook.routes.ts:114-118` (payment failed) · `webhook.routes.ts:132-136` (refund)

Three independent `for` loops of individual `update` calls, all doing the same thing. A crash mid-loop leaves stock partially restored, and the three copies will drift.

**Fix:** one `restoreStock(orderId, tx)` helper, called from all three, wrapped in a transaction.

### P1-6 — JWT verification does not pin the algorithm

`server/src/middleware/auth.middleware.ts:47-57`

`jwt.verify(token, SECRET)` with no `{ algorithms: ['HS256'] }`, no issuer, no audience. Modern `jsonwebtoken` rejects `alg: none` by default so this is not immediately exploitable, but algorithm confusion is exactly the class of bug that pinning exists to close, and it costs one line.

**Fix:** `jwt.verify(token, SECRET, { algorithms: ['HS256'], issuer: 'ecom-api' })`.

### P1-7 — Uploads accept any MIME type

`server/src/routes/admin.routes.ts:25-29`

Multer is configured with `limits` (5MB, 5 files) but no `fileFilter`. Arbitrary file types are accepted and forwarded to the storage provider. Combined with `/uploads` being served statically from `index.ts`, a stored HTML or SVG file is a stored-XSS vector on the local-disk storage path.

**Fix:** add a `fileFilter` allowlisting `image/jpeg|png|webp|avif`, validate magic bytes rather than trusting the declared MIME, and serve `/uploads` with `Content-Disposition: attachment` plus a restrictive CSP.

### P1-8 — Cookie parser 500s on a malformed cookie

`server/src/index.ts:36-52`

17 hand-rolled lines replacing `cookie-parser`, with no signed-cookie support. `decodeURIComponent` on an attacker-controlled cookie value throws `URIError` on a malformed `%` sequence — synchronously, in middleware, so every request from that client 500s until the cookie is cleared.

**Fix:** delete it, `npm i cookie-parser`, `app.use(cookieParser())`. This also removes the duplicate parser at `auth.middleware.ts:26-45`.

### P1-9 — OTP store is in-memory

`server/src/routes/auth.routes.ts:17`

`NodeCache`, 10-minute TTL. Breaks on restart and cannot work behind more than one instance. Fine for single-node today; a silent correctness failure the moment you scale out or deploy during someone's signup.

**Fix:** move to a `VerificationCode` table with a TTL index, or Redis if you already run one. Table is simpler and you already have MySQL.

### P1-10 — `StockReservation` is fully modeled and entirely unused

`server/prisma/schema.prisma:219-235`

The model exists with `productId`, `userId`, `sessionId`, `expiresAt`, `status` and five supporting indexes. `grep -rn "stockReservation" server/src/` returns zero hits. `CLAUDE.md` documents soft-locking during checkout as a key pattern and `Store.config.json` carries `inventory.reservationDurationMinutes`. None of it is wired up.

This matters beyond dead code: the documentation describes a safety property the system does not have, and P0-1 is the direct consequence.

**Decision needed.** Either implement reservations (correct for a 15-minute payment window — reserve on checkout entry, convert on payment success, expire via a sweeper) or delete the model and the config key and fix the docs. Do not leave it as is. See §4 for the recommendation.

### P1-11 — `OrderAuditLog` cascades on user delete

`server/prisma/schema.prisma:123,413`

`Order.user` is deliberately `SetNull` (`:123`) so orders survive user deletion — correct, and clearly intentional. But `OrderAuditLog.user` at `:413` is `onDelete: Cascade`, so deleting a user wipes the audit trail for the very orders you just chose to retain. The schema contradicts itself one field apart. `CLAUDE.md` calls this log append-only.

**Fix:** change to `SetNull`, migration required.

### P2-1 — No domain layer on the server

`admin.routes.ts` is 1370 lines and 36 endpoints — dashboard analytics, products, categories, orders, shipments, users, coupons, and storage in one file, 21% of the backend. `order.routes.ts:34` is a single ~220-line handler doing address ownership, product fetch, the stock transaction, totals, coupon application, Razorpay order creation, the DB write, and email dispatch.

The pattern repeats in all 11 route files: Zod inline at the top, `parse` in the handler, Prisma direct, `try/catch → next(e)` around everything. `rma.service.ts` is the counter-example that proves the alternative works in this codebase.

**Fix:** extract domain services, split `admin.routes.ts` by resource. Detailed sequencing in §3.

### P2-2 — No context value is memoized

`auth.context.tsx:97` · `cart.context.tsx:262` · `wishlist.context.tsx:94` · `toast.context.tsx` · `theme.context.tsx`

Every provider builds a fresh object literal each render, so every consumer re-renders on any change. `cart.context.tsx:258-259` recomputes `totalItems`/`subtotal` unmemoized. Worst offender: `showToast` is not a `useCallback` (`toast.context.tsx:20`) but sits in the dep arrays of cart's `addItem` and `updateQuantity` (`:203,248`), so those callbacks are rebuilt on every toast render — which is what makes P1-1's loop cheap to trigger.

Cart is nested innermost (`providers.tsx:31`), so an auth revalidation cascades through all five providers.

**Fix:** `useMemo` every context value, `useCallback` every exported function, `useMemo` the derived totals. Start with `showToast` — it unblocks the cart memoization.

### P2-3 — No API client on the frontend

SWR is configured globally at `providers.tsx:25` and used at exactly two call sites (`auth.context.tsx:41`, `products-client.tsx:86`). Everything else is raw `fetch` in `useEffect` across ~30 files. The `fetcher` function is defined three times — `providers.tsx:14`, `auth.context.tsx:28`, `products-client.tsx:45` — and **the third drops `credentials: 'include'`**, which is a live inconsistency waiting to bite an authenticated call.

Relative URLs proxied through Next rewrites is the right call and mostly holds, but four files hardcode an absolute base: `products/page.tsx:10` and `:28` (duplicated within one file), `page.tsx:7`, `fallback-image.tsx:26`.

**Fix:** one `lib/api.ts` exporting a typed client and the single `fetcher`. Migrate `useEffect` fetches to SWR incrementally — new code uses the client, existing pages convert as they are touched.

### P2-4 — Error states are mostly `console.error` then render empty

Loading states are decent (`cart/page.tsx:80-101` has a real skeleton). Errors are not:

- `checkout/page.tsx:67-75` — `fetchAddresses` has **no try/catch at all**. A 500 becomes an unhandled rejection and the UI shows "No saved addresses found", indistinguishable from a genuinely empty list at the highest-stakes moment in the funnel.
- `checkout/page.tsx:69-73` — validation failure sets `checkoutValid=false` with nothing surfaced to the user.
- `wishlist.context.tsx:41` — `.catch(console.error)`, silently empty wishlist.
- `admin/providers.tsx:150` — a non-ok `/auth/me` leaves `user` at its previous value instead of null.

No `ErrorBoundary` anywhere; only Next's route-level `app/error.tsx`.

**Fix:** the API client (P2-3) returns a discriminated result; components render an error branch. Add an `ErrorBoundary` at each app root. Treat "failed" and "empty" as different states everywhere — start with checkout.

### P2-5 — `apps/admin` duplicates web's providers wholesale

`admin/src/components/providers.tsx` reimplements AuthProvider (`:136`, raw fetch + useState instead of web's SWR), ThemeProvider (`:45`, byte-identical apart from the localStorage key), and ToastProvider (`:103`). Three copies of the same providers in one repo, already drifted: the toast-id collision fixed in web (`toast.context.tsx:21`) is still live in admin (`providers.tsx:107`) — two toasts in the same millisecond collide and one `removeToast` kills both.

**Fix:** move Theme and Toast into `shared/`, parameterized by storage key. Auth stays separate — the two apps have genuinely different session semantics — but should share the API client.

### P2-6 — `shared/` is a directory pretending to be a package

Not in the workspaces list (`apps/*` and `server` only). Reached via a `@shared/*` tsconfig alias duplicated in both apps, and bypassed entirely by four admin files using raw relative escapes — `customers/page.tsx:7` uses `'../../../../../../shared/components/UIPrimitives'`, same in `products/page.tsx:8`, `coupons/page.tsx:7`, `orders/page.tsx:7`.

Type duplication follows from this: `shared/types/index.ts` hand-mirrors the Prisma schema, `User` is redefined a third time at `auth.context.tsx:6` and as `AdminUser` at `admin/providers.tsx:6`, and `CartProduct` is independently redeclared in `cart/page.tsx:11` and `checkout/page.tsx:28` **with different fields** (`availableStock` only in the cart copy).

**Fix:** make `shared/` a real workspace package (`@ecom/shared`). Derive the API-facing types from Prisma's generated types rather than hand-mirroring. Delete the local redeclarations.

### P2-7 — Three styling systems in the same components

24 `.scss` BEM files, 0 CSS Modules, Tailwind everywhere, and 29 tsx files that import a `.scss` while also carrying Tailwind classes — `checkout/page.tsx:15` imports `./checkout.scss` and renders `className="w-6 h-6 shrink-0"` at `:253` next to `ms-checkout__back`. `CLAUDE.md` explicitly forbids this mix. Two parallel variable files: `shared/styles/_variables.scss` and `apps/web/src/styles/_variables.scss`.

**Fix:** the stated migrate-when-touched policy is right; it just is not being followed. Add a lint rule that fails on a Tailwind utility class in any file importing a `.scss`, so the policy enforces itself. Consolidate the two variable files.

### P2-8 — No tests, anywhere

No test runner, no `*.test.ts`, no `*.spec.ts`, no `__tests__` in `server/` or either app. `package.json` says "No test suite is currently configured" and means it. Leftover scratch files should go: `server/test-rzp.js`, `server/scratch_auth_updates.ts`.

This is what makes every item above expensive. There is no way to fix P0-1 and know you fixed it.

### P2-9 — 60 hand-written catch blocks

No `asyncHandler` and no `express-async-errors`. Every handler manually wraps in `try/catch → next(error)` — roughly 60 near-identical blocks. It works, and one forgotten `catch` is an unhandled rejection and a hung request.

Related: fire-and-forget emails after state changes, e.g. `order.routes.ts:668-669`. The `.catch` is present so nothing crashes, but an order-cancelled email that fails is silently lost with no retry.

**Fix:** `npm i express-async-errors`, import once in `index.ts`, delete every `try/catch` that only forwards. For emails, an outbox table with a retry worker — or accept the loss explicitly and log it somewhere you actually watch.

### P2-10 — Smaller items

- `index.ts:71-75` — CORS origin falls back to localhost when `FRONTEND_URL` is unset, so a missing prod env var silently blocks the real origin instead of failing loudly. Fail fast at boot on missing required env.
- `index.ts:121` — `/api/v1/webhooks` has no rate limiter. Intentional or not, an unauthenticated unlimited endpoint deserves a comment and a generous cap.
- `auth.middleware.ts:96-179` — `optionalAuth` is a ~35-line near-copy of `authenticate`, differing only in the final `next()` vs throw. One implementation with a flag.
- `auth.middleware.ts:59` — `findAuthUser` re-queries the DB on every request, so the JWT buys nothing over a session cookie. Not a bug; worth knowing the token is not saving you a round-trip.
- `toast.context.tsx:23` — `setTimeout` never cleared on unmount.
- `inventory-snapshot.ts:85` — `forceRefreshSnapshot` clears all snapshots to refresh one. Two concurrent add-to-carts each invalidate the other's fresh data.
- `cart.context.tsx:152` — `addItem` is `async` but typed as returning `void` (`:23`), so callers cannot await it. The "validation failed, item not added" path is invisible to the UI and `ProductCard` shows success optimistically. **User-visible.**
- `cart.context.tsx:129-139` — the logout branch calls `clearCartStorage()` while effect 3 immediately rewrites the key with `{userId: null, items: []}`. The removal never sticks.
- `products-client.tsx:71-73` — three separate effects syncing `page`/`localMin`/`localMax` from searchParams; combined with `updateFilters`' own `setPage(1)` at `:104`, every filter click double-renders and fires an extra SWR request.

---

## 3. Refactor plan

Sequenced so each phase is independently shippable and nothing depends on a later phase.

### Phase 0 — Stop the bleeding (this week)

| # | Item | Files |
|---|---|---|
| 1 | P0-1 stock oversell → conditional update | `order.routes.ts:52-88` |
| 2 | P0-2 ZodError → 400 | `error.middleware.ts:9` |
| 3 | P0-4 admin role check on `checkAuth` + layout | `admin/providers.tsx:145`, `(dashboard)/layout.tsx:21` |
| 4 | P1-1 checkout refetch loop → stable dep key | `checkout/page.tsx:131`, `cart/page.tsx:69` |
| 5 | P1-2 double-order guard | `checkout/page.tsx:216-246` |
| 6 | P1-6 pin JWT algorithm | `auth.middleware.ts:47-57` |
| 7 | P1-7 multer `fileFilter` | `admin.routes.ts:25-29` |

P0-3 (webhook HMAC) sits outside this table on purpose — it needs your explicit approval per `.claude/CLAUDE.md`, plus a test-mode verification run. Do it as its own PR with evidence.

### Phase 1 — Make it testable (weeks 2-3)

Nothing in Phase 2+ is safe without this.

1. Vitest in `server/`, with a test DB via `prisma migrate reset`.
2. **First test written: concurrent stock decrement.** Two parallel order creations against `stock: 1`; assert exactly one succeeds. This is the regression test for P0-1 and it is the one that justifies the whole phase.
3. Auth: token expiry, refresh, role rejection, the `optionalAuth` guest path.
4. Order lifecycle: create → pay → cancel → stock restored. Assert `OrderAuditLog` is written on every transition.
5. Webhook: signature accept/reject with a captured real payload.
6. Vitest + Testing Library in `apps/web`; cover checkout state transitions, since that is where the P1 bugs cluster.
7. Delete `server/test-rzp.js` and `server/scratch_auth_updates.ts`.

Target: not a coverage number, but every P0 and P1 above has a test that fails before its fix and passes after.

### Phase 2 — Server domain layer (weeks 4-6)

Strangler-fig, not a rewrite. `rma.service.ts` is the template.

1. `express-async-errors` + delete the ~60 forwarding `try/catch` blocks. Mechanical, large diff, low risk.
2. `cookie-parser` replaces both hand-rolled parsers (P1-8).
3. Move Zod schemas out of route files into `validators/`, matching the existing `rma.validator.ts`.
4. Extract services in this order — highest logic density first:
   - `order.service.ts` — creation, cancellation, `restoreStock` (fixes P1-5's three copies)
   - `stock.service.ts` — the reservation decision from §4 lands here
   - `coupon.service.ts` — server-side revalidation for P1-3
   - `product.service.ts`, `user.service.ts`
5. Split `admin.routes.ts` (1370) into `admin/{dashboard,products,categories,orders,shipments,users,coupons,storage}.routes.ts`, each delegating to a service. Target: no route file over 300 lines.
6. Rotate refresh tokens with reuse detection (P1-4).
7. Migrate the OTP store to a table (P1-9).
8. Migration: `OrderAuditLog.user` → `SetNull` (P1-11).

Routes become: parse → call service → shape response. Nothing else.

### Phase 3 — Frontend data layer (weeks 6-8)

1. `lib/api.ts` — one typed client, one `fetcher`, `credentials: 'include'` non-optional. Delete the three copies and the four hardcoded bases (P2-3).
2. Memoize all context values and callbacks (P2-2). **`showToast` first** — it is the dependency that unblocks the cart memoization and it is what makes P1-1 cheap to retrigger.
3. Convert `useEffect` fetches to SWR, page by page, starting with checkout and cart.
4. `ErrorBoundary` at each app root; error branches in components; "failed" and "empty" rendered differently (P2-4).
5. `shared/` becomes `@ecom/shared`, a real workspace package. Kill the four `../../../../../../` escapes and the duplicate `User`/`CartProduct` declarations (P2-6).
6. Move Theme and Toast providers into shared; admin consumes them (P2-5).
7. Lint rule: no Tailwind utility in a file importing `.scss` (P2-7).

### Phase 4 — Hardening (ongoing)

- Fail fast at boot on missing required env instead of falling back to localhost (P2-10).
- Rate-limit webhooks.
- Email outbox with retry, or an explicit decision to accept loss.
- CI: `npm run lint && npm run build && npm test` on every PR.

---

## 4. The one decision you need to make

**Implement `StockReservation`, or delete it?**

The model, its five indexes, the `Store.config.json` key, and the `CLAUDE.md` documentation all describe a soft-lock during checkout that does not exist in code. P0-1 is the direct consequence: without reservations, stock is decremented at order creation, before payment, and the only protection is a check reading stale data.

**Recommendation: implement it, in Phase 2, inside `stock.service.ts`.** You already have a 15-minute payment window with Razorpay, and the current design decrements before payment — so an abandoned checkout holds stock until someone cancels, and a failed payment relies on the webhook path at `webhook.routes.ts:114-118` to restore it correctly. Reservations are the right model for that window, the schema is already migrated, and the config key is already there. Reserve on checkout entry, convert to a decrement on payment success, expire via a sweeper.

The cheaper alternative is to delete the model, drop the config key, correct `CLAUDE.md`, and rely on the conditional update from P0-1 alone. That is genuinely fine if payment is fast and abandonment is rare — it is correct, just less kind to the user who loses a cart at the payment step. It is also two hours of work instead of two days.

Either way, P0-1's conditional update ships in Phase 0 regardless. It is correct on its own and it is the foundation the reservation flow would sit on.

---

## 5. What this doc does not cover

- **No runtime verification.** Every finding is read from source. The severities are reasoned, not measured. P0-3 in particular may be working fine in production for payload-shape reasons.
- **No performance profiling.** The dashboard aggregations at `admin.routes.ts:41-406` are written inline and look expensive, but nothing here measures them. Do that before optimizing.
- **No deployment or infra review.** CI, hosting, backups, monitoring, and secret management were out of scope.
- **No accessibility or SEO audit.**
- **Effort estimates are calendar-shaped guesses**, not commitments, and assume one developer working through the phases in order.

---
---

# Part II — Frontend Deep Dive: Gaps, Vulnerabilities, Architecture, and State Management

**Date:** 2026-07-19
**Scope:** `apps/web`, `apps/admin`, `shared/` — plus the server endpoints those clients depend on
**Method:** static read. Runtime-verified items are marked; everything else is reasoned from source.

Part I covered the whole system and named "no data layer on the frontend" as one of two root causes. This part goes deeper: what is actually exploitable, what the target architecture should be, and whether Redux Toolkit is the right answer.

---

## 6. Frontend vulnerabilities

The good news first, because it is a real result and it narrows where to look.

**Clean categories — verified, not assumed:**

| Category | Result |
|---|---|
| `dangerouslySetInnerHTML` | **Zero occurrences** in `apps/web/src`, `apps/admin/src`, `shared/`. Only hits were `.next/` build artifacts. |
| `eval` / `new Function` | None in source. |
| `href` / `window.open` built from arbitrary data | None. |
| Tokens in `localStorage` / `sessionStorage` | **None.** Auth is httpOnly-cookie only, no `Authorization` header anywhere, no token in storage. This is the single best security decision in the codebase. |
| Hardcoded secrets in `apps/` or `shared/` | None. No `sk_live`, `rzp_live`, `AKIA`, PEM blocks. Only `NEXT_PUBLIC_API_URL`. |
| Razorpay key exposure | `checkout/page.tsx:185` uses the publishable `rzp_*` key from your own API. Correct. Signature verification is server-side. |
| PDP description rendering | `shared/pages/product/ProductDetailsPage.tsx:156` renders `{product.description}` as a JSX text child. Auto-escaped. |
| Admin rendering user content | No `dangerouslySetInnerHTML` in `apps/admin/src`. Product names, customer names, RMA reason text all go through JSX escaping. |
| Cross-origin credentialed fetch | None. Every `credentials: 'include'` targets a relative `/api/v1/...` path, proxied same-origin via `rewrites()`. |
| `dangerouslyAllowSVG` | Not set in either app. |

React's default escaping is doing the heavy lifting here and nothing bypasses it. **XSS is not your problem.** The findings below are elsewhere.

### F-1 [HIGH] — `/_next/image` is an open image proxy in both apps

`apps/web/next.config.js` · `apps/admin/next.config.js`

`remotePatterns` contains `{ protocol: 'https', hostname: '**' }`. The wildcard makes the Cloudinary entry above it dead config and turns `/_next/image` into an open proxy that will fetch and cache **any** HTTPS URL on request.

Concretely: `https://yourstore.com/_next/image?url=https://attacker.com/x.jpg&w=640&q=75` makes your server fetch attacker-controlled content, serve it from your origin, and cache it on your CDN. That is bandwidth theft, an outbound-request primitive from your infrastructure, and a cache-pollution vector, all from an unauthenticated endpoint.

**Fix — allowlist the hosts you actually use:**

```js
remotePatterns: [
  { protocol: 'https', hostname: 'res.cloudinary.com' },
  { protocol: 'https', hostname: '<your-r2-public-host>' },
]
```

Ten minutes, both configs. This is the one I would fix today.

### F-2 [MEDIUM] — Payment signature verification fails open when an env var is missing

`server/src/routes/order.routes.ts:264-280`

```ts
const isMockMode = !process.env.RAZORPAY_KEY_ID ||
  process.env.RAZORPAY_KEY_ID === 'rzp_test_placeholder' ||
  process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_placeholder')

if (!isMockMode) {
  // ... HMAC verification
}
```

The gate is on `RAZORPAY_KEY_ID` being absent or a placeholder — **not on `NODE_ENV`**. If that variable is unset or misconfigured in production, every call to `/verify-payment` skips the HMAC check entirely. Any authenticated user can then POST their own `orderId` with fabricated payment fields and mark the order paid. Free orders.

This is the same failure class as the CORS localhost fallback in Part I §P2-10: **a missing env var silently degrades to the insecure path instead of refusing to boot.** Two instances of one pattern.

**Fix:**

```ts
const isMockMode = process.env.NODE_ENV !== 'production'
  && (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_placeholder'));

if (process.env.NODE_ENV === 'production' && !process.env.RAZORPAY_KEY_SECRET) {
  throw new Error('RAZORPAY_KEY_SECRET is required in production');
}
```

Better: assert required env at boot (§F-8) so the process refuses to start rather than accepting fake payments.

**[unverified]** — depends entirely on your production env config. If `RAZORPAY_KEY_ID` is definitely set in prod, this is latent rather than live. Verify before deciding urgency.

### F-3 [MEDIUM] — Open redirect on login

`apps/web/src/app/account/login/page.tsx:23,26,36`

```ts
const redirect = searchParams.get('redirect') || '/account'
// ...
router.push(redirect)
```

No validation. `next/navigation`'s `router.push` follows an absolute URL, so `/account/login?redirect=https://evil.com` sends the user off-site **immediately after a successful login** — the highest-trust moment in the session. Standard phishing setup: the link looks like your domain, the login is genuine, the landing page is not.

**Fix — one guard, reject anything not a same-origin path:**

```ts
const raw = searchParams.get('redirect') || '/account';
const redirect = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/account';
```

The `//` check matters: `//evil.com` is a protocol-relative absolute URL that passes a naive `startsWith('/')`.

### F-4 [LOW] — AWB number is not URL-encoded into the tracking URL

`apps/web/src/components/molecules/TrackingModal/TrackingModal.tsx:55-60`

```ts
const template = trackingUrls[selectedCourier]
if (!template) return
const url = template.replace('{awb}', awb.trim())
```

The design here is right and worth saying so: the template comes from server config (`/api/v1/orders/courier-config`), `selectedCourier` is a keyed lookup that bails when absent, and the `<select>` at `:101` only offers server-supplied partners. **The scheme and host are never user-controlled**, so there is no `javascript:` and no arbitrary-origin injection. `target="_blank"` at `:149` correctly carries `rel="noopener noreferrer"`.

What is missing is encoding. A user typing `123&foo=bar#` injects extra query params or path segments into the courier's URL. It stays on the courier's domain, so impact is low, but it is parameter injection.

**Fix:** `template.replace('{awb}', encodeURIComponent(awb.trim()))`.

### F-5 [LOW, latent] — iframe sandbox is only safe by accident

`TrackingModal.tsx:161` — `sandbox="allow-scripts allow-same-origin"`.

That pair is the documented combination that **defeats the sandbox**: together they let the framed document reach into its own origin and remove its own sandbox attributes. It is harmless here only because the framed origin is always a third party. The moment a courier template in `Store.config.json` points at your own origin, that iframe escapes into your session.

**Fix:** drop `allow-same-origin`. Tracking pages do not need it. Leaving it in makes a config value a security boundary, which is not where you want one.

### F-6 [LOW] — Coupon preview computed from client-supplied `orderValue`

`checkout/page.tsx:125,144` → `server/src/routes/coupon.routes.ts:59,70,93`

The client sends `orderValue: subtotal` derived from localStorage prices, and the coupon preview endpoint trusts it — `:59` gates `minOrderValue` against it and `:70` computes `discount = validatedData.orderValue * pct` from it.

**I checked whether this is a money bug. It is not.** `order.routes.ts:163` re-checks `minOrderValue` against the server-computed `subtotal`, and `:172` recomputes the discount from that same server value. The client number never reaches the charge.

So the impact is that a user can make the checkout UI *display* a coupon and a discount they are not entitled to, then have the order fail or come out at a different price. That is a confusing checkout, not theft. Combined with Part I §P1-3 (`freshSubtotal` computed at `:83` then discarded), the price shown at checkout is not reliably the price charged.

**Fix:** stop sending `orderValue`. Have the coupon endpoints resolve the cart server-side from the user/session and compute it there. Removes the parameter and fixes the display mismatch in one change.

### F-7 [INFO] — Cart, with prices, persists in localStorage

`cart.context.tsx:82` stores `{ userId, items[] }` including per-unit `price` and `name`; `:101` stores a `cartSessionId`.

Not a vulnerability — the server never trusts these (`checkout/page.tsx:176` POSTs only `{ productId, quantity }`, which is the correct design). Worth recording because it is the mechanism behind F-6 and Part I §P1-3: the client holds a stale price snapshot and shows it to the user as if it were authoritative.

### F-8 [MEDIUM] — Config that fails open, as a class

Three instances of one pattern, now confirmed across both parts:

1. `server/src/index.ts:71-75` — missing `FRONTEND_URL` falls back to localhost, silently blocking the real prod origin.
2. `server/src/routes/order.routes.ts:264` — missing `RAZORPAY_KEY_ID` disables payment signature verification (F-2).
3. `next.config.js` — `hostname: '**'` as a permanent "allow everything" default (F-1).

**Fix — one boot-time assertion module.** Validate required env with Zod at startup and `process.exit(1)` on failure. A crashed deploy is a good outcome; a running deploy that accepts unsigned payments is not.

### Frontend vulnerability summary

| ID | Severity | Issue | Effort |
|---|---|---|---|
| F-1 | HIGH | `/_next/image` open proxy, both apps | 10 min |
| F-2 | MEDIUM | Payment signature fails open on missing env | 30 min |
| F-8 | MEDIUM | Env config fails open (class of 3) | 2 hrs |
| F-3 | MEDIUM | Open redirect on login | 5 min |
| F-4 | LOW | AWB not URL-encoded | 2 min |
| F-5 | LOW | iframe sandbox neutralized (latent) | 2 min |
| F-6 | LOW | Coupon preview trusts client `orderValue` | 1 hr |
| F-7 | INFO | Prices in localStorage (mechanism, not bug) | n/a |

F-1, F-3, F-4, and F-5 together are under 20 minutes of work. Do them in one PR.

---

## 7. Target frontend architecture

### What is wrong today, structurally

```
CURRENT — logic lives in page components

  page.tsx (499 lines)
    ├── useState x8            ← local UI state
    ├── useEffect → fetch()    ← data fetching, hand-rolled
    ├── useEffect → fetch()    ← more, with unstable deps (P1-1 loop)
    ├── business logic         ← totals, coupon math, validation
    ├── error handling         ← console.error, render empty
    └── JSX                    ← Tailwind + BEM, mixed

  contexts/ ── 6 providers, none memoized, all cascade
  shared/  ── directory pretending to be a package
  admin/   ── its own copy of Auth + Theme + Toast, already drifted
```

Four layers are collapsed into one file. That is why a bug fix lands in one copy and not the others, and why `checkout/page.tsx` has four distinct defects clustered in it.

### Target

```
TARGET — four layers, each with one job

  ┌─────────────────────────────────────────────────────────┐
  │ 1. TRANSPORT      packages/shared/src/api/client.ts     │
  │    One fetch wrapper. credentials:'include' baked in.   │
  │    Typed. Discriminated result. Zero business logic.    │
  └────────────────────────┬────────────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │ 2. SERVER STATE   RTK Query (or SWR hooks)              │
  │    Cache, dedupe, revalidate, optimistic updates.       │
  │    useGetCartQuery, useCreateOrderMutation, ...         │
  │    Owns everything that lives in the database.          │
  └────────────────────────┬────────────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │ 3. CLIENT STATE   RTK slices (small) + local useState   │
  │    Guest cart, theme, toasts, checkout wizard step.     │
  │    Only what has no server counterpart.                 │
  └────────────────────────┬────────────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │ 4. VIEW           pages + components                    │
  │    Hooks in, JSX out. No fetch. No business math.       │
  │    Error and empty are different renders.               │
  └─────────────────────────────────────────────────────────┘

  packages/shared/  ← real workspace package, @ecom/shared
    api/       client, endpoint definitions
    types/     derived from Prisma, not hand-mirrored
    ui/        UIPrimitives
    pages/     OrderDetailsPage, ProductDetailsPage (viewer prop)
    state/     slices shared by both apps
    styles/    one _variables.scss, one _mixins.scss
```

### The rules that make it hold

1. **No `fetch` outside layer 1.** Enforce with a lint rule banning `fetch(` outside `packages/shared/src/api/`. Without enforcement this decays back to 50 call sites, because that is exactly how it got there.
2. **Server state is never copied into client state.** No `useState` seeded from a query result. That copy is what makes data go stale.
3. **Every async surface renders three states:** loading, error, empty — as distinct branches. Part I §P2-4 exists because `catch { console.error }` collapses error into empty.
4. **`shared/` is a workspace package.** Kills the four `../../../../../../` escapes and the duplicate `User` / `CartProduct` declarations (Part I §P2-6).
5. **Types derive from Prisma.** `shared/types/index.ts` hand-mirrors the schema today, so schema drift is silent. Generate or re-export instead.
6. **One styling system per component.** Lint rule: no Tailwind utility class in a file that imports `.scss` (Part I §P2-7).
7. **Admin shares layers 1-3, not layer 4.** Same client, same cache, same Theme and Toast. Auth stays separate — genuinely different session semantics.

---

## 8. State management: should you adopt Redux Toolkit?

You asked whether to bring in RTK. Here is the honest answer, including the part that argues against it.

### The diagnosis first

Nearly everything the app treats as "state" is **server state** — products, cart, wishlist, orders, addresses, coupons. Server state is a cache, not state. It has properties Redux does not model on its own: staleness, revalidation, request dedupe, background refetch, rollback on mutation failure.

Reaching for plain Redux slices here would be the wrong move. You would hand-write reducers, loading booleans, and error fields for every resource, and end up with more code than today plus a store to maintain. That is the classic Redux failure mode and it is worth naming before recommending the library.

The genuinely client-side state is small: guest cart, theme, toasts, checkout wizard step, filter UI. Contexts handle that fine — **once memoized**.

So: **the problem is not the absence of a state manager. It is the absence of a data layer.** Anything you adopt has to fix that or it is ceremony.

### The options

| | Fix contexts + SWR | **RTK Query** | Redux slices for everything |
|---|---|---|---|
| Fixes the refetch loop | Yes | Yes | No |
| Fixes cross-app duplication | Partly | Yes | Yes |
| Request dedupe / cache | Yes | Yes | Hand-written |
| Optimistic updates + rollback | Manual | Built in | Hand-written |
| Devtools / time travel | No | Yes | Yes |
| New dependency | No | Yes (~14kb) | Yes |
| Lines of new code | ~200 | ~600 | ~2000 |
| Effort (human / CC) | 3 days / ~2 hrs | 2 weeks / ~1 day | 4 weeks / ~2 days |
| Completeness | 6/10 | 9/10 | 4/10 |

### Recommendation: RTK Query, with slices only for genuine client state

Not Redux-the-state-container. **RTK Query specifically** — the data-fetching layer that ships inside Redux Toolkit. Reasons, in order of weight:

1. **It is the same product as layer 1 + layer 2 above.** `createApi` with one `baseQuery` gives you the single client and the cache in one definition. It is not an extra layer on top of the architecture; it *is* the architecture.
2. **It kills the duplication structurally.** One `createApi` in `@ecom/shared`, both apps consume it. Web and admin cannot drift because there is one definition. That is the direct fix for Part I §P2-5 and the toast-id bug that shipped to one app and not the other.
3. **Optimistic updates with automatic rollback** are exactly what wishlist (`wishlist.context.tsx`) is hand-rolling and getting wrong.
4. **Tag invalidation replaces the manual snapshot juggling** in `inventory-snapshot.ts:85`, where refreshing one product nukes every cached snapshot.
5. **Devtools.** With zero tests today, being able to replay the checkout sequence that produced a bad order is worth real money.

**The honest cost:** RTK Query is a new dependency and a real concept to learn. It is not "boring technology" for a team that has never used it — you are spending an innovation token. I think it is worth spending here because the thing it replaces is ~50 hand-rolled fetches, and the alternative (SWR done properly) gets you 6/10 for a third of the effort.

**Pick SWR instead if:** the team is small, ships fast, and nobody has RTK experience. SWR is already installed and already configured at `providers.tsx:25`. Fixing the contexts and using SWR properly closes the refetch loop, the double-order race, and the stale-price bug — the three defects that actually hurt users. It does not close the cross-app duplication as cleanly.

**Do not pick plain Redux slices for server data.** More code than today, worse behavior.

### What lives where, concretely

```
RTK QUERY (server state — the cache)
  auth/me · products · product-by-slug · categories · cart
  wishlist · addresses · orders · order-by-id · coupons
  validate-checkout · RMA · admin: dashboard, customers, shipments

RTK SLICES (client state — no server counterpart)
  ui           theme, mobile menu, modals
  toast        queue (fixes the id collision in BOTH apps at once)
  guestCart    pre-login cart, persisted, merged on login
  checkout     wizard step, selected address id, applied coupon code

LOCAL useState (never leaves the component)
  form inputs, hover, open/closed, local filter draft
```

The line: **if a reload should restore it, it is server state.** If a reload should discard it, it is local.

### Migration — strangler fig, not big bang

Nothing here requires a freeze. Each step ships on its own.

**Step 1 — Foundation (~3 days).** `packages/shared` becomes a real workspace package. Move Theme + Toast providers in. Add `@ecom/shared` to both apps' deps, delete the four relative-path escapes and the duplicate type declarations. **No behavior change** — this is Beck's "make the change easy" step, and it must land as its own PR.

**Step 2 — Memoize the contexts (~1 day).** `useCallback` on `showToast` first, then `useMemo` every context value and every exported callback. This alone fixes the checkout refetch loop (Part I §P1-1) and is worth shipping before any RTK work. If you stop after this step, you have already fixed the worst user-facing frontend bug.

**Step 3 — Store + one endpoint (~2 days).** Add the store, `createApi` with the `/api/v1` baseQuery, and migrate exactly one resource: **products**. Lowest risk, read-only, already on SWR. Prove the pattern end to end.

**Step 4 — Migrate reads (~1 week).** Orders, addresses, wishlist, categories, dashboard. One resource per PR. Contexts and RTK Query coexist — this is the strangler-fig phase and it is fine for it to be half-migrated.

**Step 5 — Cart and checkout (~1 week).** Last, deliberately. Highest stakes and where every open bug is. **Do not start this until Phase 1 tests from Part I exist for checkout.** Bundle the fixes: P1-2 double-order, P1-3 stale coupon subtotal, F-6.

**Step 6 — Enforce (~1 day).** Lint rules: no `fetch` outside the api directory, no Tailwind in `.scss` files. Delete the dead contexts. Add an `ErrorBoundary` per app root.

**Total: 3-4 weeks human, days with CC.** Steps 1 and 2 deliver most of the user-visible value and carry almost no risk. If you only do two steps, do those.

### Sequencing against Part I

Part I §Phase 3 said "frontend data layer, weeks 6-8." This section replaces that with the RTK Query plan above. The dependency still holds: **Phase 1 tests come first for anything touching checkout.** Rewriting checkout state management with no tests, against code that already has four known defects, is how you turn a refactor into an outage.

Frontend security fixes (F-1, F-3, F-4, F-5) do **not** wait for any of this. They are a 20-minute PR, independent of everything. Ship them this week.

---

## 9. Combined priority — both parts

| Order | Item | Ref | Why now |
|---|---|---|---|
| 1 | Stock oversell | P0-1 | Sells inventory you don't have, today |
| 2 | ZodError → 500 | P0-2 | Every validation error lies to the client |
| 3 | `/_next/image` open proxy | F-1 | Unauthenticated proxy, 10-min fix |
| 4 | Open redirect + AWB encode + sandbox | F-3/4/5 | 20 min total, one PR |
| 5 | Payment sig fails open | F-2 | Verify prod env; free orders if unset |
| 6 | Admin role check | P0-4 | Two lines |
| 7 | Checkout refetch loop | P1-1 | Hammers the API continuously |
| 8 | Double-order race | P1-2 | Duplicate orders, real money |
| 9 | Env fails open (class) | F-8 | Removes the class behind #5 |
| 10 | **Phase 1: tests** | P2-8 | Everything below needs this first |
| 11 | Server domain layer | P2-1 | Part I Phase 2 |
| 12 | Frontend data layer / RTK Query | §8 | Part II Steps 1-6 |

Items 1-9 are roughly one focused week and close every known correctness and security defect. Items 10-12 are the structural work, and item 10 is not optional before 11 and 12.

---

## 10. What Part II does not cover

- **No runtime verification.** F-2's severity depends on your production env config, which I cannot see. F-1 and F-3 are certain from source.
- **No dependency audit.** `npm audit` was not run.
- **No CSP review.** There is no Content-Security-Policy header today, which is the defense-in-depth layer under the XSS findings. Adding one is worth its own scoping pass.
- **No accessibility or performance profiling.**
- **No auth-flow penetration testing.** Refresh rotation (P1-4) is read from source, not exercised.
- **Effort estimates are guesses,** not commitments.

---
---

# Part III — Responsiveness & WCAG 2.1 Accessibility Audit

**Date:** 2026-07-19
**Scope:** `apps/web/src`, `apps/admin/src`, `shared/` — components, SCSS, design tokens
**Method:** static read plus **computed contrast ratios** (WCAG relative-luminance formula, run against the actual token hex values in `globals.css`). Contrast numbers below are calculated, not estimated. No automated axe/Lighthouse run — see §14.

---

## 11. Read this before the findings: AAA is the wrong target

You asked for AAA compliance. The honest engineering answer is that **full WCAG 2.1 Level AAA is not an appropriate goal for a commerce storefront**, and I would be doing you a disservice to write a plan pretending otherwise. W3C says so themselves: *"It is not recommended that Level AAA conformance be required as a general policy for entire sites."*

Here is what full AAA would actually oblige you to do:

| AAA criterion | What it demands | Verdict for this app |
|---|---|---|
| 1.4.6 Contrast Enhanced | 7:1 normal text, 4.5:1 large | **Worth doing.** Token change, see §12.1 |
| 2.3.3 Animation from Interactions | Motion disableable | **Already passing** (`motion` mixin) |
| 2.4.8 Location | Breadcrumbs on every page | Reasonable, moderate work |
| 1.4.8 Visual Presentation | User-selectable fg/bg colors, line length ≤80 chars, line-height ≥1.5, no justified text | Partly reasonable; user-selectable colors is a feature nobody asks for |
| 2.4.9 Link Purpose (Link Only) | Every link understandable from its text alone, no context | Kills "Read more", "View", "Track" patterns across the app |
| 3.3.5 Help | Context-sensitive help on every form | Disproportionate for a 5-field checkout |
| 2.2.6 Timeouts | Warn users of any data-loss timeout | Applies to your 15-min stock window if you build reservations |
| 1.2.6 Sign Language | Sign-language interpretation for all prerecorded audio | Only if you add video |
| 3.1.5 Reading Level | Lower-secondary reading level, or supplement | Conflicts with legal/policy pages |

**Recommendation: target AA everywhere, and adopt the three AAA criteria that are cheap and high-value — 1.4.6 (7:1 contrast), 2.3.3 (motion, already done), and 2.4.8 (breadcrumbs).** That gets you a genuinely more accessible app, a defensible compliance posture, and it does not force you to rewrite every link label in the storefront.

Everything below is graded against **AA as the bar, with an AAA column** so you can see the gap and decide per item.

The other honest framing: **this codebase is well above average for accessibility.** The skip link, focus-visible rings, required `alt` types, motion guarding, and labeled forms are all already there and were clearly done deliberately. The defects cluster in three places — contrast tokens, TrackingModal, and toast announcements — and they are fixable in days, not months.

---

## 12. Findings

### 12.1 [HIGH, AA FAIL] — `--text-tertiary` is unreadable in both themes

Computed against the real token values:

| Token | Foreground | Background | Ratio | AA | AAA |
|---|---|---|---|---|---|
| `--text-tertiary` light | `#A1A1AA` | `#FFFFFF` | **2.56:1** | FAIL | FAIL |
| `--text-tertiary` dark | `#71717A` | `#18181B` | **3.67:1** | FAIL | FAIL |
| `--text-secondary` light | `#71717A` | `#F4F4F5` | **4.40:1** | **FAIL** | FAIL |
| `--text-secondary` light | `#71717A` | `#FFFFFF` | 4.83:1 | PASS | FAIL |
| `--text-secondary` dark | `#A1A1AA` | `#18181B` | 6.91:1 | PASS | FAIL |
| `--brand-primary` light | `#1D4ED8` | `#FFFFFF` | 6.70:1 | PASS | FAIL |
| `--brand-primary` dark | `#3B82F6` | `#18181B` | 4.82:1 | PASS | FAIL |
| `--text-primary` light | `#18181B` | `#FFFFFF` | 17.72:1 | PASS | PASS |
| `--text-primary` dark | `#FAFAFA` | `#18181B` | 16.97:1 | PASS | PASS |

Two things matter here.

**First, `--text-tertiary` at 2.56:1 fails AA outright**, and it is not decorative — `globals.css:229` (web) and `:150` (admin) apply it to table `<th>` headers, which are real content, and `globals.css:218` applies it to every input placeholder. Every admin table header is currently below the legal minimum.

**Second, and easy to miss: `--text-secondary` passes on white but fails on `--surface-2`.** 4.40:1 on `#F4F4F5`. Any secondary text inside a card or a raised panel is an AA failure even though the token "passes" when checked against the page background. This is the bug that a token-level audit catches and a spot-check does not.

**Fix — a token change, no component edits.** These values are computed to clear 7:1 (AAA) on *all three* surface levels, not just the page background:

```css
/* light */
--text-primary:   #18181B;  /* 17.72:1 — unchanged */
--text-secondary: #52525B;  /* 7.73 / 7.41 / 7.03 on surface-0/1/2 — AAA on all */
--text-tertiary:  #52525B;  /* collapse into secondary; see note */
--brand-primary:  #1E40AF;  /* 8.72:1, and 8.72:1 for white-on-brand buttons */

/* dark */
--text-primary:   #FAFAFA;  /* 16.97:1 — unchanged */
--text-secondary: #B4B4BC;  /* 8.60 / 9.66 / 7.23 on surface-0/1/2 — AAA on all */
--text-tertiary:  #B4B4BC;
--brand-primary:  #7CB0FB;  /* 7.98 / 8.96 / 6.71 */
```

**Note on collapsing tertiary into secondary:** a three-tier text scale does not survive a 7:1 requirement. At AAA the third tier converges with the second, because there is no room left between "readable" and "background". Keep the token name so nothing breaks, point it at the same value, and use weight or size for hierarchy instead of contrast. If you stay at AA rather than AAA, `#6B6B73` (5.28:1) preserves a visible third tier.

**Brand color caveat:** `--brand-primary` is used both as text on light surfaces *and* as a button background with `--brand-primary-fg: #FFFFFF` on top. Darkening it to `#1E40AF` improves both directions at once (8.72:1 either way). Verify it against your brand guidelines before shipping — this is a visual identity change, not just a technical one.

### 12.2 [HIGH, AA FAIL] — Badge colors fail on small text

`apps/web/src/app/globals.css:174,177` · `apps/admin/src/app/globals.css:185,189`

| Badge | Color | Ratio on white | AA (small text) |
|---|---|---|---|
| `.badge-warning` | `#D97706` | **3.19:1** | FAIL |
| `.badge-success` | `#059669` | **3.77:1** | FAIL |
| `.badge-error` | `#DC2626` | 4.83:1 | PASS |

These render at `text-[10px] font-black`, which is unambiguously small text and needs 4.5:1. Order status badges are how a customer reads whether their order shipped, so this is content, not decoration.

**Fix:** `warning → #B45309` (5.02:1 AA) or `#92400E` (7.09:1 AAA). `success → #047857` (5.48:1 AA) or `#065F46` (7.68:1 AAA). `error → #B91C1C` (6.47:1) if going AAA.

Also raise the badge font size. 10px is below the 12px floor most accessibility guidance uses, and no contrast ratio fixes text that small.

### 12.3 [HIGH] — Toasts are silent to screen readers

`apps/web/src/contexts/toast.context.tsx:31`

```tsx
<div className="fixed top-4 right-4 z-50 space-y-2">
```

No `role="status"`, no `aria-live`, no `aria-atomic`. Every toast in the app is invisible to assistive tech.

This is the highest-impact single finding, because of what it is hiding. Login (`login/page.tsx:38`) and register (`register/page.tsx:35,40,55`) route **all** their validation and failure messaging through `showToast`. A screen reader user who mistypes a password gets no feedback at all — the form appears to simply do nothing. Same for "Item removed from cart" and every checkout error.

**Fix — one line:**

```tsx
<div role="status" aria-live="polite" aria-atomic="true"
     className="fixed top-4 right-4 z-50 space-y-2">
```

Use `aria-live="assertive"` for the error variant specifically. Fix it in `shared/` (per Part II §7 rule 7) so **both** apps get it — admin has the same bug in its duplicated provider, which is Part I §P2-5 showing up again in a third form.

WCAG 4.1.3 Status Messages (AA).

### 12.4 [HIGH] — TrackingModal has no dialog semantics and no keyboard exit

`apps/web/src/components/molecules/TrackingModal/TrackingModal.tsx:78`

Missing: `role="dialog"`, `aria-modal`, `aria-labelledby` (the `<h2>` at `:82` has no `id`), Escape-to-close, focus trap, focus restore on close. A keyboard user who opens it can tab out into the page behind it and cannot close it without a mouse.

Compounding it: the `<label>` elements at `:98` and `:118` have **no `htmlFor`**, and the `<select>` at `:101` and `<input>` at `:121` have no `id`. Both fields are unlabeled to a screen reader.

**The fix is to delete the custom modal, not patch it.** `shared/components/UIPrimitives.tsx` already contains a correct Modal — `role="dialog"` `:229`, `aria-modal` `:230`, `aria-labelledby` `:231` bound to `:236`, Escape `:173`, full Tab/Shift-Tab trap `:177-201`, focus restore `:209-211`, body scroll lock. It is a genuinely good implementation.

Wrap TrackingModal's contents in it and add `htmlFor`/`id` on the two fields. This is Part I §P2-5 again: a correct thing exists in `shared/`, and a second, broken copy was written next to it.

WCAG 2.1.2 No Keyboard Trap (A), 4.1.2 Name Role Value (A), 1.3.1 Info and Relationships (A).

### 12.5 [MEDIUM] — Three more modals with no keyboard exit

`apps/admin/src/app/(dashboard)/page.tsx:503` (restock) · `orders/page.tsx:497` · `orders/[id]/page.tsx:126` · backdrop handlers at `(dashboard)/layout.tsx:45`, `(dashboard)/page.tsx:504`, `shared/pages/order/OrderDetailsPage.tsx:796`

Raw `<div>`s with click-to-dismiss backdrops and no dialog semantics, no Escape handler. The `<div onClick>` backdrop is not itself the problem — a backdrop need not be focusable. The problem is that **with no Escape handler, there is no keyboard path to close these at all.** Their inner labels are correctly `htmlFor`-bound, so someone was paying attention; the dialog wrapper is what is missing.

**Fix:** same as 12.4 — route them all through the shared Modal.

### 12.6 [MEDIUM] — Error messages are not programmatically linked to their inputs

`apps/web/src/components/atoms/Input/Input.tsx:58` · `Select.tsx`

`Input.tsx:43` correctly emits `<label htmlFor>` and `:53` sets `aria-invalid={!!error}`, so a screen reader announces that a field is invalid. But the error `<span>` at `:58` has no `id` and the input has no `aria-describedby`, so it never announces **why**. The user hears "invalid" and nothing else.

**Fix:**

```tsx
const errorId = error ? `${id}-error` : undefined;
<input aria-invalid={!!error} aria-describedby={errorId} ... />
{error && <span id={errorId} className="...">{error}</span>}
```

WCAG 3.3.1 Error Identification (A), 3.3.3 Error Suggestion (AA).

### 12.7 [MEDIUM] — Touch targets under 44px

WCAG 2.5.5 Target Size is AAA at 44×44px; **2.5.8 in WCAG 2.2 makes 24×24px an AA requirement.** Current state:

| Component | Size | 24px (AA 2.2) | 44px (AAA) |
|---|---|---|---|
| `ProductCard` wishlist toggle (`product-card.scss:74-75`) | **32×32** | PASS | **FAIL** |
| `Button --sm` (`button.scss:44`) | 36 high | PASS | FAIL |
| `Button --sm` icon-only (`button.scss:113`) | **36×36** | PASS | FAIL |
| `Topbar` actions (`topbar.scss:81-82`) | 40×40 | PASS | FAIL |
| `Button --md` | 44 | PASS | PASS |
| `BottomNav` items (`bottom-nav.scss:27-29`) | 64×64 | PASS | PASS |

The wishlist toggle at 32×32 is the one that matters: it is a primary action, it sits on top of a card that is itself a link (so a mis-tap navigates instead of favoriting), and it is used most on mobile where fingers are the input device.

**Fix:** bump the wishlist toggle to 44×44 and `Button --sm` icon-only to 44×44, keeping the visual icon size and adding padding. A transparent hit area larger than the painted control is the standard technique and does not change the design.

### 12.8 [MEDIUM] — Admin has no skip link and one unlabeled nav

`apps/admin/src/app/(dashboard)/layout.tsx:52` · `sidebar.tsx:54`

Admin's layout has `<main id="admin-main" tabIndex={-1}>` — the target is prepared, someone intended to add this — but **no skip link exists**. Every keyboard user tabs through the full sidebar on every page load.

Web does this correctly: skip link at `apps/web/src/app/layout.tsx:29` → `<main id="main-content" tabIndex={-1}>` at `:34`.

Also `sidebar.tsx:54` `<nav>` has no `aria-label`, and admin has more than one nav landmark, so they are indistinguishable in a landmark list.

**Fix:** copy web's skip link into the admin layout; add `aria-label="Main"` to the sidebar nav.

WCAG 2.4.1 Bypass Blocks (A).

### 12.9 [MEDIUM] — Admin has no global focus-visible style, and strips one outline

`apps/admin/src/styles/admin.scss:373` (filter `<select>`) and `:519` (qty input)

Web sets a global `*:focus-visible` box-shadow at `globals.css:136-139`, which safely backstops its `outline: none` sites. **Admin's `globals.css` omits that block entirely**, and `admin.scss:373` strips the outline from the filter select with no replacement. That control has no visible focus indicator at all.

`:519` is less bad — it adds a `:focus` border-color at `:522` — but a 1px hue change is a weak indicator. Same weakness at `shared/pages/order/order-details.scss:136,533,548,562`, which swap outline for border-color only.

**Fix:** port web's `*:focus-visible` rule into admin's `globals.css`, and replace the border-color-only treatments with the shared `focus-ring` mixin (`apps/web/src/styles/_mixins.scss:60`, already used 12 times in web).

WCAG 2.4.7 Focus Visible (AA); 2.4.11 Focus Appearance is the AAA extension.

### 12.10 [LOW] — Heading level skip on the products page

`apps/web/src/app/products/products-client.tsx` — h1 at `:216`, then h3 at `:138`, `:172` (filter sidebar, rendered via the `<aside>` at `:265`) and `:282` (drawer). No h2 anywhere, so the outline jumps h1 → h3.

Home (`page.tsx:54 → 71,104 → 129`) and admin orders (`orders/page.tsx:195`) are correct.

**Fix:** promote the filter group headings to h2, or add a visually-hidden h2 for the filter region.

WCAG 1.3.1 (A) as a structure issue; 2.4.10 Section Headings is AAA.

### 12.11 [LOW] — Tailwind animations bypass the reduced-motion guard

The SCSS side is genuinely well done: `@mixin motion` (`apps/web/src/styles/_mixins.scss:18`, `shared/styles/_mixins.scss:18`) correctly wraps `@media (prefers-reduced-motion: no-preference)`, and **all 104 `@include motion` call sites cover every one of the 78 `transition:` and 14 `animation:` declarations in SCSS.** That is a rule being followed properly.

The gap is that the guard is SCSS-only. Tailwind's `transition-all`/`duration-300` in both `globals.css` files (`web:123,162,171,196,218,235`; `admin:106,113,139,156,181`) and the `.animate-fade-in`/`.animate-scale-in` keyframes (`web:255-261`, `admin:214-220`) sit outside it, and there is no blanket reduce rule to catch them.

**Fix — one rule in each `globals.css`, catches everything now and forever:**

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This makes the app pass AAA 2.3.3 fully rather than nearly.

### 12.12 Clean categories — verified

Recorded so nobody re-audits them.

| Category | Result |
|---|---|
| **Icon-only button names** | Clean. Every one carries `aria-label`: `TrackingModal.tsx:86`, `ProductCard.tsx:89` (dynamic add/remove), `cart/page.tsx:188,197,214`, `Topbar.tsx:193,222`, `sidebar.tsx:47`, `admin/(dashboard)/page.tsx:517`, `orders/page.tsx:199`, `UIPrimitives.tsx:243`. |
| **Image alt text** | Clean, and structurally enforced — `FallbackImage` types `alt` as **required** (`fallback-image.tsx:9`), so the type checker covers all 8 call sites. The one raw `<img>` (`page.tsx:82`) has `alt={cat.name}`. |
| **Form labels** | Clean. `Input.tsx:43` emits `htmlFor`; login `:54,64`, register `:71,81,91,101,112`, and all 18 admin `product-form.tsx` fields pass labels. Only exception is TrackingModal (12.4). |
| **Keyboard handlers on non-interactive elements** | Only 3 backdrop divs (12.5). No `<span>`/`<li>`/`<tr>` `onClick` anywhere. |
| **Web landmarks** | Clean. Skip link, `<header>` `Topbar.tsx:162`, `<nav>` `:247,275` + `BottomNav.tsx:21`, `<footer>` `footer.tsx:11`, `<aside>` `products-client.tsx:265`. Minor: `aria-label="Main navigation"` sits on `<header>` at `Topbar.tsx:162` rather than a `<nav>`. |
| **Web focus-visible** | Clean. `focus-ring` mixin used 12x, global `*:focus-visible` at `globals.css:136-139`. |
| **SCSS motion guarding** | Clean. 104/104 covered. |

---

## 13. Responsiveness — clean, and deliberately so

This is the part of the frontend I would not change.

- **Breakpoints** are defined once (`_variables.scss` — 640/768/1024/1280) and consumed through `sm`/`md`/`lg`/`xl` mixins. No magic numbers scattered in components.
- **No fixed-width layouts.** No `width: 1200px` anywhere. `--container-max: 80rem` is a max, not a fixed width.
- **Every admin table scrolls rather than breaking.** All five wrap in `.table-container` (`overflow-x-auto`, `globals.css:143`) with `.table { min-width: 100% }`: `customers/page.tsx:84`, `products/page.tsx:101`, `coupons/page.tsx:238`, `orders/page.tsx:279,406`. This is the single most common responsive failure in admin dashboards and it is handled correctly here.
- **Topbar** has an explicit mobile breakpoint (`topbar.scss:21`); `BottomNav` is the mobile navigation pattern.

The only responsive-adjacent defect is touch target sizing (12.7), which is an accessibility issue rather than a layout one.

**One caveat I could not close statically:** horizontal overflow at 320px width (the narrowest viewport WCAG 1.4.10 Reflow covers) needs a real browser to confirm. Long product names, the price row in `ProductCard`, and the admin filter bar are the likely candidates. See §14.

---

## 14. Remediation plan

### Tier 1 — AA compliance (~2 days human / ~2 hrs CC)

Everything here is a current legal-minimum failure.

| # | Fix | Files | Effort |
|---|---|---|---|
| 1 | `role="status" aria-live="polite"` on toast container | `toast.context.tsx:31` + admin copy | 5 min |
| 2 | Fix `--text-tertiary` and `--text-secondary`-on-surface-2 | both `globals.css` | 30 min |
| 3 | Fix `.badge-warning` / `.badge-success`; raise 10px → 12px | both `globals.css` | 20 min |
| 4 | TrackingModal → shared Modal; add `htmlFor`/`id` | `TrackingModal.tsx` | 1 hr |
| 5 | 3 admin modals → shared Modal | `page.tsx:503`, `orders/*` | 2 hrs |
| 6 | `aria-describedby` on Input + Select errors | `Input.tsx:58`, `Select.tsx` | 30 min |
| 7 | Admin skip link + `aria-label` on sidebar nav | `(dashboard)/layout.tsx`, `sidebar.tsx:54` | 15 min |
| 8 | Admin global `*:focus-visible`; fix `admin.scss:373` | admin `globals.css`, `admin.scss` | 30 min |
| 9 | Touch targets → 44px (wishlist, `Button --sm` icon) | `product-card.scss:74`, `button.scss:113` | 20 min |
| 10 | Heading order on products page | `products-client.tsx:138,172,282` | 15 min |

Items 1, 2, and 3 are under an hour combined and close the three findings that affect the most users.

### Tier 2 — the AAA criteria worth adopting (~3 days human)

1. **1.4.6 Contrast Enhanced (7:1).** Ship the full AAA palette from §12.1 rather than the AA-minimum values. Same edit, better numbers. The one real decision is darkening `--brand-primary` to `#1E40AF`, which is a brand call, not a technical one.
2. **2.3.3 Animation from Interactions.** Add the blanket `prefers-reduced-motion: reduce` rule (12.11). One rule per app, takes the SCSS work you already did and makes it complete.
3. **2.4.8 Location.** Breadcrumbs on PDP, PLP, account, and admin detail pages. Genuinely useful for a store with categories, independent of compliance.

### Tier 3 — verification (~1 day, but do it first)

Static analysis found the token and semantics bugs. It cannot find focus order, screen-reader flow, or 320px reflow.

1. **`@axe-core/react` in dev** for both apps. Catches regressions at the point they are written, which matters more than any one-time audit.
2. **`jest-axe` on the shared components** once Part I Phase 1 lands a test runner. `UIPrimitives`, `Input`, `Button`, `ProductCard`, `TrackingModal`.
3. **Manual keyboard pass** on the checkout flow, start to finish, mouse unplugged. This is where the modal bugs would have surfaced immediately.
4. **Screen reader pass** (VoiceOver on macOS) on login → PDP → cart → checkout. Specifically re-verify toast announcement after fix #1.
5. **320px reflow check** on PLP, PDP, cart, and the admin tables.
6. **Lighthouse accessibility** in CI as a floor, with the caveat that it catches maybe 30% of real issues. Automated tooling is a regression net, not an audit.

### Sequencing against Parts I and II

Tier 1 is **independent of everything else** — token edits and component-local fixes, no dependency on the domain layer or the data layer. Ship it in parallel.

One ordering constraint: fixes #1, #5, and #7 all touch code that Part II §8 Step 1 moves into `@ecom/shared`. Either do them before that move (they will move with it) or after (one edit instead of two). Doing them *during* the move means resolving conflicts for no reason.

---

## 15. What Part III does not cover

- **No automated scan.** Contrast ratios are computed from source token values; everything else is read. No axe, no Lighthouse, no real browser.
- **No screen reader testing.** Announcement quality, focus order, and reading flow cannot be assessed statically. §14 Tier 3 covers this.
- **Contrast checked against token defaults only.** Components that override colors inline, or text over images (hero, category cards), were not measured. Text over imagery is a common failure and needs a visual pass.
- **No 320px reflow verification** (WCAG 1.4.10). Layout reads as sound; unconfirmed.
- **`prefers-contrast` and forced-colors mode** not evaluated.
- **No cognitive accessibility review** — reading level, error recovery, timeout warnings. AAA 3.1.5 and 2.2.6 territory, deliberately out of scope per §11.

---
---

# Part IV — Complete Findings Register

**Date:** 2026-07-19
**Purpose:** Every finding from Parts I, II, and III in one place, with a stable ID, exact location, and the fix. No prose. This is the working index — Parts I-III carry the reasoning.

**Total: 56 findings** — 4 P0, 19 P1/High, 21 P2/Medium, 12 Low/Info.

**Verification status.** Nothing was reproduced at runtime. Contrast ratios (A-01, A-02) are computed from source token values and are exact. Two findings are marked **[unverified]** because they depend on production config I cannot see (S-03, S-16). Everything else is read directly from source with a quoted location.

---

## 16.1 Register — server & backend

| ID | Sev | Finding | Location | Fix | Effort |
|---|---|---|---|---|---|
| **S-01** | **P0** | Stock check reads a snapshot fetched before the transaction opened; `FOR UPDATE` locks acquired then discarded. Concurrent orders oversell, stock goes negative. | `order.routes.ts:52-88` | Replace raw SQL + read with conditional `updateMany({ where: { id, stock: { gte: qty } } })`, assert `count === 1`. Removes the only raw SQL in the repo. | 1 hr |
| **S-02** | **P0** | No `ZodError` branch in the error handler. Every validation failure returns `500 "Something went wrong"` in production. Affects every validated endpoint. | `error.middleware.ts:9` | Add `if (err instanceof ZodError) return res.status(400).json({ ..., data: err.flatten().fieldErrors })` before the generic case. | 15 min |
| **S-03** | **P0** | Razorpay webhook HMAC computed over `JSON.stringify(req.body)` (re-serialized) rather than raw bytes. Key order and whitespace may not survive the round-trip. **[unverified]** — may work by luck for Razorpay's payload shape. | `webhook.routes.ts:19` | Mount `express.raw({ type: 'application/json' })` on this route only; verify HMAC against the Buffer, then `JSON.parse`. **Requires sign-off** — protected path per `.claude/CLAUDE.md`. Verify against a real test-mode event. | 2 hrs |
| **S-04** | **P1** | Refresh tokens are never rotated or invalidated on use. Rows accumulate per login, each valid 7 days. Stolen token = 7 days of access, no detection, no revocation. | `auth.middleware.ts:64-94`, `auth.routes.ts:125,179` | Rotate on use inside one transaction: delete presented row, issue new. Add reuse detection (presenting a deleted token invalidates the family). Prune per user on login. | 4 hrs |
| **S-05** | **P1** | Stock restore is three separate non-transactional `for` loops of individual updates. Crash mid-loop leaves stock partially restored; the three copies will drift. | `order.routes.ts:656-661`, `webhook.routes.ts:114-118,132-136` | One `restoreStock(orderId, tx)` helper called from all three, wrapped in a transaction. | 2 hrs |
| **S-06** | **P1** | `jwt.verify` with no algorithm pinning, no issuer, no audience. Not immediately exploitable (modern `jsonwebtoken` rejects `alg: none`) but closes the algorithm-confusion class. | `auth.middleware.ts:47-57` | `jwt.verify(token, SECRET, { algorithms: ['HS256'], issuer: 'ecom-api' })`. | 10 min |
| **S-07** | **P1** | Multer configured with `limits` but no `fileFilter`. Arbitrary MIME types accepted and forwarded to storage. With `/uploads` served statically, a stored HTML/SVG is a stored-XSS vector on the local-disk path. | `admin.routes.ts:25-29` | Allowlist `image/jpeg|png|webp|avif`, validate magic bytes (not the declared MIME), serve `/uploads` with `Content-Disposition: attachment` + restrictive CSP. | 2 hrs |
| **S-08** | **P1** | Hand-rolled cookie parser (17 lines replacing `cookie-parser`). No signed-cookie support. `decodeURIComponent` throws `URIError` on a malformed `%`, synchronously in middleware → 500s every request from that client. | `index.ts:36-52` | Delete it. `npm i cookie-parser`, `app.use(cookieParser())`. Also removes the duplicate parser at `auth.middleware.ts:26-45`. | 30 min |
| **S-09** | **P1** | OTP store is `NodeCache` (in-memory). Breaks on restart, cannot work behind more than one instance. Silent correctness failure the moment you scale out or deploy mid-signup. | `auth.routes.ts:17` | `VerificationCode` table with a TTL index. You already run MySQL; simpler than adding Redis. | 3 hrs |
| **S-10** | **P1** | `StockReservation` model fully defined with 5 indexes, migrated, plus a `Store.config.json` key and CLAUDE.md docs — and `grep` returns **zero** code hits. Documentation describes a safety property that does not exist. Root cause of S-01. | `schema.prisma:219-235` | **Decision required — see §16.5.** Implement (reserve on checkout entry, convert on payment, sweeper expiry) or delete model + config key + fix docs. | 2 days or 2 hrs |
| **S-11** | **P1** | `OrderAuditLog.user` cascades on user delete, while `Order.user` is deliberately `SetNull` to preserve orders. Deleting a user wipes the audit trail for the orders you just chose to retain. Schema contradicts itself one field apart. CLAUDE.md calls this log append-only. | `schema.prisma:123,413` | Change to `onDelete: SetNull`. Migration required. | 1 hr |
| **S-12** | P2 | No domain layer. All business logic in route handlers. `admin.routes.ts` is 1370 lines / 36 endpoints (21% of the backend). `order.routes.ts:34` is a single ~220-line handler. `rma.service.ts` is the counter-example that proves the alternative works here. | `routes/*.ts` (11 files) | Extract `order`, `stock`, `coupon`, `product`, `user` services. Split `admin.routes.ts` by resource. Target: no route file over 300 lines. Routes become parse → service → respond. | 2 weeks |
| **S-13** | P2 | No async wrapper. ~60 hand-written `try/catch → next(e)` blocks. One forgotten catch = unhandled rejection and a hung request. | all route files | `npm i express-async-errors`, import once in `index.ts`, delete every forwarding catch. Mechanical, large diff, low risk. | 4 hrs |
| **S-14** | P2 | Fire-and-forget emails after state changes. `.catch` is present so nothing crashes, but a failed order-cancelled email is silently lost with no retry. | `order.routes.ts:668-669` and similar | Outbox table + retry worker, or an explicit decision to accept loss and log it somewhere you actually watch. | 1 day |
| **S-15** | P2 | Zod schemas declared inline in every route file. Only `rma.validator.ts` follows the intended pattern. | all route files | Move schemas to `validators/`, matching the existing `rma.validator.ts`. | 3 hrs |
| **S-16** | **P1** | Payment signature verification gated on `RAZORPAY_KEY_ID` being absent/placeholder — **not on `NODE_ENV`**. If that env var is unset in production, `/verify-payment` skips HMAC entirely and any authenticated user can mark their own order paid. **[unverified]** — depends on prod env config. | `order.routes.ts:264-280` | Gate on `NODE_ENV !== 'production'`, and throw at boot if `RAZORPAY_KEY_SECRET` is missing in prod. Rolls into S-19. | 30 min |
| **S-17** | P2 | `optionalAuth` is a ~35-line near-copy of `authenticate`, differing only in the final `next()` vs throw. | `auth.middleware.ts:96-179` | One implementation with a flag. | 30 min |
| **S-18** | P2 | `findAuthUser` re-queries the DB on every request, so the JWT buys nothing over a session cookie. Not a bug — worth knowing the token is not saving a round-trip. | `auth.middleware.ts:59` | No action. Documented so nobody assumes the JWT is an optimization. | n/a |
| **S-19** | P2 | **Config fails open, as a class.** Three instances: CORS falls back to localhost on missing `FRONTEND_URL` (`index.ts:71-75`); payment verification disabled on missing `RAZORPAY_KEY_ID` (S-16); `hostname: '**'` in both next.configs (W-01). Missing env → silent insecure default. | `index.ts:71-75`, `order.routes.ts:264`, both `next.config.js` | One boot-time env assertion module (Zod), `process.exit(1)` on failure. A crashed deploy beats one accepting unsigned payments. | 2 hrs |
| **S-20** | P2 | `/api/v1/webhooks` has no rate limiter. Unauthenticated and unlimited. | `index.ts:121` | Generous cap plus a comment stating the intent. | 15 min |
| **S-21** | P2 | Coupon preview endpoints trust client-supplied `orderValue` for `minOrderValue` gating and discount math. **Not a money bug** — `order.routes.ts:163,172` recomputes both from server-side subtotal. Impact is a checkout that displays a discount the user will not receive. | `coupon.routes.ts:59,70,93` | Stop accepting `orderValue`. Resolve the cart server-side from user/session and compute there. Fixes the display mismatch and removes the parameter. | 1 hr |
| **S-22** | P2 | **Zero tests.** No runner, no `*.test.ts`, no `__tests__` in server or either app. This is what makes every finding above expensive — no way to fix S-01 and know it's fixed. | repo-wide | Vitest + test DB. **First test: concurrent stock decrement** (the S-01 regression test). Then auth, order lifecycle, webhook signature. Delete `server/test-rzp.js` and `server/scratch_auth_updates.ts`. | 1 week |

---

## 16.2 Register — frontend architecture & security

| ID | Sev | Finding | Location | Fix | Effort |
|---|---|---|---|---|---|
| **W-01** | **HIGH** | `remotePatterns: [{ protocol: 'https', hostname: '**' }]` turns `/_next/image` into an unauthenticated open image proxy. Your server fetches and CDN-caches any attacker-supplied HTTPS URL. Bandwidth theft, outbound-request primitive, cache pollution. Both apps. | `apps/web/next.config.js`, `apps/admin/next.config.js` | Allowlist real hosts only: `res.cloudinary.com`, your R2 public host. Delete the wildcard. | 10 min |
| **W-02** | **MED** | Open redirect on login. `searchParams.get('redirect')` passed to `router.push` with no validation. `?redirect=https://evil.com` sends the user off-site immediately after a successful login — the highest-trust moment in the session. | `account/login/page.tsx:23,26,36` | `raw.startsWith('/') && !raw.startsWith('//') ? raw : '/account'`. The `//` check matters — protocol-relative URLs pass a naive `startsWith('/')`. | 5 min |
| **W-03** | **MED** | Checkout refetch loop. `useEffect(..., [items, subtotal])` where `items` is a new array identity every `CartProvider` render, and the body calls three setters. Each set re-renders → new identity → refires. `validate-checkout` and `coupons/available` hammered continuously. | `checkout/page.tsx:131`, `cart/page.tsx:69` | Depend on a stable key: `useMemo(() => items.map(i => \`${i.productId}:${i.quantity}\`).join(','), [items])`. Root fix is W-06. | 1 hr |
| **W-04** | **MED** | Double-order race. `setIsLoading(false)` runs while the Razorpay handler is still pending, re-enabling the pay button mid-payment. Second click creates a second order for the same cart. | `checkout/page.tsx:216-246` | Hold `isLoading` until the Razorpay callback resolves or dismisses; guard the handler on entry with a ref, not state. Add a server-side idempotency key on order creation. | 3 hrs |
| **W-05** | **MED** | Cart cleared only on the success branch. If `verify-payment` succeeds server-side but the response is lost, the cart survives and the user can re-order. | `checkout/page.tsx:200` | Clear on confirmed server state, not on response receipt. Covered by the S-16/W-04 idempotency work. | 1 hr |
| **W-06** | **MED** | No context value is memoized. Every provider builds a fresh object literal per render; all consumers re-render on any change. `showToast` is not a `useCallback` but sits in cart's `addItem`/`updateQuantity` deps, so those rebuild on every toast render. Cart is nested innermost, so auth revalidation cascades through all five. | `auth.context.tsx:97`, `cart.context.tsx:258-259,262`, `wishlist.context.tsx:94`, `toast.context.tsx:20`, `theme.context.tsx` | `useCallback` on `showToast` **first** (unblocks the rest), then `useMemo` every context value and `useCallback` every exported function. Fixes W-03 at the root. | 1 day |
| **W-07** | **MED** | Coupon validated against a price the server disagrees with. `applyCoupon` posts `orderValue: subtotal` from localStorage while the order total uses server-confirmed prices. `freshSubtotal` computed at `:83` then discarded — `total` at `:58` never reads it. | `checkout/page.tsx:58,83,141` | Make `freshSubtotal` the single source for summary and coupon call. Pairs with S-21. | 2 hrs |
| **W-08** | P2 | No API client. SWR configured globally but used at **2 of ~50** call sites; the rest are raw `fetch` in `useEffect` across 30 files. The `fetcher` is defined three times and **the third drops `credentials: 'include'`**. Four files hardcode an absolute API base, bypassing the Next rewrite. | `providers.tsx:14`, `auth.context.tsx:28`, `products-client.tsx:45`; `products/page.tsx:10,28`, `page.tsx:7`, `fallback-image.tsx:26` | One `lib/api.ts` — typed client, single fetcher, `credentials` non-optional. Migrate to SWR/RTK Query incrementally. Lint rule banning `fetch(` outside the api directory. | 1 week |
| **W-09** | P2 | Error states are `console.error` then render empty. `fetchAddresses` has **no try/catch at all** — a 500 becomes an unhandled rejection and the UI shows "No saved addresses found", indistinguishable from empty, at the highest-stakes point in the funnel. No `ErrorBoundary` anywhere. | `checkout/page.tsx:67-75,69-73`, `wishlist.context.tsx:41`, `admin/providers.tsx:150` | API client returns a discriminated result; components render loading/error/empty as three distinct branches. `ErrorBoundary` at each app root. | 3 days |
| **W-10** | P2 | `apps/admin` duplicates web's providers wholesale — Auth (`:136`, raw fetch instead of SWR), Theme (`:45`, byte-identical but for the storage key), Toast (`:103`). **Already drifted:** the toast-id collision fixed in web (`toast.context.tsx:21`, random suffix) is still live in admin (`providers.tsx:107`, bare `Date.now()`). | `admin/src/components/providers.tsx` | Move Theme + Toast into `shared/`, parameterized by storage key. Auth stays separate (different session semantics) but shares the API client. | 2 days |
| **W-11** | P2 | `shared/` is a directory pretending to be a package. Not in workspaces; reached by a tsconfig alias duplicated in both apps, and bypassed by four raw `../../../../../../shared/` escapes in admin. `shared/types/index.ts` hand-mirrors the Prisma schema, so drift is silent. `User` declared three times; `CartProduct` twice **with different fields**. | `customers/page.tsx:7`, `products/page.tsx:8`, `coupons/page.tsx:7`, `orders/page.tsx:7`; `auth.context.tsx:6`, `admin/providers.tsx:6`, `cart/page.tsx:11`, `checkout/page.tsx:28` | Make it a real workspace package `@ecom/shared`. Derive types from Prisma instead of hand-mirroring. Delete local redeclarations. | 3 days |
| **W-12** | P2 | Three styling systems coexist. 24 SCSS BEM files, Tailwind everywhere, and **29 tsx files import a `.scss` while also carrying Tailwind classes** — which CLAUDE.md explicitly forbids. Two parallel `_variables.scss`. | `checkout/page.tsx:15` vs `:253`, + 28 others | The migrate-when-touched policy is right, it just isn't being followed. Add a lint rule that fails on a Tailwind utility in any file importing `.scss`. Consolidate the variable files. | 2 days |
| **W-13** | Low | `inventory-snapshot.ts:85` — `forceRefreshSnapshot` clears **all** snapshots to refresh one. Two concurrent add-to-carts each invalidate the other's fresh data. | `inventory-snapshot.ts:85` | Invalidate by key. Replaced entirely by RTK Query tag invalidation if you go that route. | 1 hr |
| **W-14** | Low | `addItem` is `async` but typed as returning `void`, so callers cannot await it. The "validation failed, item not added" path is invisible to the UI and `ProductCard` shows success optimistically. **User-visible.** | `cart.context.tsx:23,152` | Type it `Promise<boolean>`; have callers await and branch. | 1 hr |
| **W-15** | Low | Logout branch calls `clearCartStorage()` while effect 3 immediately rewrites the key with `{userId: null, items: []}`. The removal never sticks. `userId` also sits in its own effect's deps. | `cart.context.tsx:129-139,136` | Merge the three cart effects into one keyed on auth transition. | 2 hrs |
| **W-16** | Low | Three separate effects sync `page`/`localMin`/`localMax` from searchParams; combined with `updateFilters`' own `setPage(1)`, every filter click double-renders and fires an extra SWR request. | `products-client.tsx:71-73,104` | Single derived-state read from searchParams; drop the syncing effects. | 2 hrs |
| **W-17** | Low | `setTimeout` never cleared on unmount. | `toast.context.tsx:23` | Return a cleanup from the effect. | 10 min |
| **W-18** | Low | AWB not URL-encoded into the courier tracking URL. A user typing `123&foo=bar#` injects query params. Stays on the courier's domain, so impact is low, but it is parameter injection. | `TrackingModal.tsx:60` | `encodeURIComponent(awb.trim())`. | 2 min |
| **W-19** | Low | `sandbox="allow-scripts allow-same-origin"` is the documented combination that **defeats** the sandbox. Harmless today only because the framed origin is third-party. If a courier template in `Store.config.json` ever points at your origin, the iframe escapes into your session. | `TrackingModal.tsx:161` | Drop `allow-same-origin`. Tracking pages don't need it. Leaving it makes a config value a security boundary. | 2 min |
| **W-20** | Info | Cart persisted to localStorage with per-unit `price` and `name`, plus `userId`. Not a vulnerability — the server never trusts it (`checkout/page.tsx:176` posts only `{ productId, quantity }`, which is correct). Recorded as the mechanism behind W-07 and S-21. | `cart.context.tsx:82,101` | No action. Do not start trusting it. | n/a |

### Verified clean — frontend security

`dangerouslySetInnerHTML` (zero occurrences in source) · `eval`/`new Function` · `href`/`window.open` from data · **tokens in localStorage (none — cookie-only auth, the single best security decision in the codebase)** · hardcoded secrets · Razorpay key handling (publishable only, server-side verification) · PDP description rendering (JSX-escaped) · admin rendering of user content · cross-origin credentialed fetch · `dangerouslyAllowSVG`. **XSS is not this app's problem.**

---

## 16.3 Register — accessibility (WCAG 2.1)

Graded against **AA**, with AAA noted. See §11 for why full AAA is the wrong target.

| ID | Sev | Finding | Location | Fix | Effort |
|---|---|---|---|---|---|
| **A-01** | **HIGH** | `--text-tertiary` is **2.56:1** light / **3.67:1** dark — fails AA outright, and it is applied to every admin table `<th>` (content, not decoration) and every input placeholder. Separately, `--text-secondary` passes on white (4.83:1) but **fails AA on `--surface-2` at 4.40:1** — any secondary text inside a card is non-compliant. | `web/globals.css:218,229`, `admin/globals.css:150` | Token change, no component edits. AAA-passing on all three surfaces: light `secondary/tertiary #52525B`, `brand #1E40AF`; dark `secondary/tertiary #B4B4BC`, `brand #7CB0FB`. Note: a three-tier text scale does not survive 7:1 — tertiary converges with secondary; use weight for hierarchy. Brand change needs a design sign-off. | 30 min |
| **A-02** | **HIGH** | `.badge-warning` **3.19:1** and `.badge-success` **3.77:1** on white, rendered at `text-[10px]` — unambiguously small text needing 4.5:1. Order status badges are how a customer reads whether their order shipped. | `web/globals.css:174,177`, `admin/globals.css:185,189` | `warning → #B45309` (5.02) or `#92400E` (7.09 AAA); `success → #047857` (5.48) or `#065F46` (7.68 AAA); `error → #B91C1C` for AAA. **Also raise 10px → 12px** — no ratio fixes text that small. | 20 min |
| **A-03** | **HIGH** | Toast container has no `role="status"`, no `aria-live`. **Every toast in the app is silent to screen readers.** Login and register route *all* validation errors through `showToast`, so a screen reader user who mistypes a password gets no feedback — the form appears to do nothing. WCAG 4.1.3 (AA). | `toast.context.tsx:31` + admin copy | `role="status" aria-live="polite" aria-atomic="true"`. Use `assertive` for the error variant. Fix in `shared/` so both apps get it. | 5 min |
| **A-04** | **HIGH** | TrackingModal has no `role="dialog"`, no `aria-modal`, no `aria-labelledby`, no Escape handler, no focus trap, no focus restore. Keyboard users can tab out behind it and cannot close it without a mouse. Its two `<label>`s have **no `htmlFor`** and the fields have no `id` — both unlabeled. WCAG 2.1.2, 4.1.2, 1.3.1 (A). | `TrackingModal.tsx:78,82,98,101,118,121` | **Delete the custom modal, don't patch it.** `UIPrimitives.tsx` already has a correct one — dialog role `:229`, `aria-modal` `:230`, `aria-labelledby` `:231`, Escape `:173`, full focus trap `:177-201`, focus restore `:209-211`. Wrap contents in it; add `htmlFor`/`id`. | 1 hr |
| **A-05** | **MED** | Three more modals are raw divs with click-dismiss backdrops, no dialog semantics, **no Escape handler — so no keyboard path to close them at all.** Their inner labels *are* correctly bound, so the wrapper is what's missing. | `admin/(dashboard)/page.tsx:503,504`, `orders/page.tsx:497`, `orders/[id]/page.tsx:126`, `(dashboard)/layout.tsx:45`, `OrderDetailsPage.tsx:796` | Route all through the shared Modal. | 2 hrs |
| **A-06** | **MED** | Error span has no `id` and the input has no `aria-describedby`. `aria-invalid` fires so a screen reader announces the field is invalid, but never **why**. WCAG 3.3.1 (A), 3.3.3 (AA). | `Input.tsx:58`, `Select.tsx` | `aria-describedby={errorId}` on the input, `id={errorId}` on the error span. | 30 min |
| **A-07** | **MED** | Touch targets below 44px. ProductCard wishlist toggle is **32×32** — a primary mobile action sitting on top of a card that is itself a link, so a mis-tap navigates instead of favoriting. `Button --sm` icon-only is 36×36; Topbar actions 40×40. (All pass WCAG 2.2's 24px AA floor; these fail the 44px AAA bar.) | `product-card.scss:74-75`, `button.scss:44,113`, `topbar.scss:81-82` | Transparent hit area larger than the painted control — keeps the visual design, fixes the target. | 20 min |
| **A-08** | **MED** | Admin has `<main id="admin-main" tabIndex={-1}>` — the skip-link target is prepared — but **no skip link exists**. Every keyboard user tabs the full sidebar on every page load. Sidebar `<nav>` also has no `aria-label` while admin has multiple navs. WCAG 2.4.1 (A). | `admin/(dashboard)/layout.tsx:52`, `sidebar.tsx:54` | Copy web's skip link (`apps/web/src/app/layout.tsx:29`); add `aria-label="Main"`. | 15 min |
| **A-09** | **MED** | Admin's `globals.css` omits web's global `*:focus-visible` rule, yet `admin.scss:373` strips the outline from the filter select with no replacement — **that control has no visible focus indicator at all.** `:519` is weaker but present. Several shared styles swap outline for a 1px border-color change. WCAG 2.4.7 (AA). | `admin.scss:373,519,522`, `order-details.scss:136,533,548,562` | Port web's `*:focus-visible` (`globals.css:136-139`) into admin; replace border-color-only treatments with the `focus-ring` mixin (already used 12x in web). | 30 min |
| **A-10** | Low | Heading order skips h1 → h3. Filter sidebar and drawer render h3 with no h2 between. | `products-client.tsx:138,172,282` vs h1 at `:216` | Promote filter headings to h2, or add a visually-hidden h2 for the region. | 15 min |
| **A-11** | Low | SCSS motion guarding is complete — **104 `@include motion` covering all 78 `transition:` and 14 `animation:` declarations.** But the guard is SCSS-only: Tailwind `transition-all`/`duration-300` and `.animate-fade-in`/`.animate-scale-in` in both `globals.css` bypass it, and there's no blanket reduce rule. | `web/globals.css:123,162,171,196,218,235,255-261`; `admin:106,113,139,156,181,214-220` | One `@media (prefers-reduced-motion: reduce)` blanket rule per app. Takes the SCSS work from nearly-complete to fully AAA 2.3.3. | 15 min |
| **A-12** | Low | `aria-label="Main navigation"` sits on `<header>` rather than a `<nav>` — wrong element for that name. | `Topbar.tsx:162` | Move the label to the `<nav>` at `:247`. | 5 min |

### Verified clean — accessibility

Icon-only button names (**every** one carries `aria-label`) · image alt (structurally enforced — `FallbackImage` types `alt` as required, so the type checker covers all call sites) · form labels (`Input.tsx:43` emits `htmlFor`; all 18 admin product-form fields bound) · keyboard handlers on non-interactive elements (only the 3 backdrops in A-05) · web landmarks + skip link · web focus-visible (12 `focus-ring` uses + global rule) · SCSS motion guarding.

### Verified clean — responsiveness

Breakpoints defined once (640/768/1024/1280) and consumed via mixins · no fixed-width layouts, no `width: 1200px`, `--container-max` is a max · **all five admin tables wrap in `overflow-x-auto` with `min-width: 100%`** (the most common admin-dashboard failure, handled correctly) · Topbar mobile breakpoint · BottomNav as the mobile nav pattern. The only responsive-adjacent defect is A-07, which is an accessibility issue rather than a layout one.

**Not verifiable statically:** 320px reflow (WCAG 1.4.10), text-over-image contrast (hero, category cards), focus order, screen-reader flow. See §16.6.

---

## 16.4 The one root cause behind eight findings

W-10, W-11, A-03, A-04, A-05, S-05, S-17, and the three duplicated `fetcher` definitions in W-08 are all the same failure: **a correct implementation exists, and a second copy was written next to it instead of being reused.**

```
  toast id collision  ──  fixed in web (toast.context.tsx:21, random suffix)
                      └── STILL BROKEN in admin (providers.tsx:107, bare Date.now())

  modal a11y          ──  correct in shared (UIPrimitives.tsx:173-236, full trap)
                      └── absent in TrackingModal.tsx:78 and 3 admin modals

  restoreStock        ──  three independent for-loops, none transactional

  fetcher             ──  three definitions, the third missing credentials

  auth/theme/toast    ──  three provider copies across two apps
```

Every individual fix in the register is worth doing. But **the structural fix is W-11 — make `shared/` a real workspace package** — because that is what makes the next copy hard to write. Without it, this list regenerates itself.

---

## 16.5 Open decision

**`StockReservation`: implement or delete?** (S-10)

The model, five indexes, the `Store.config.json` key, and the CLAUDE.md documentation all describe a soft-lock during checkout that does not exist in code. S-01 is the direct consequence.

- **Implement** (~2 days): correct for a 15-minute payment window. Reserve on checkout entry, convert on payment success, expire via sweeper. Schema is already migrated; the config key is already there.
- **Delete** (~2 hrs): drop the model and config key, correct the docs, rely on S-01's conditional update alone. Genuinely fine if payment is fast and abandonment rare — correct, just less kind to the user who loses a cart at the payment step.

**Recommendation: implement, in the S-12 domain-layer phase, inside `stock.service.ts`.** Either way, S-01's fix ships first and independently — it is correct on its own and is the foundation the reservation flow would sit on.

---

## 16.6 Execution order

**Week 1 — correctness and security (closes every known exploitable defect)**

`S-02` (15m) → `W-01` (10m) → `W-02` `W-18` `W-19` `A-03` (~20m, one PR) → `S-01` (1h) → `P0-4 admin role check` (10m) → `S-06` (10m) → `A-01` `A-02` (50m) → `W-03` (1h) → `S-16` + `S-19` (2.5h) → `S-07` (2h) → `W-04` (3h)

Roughly one focused week. `S-03` runs alongside as its own PR with sign-off and test-mode evidence.

**Week 2 — accessibility Tier 1**

`A-04` `A-05` `A-06` `A-07` `A-08` `A-09` `A-10` `A-11` `A-12`. Independent of everything else — token edits and component-local fixes. Ship in parallel with week 1 if you have a second pair of hands.

**Weeks 3-4 — the gate**

`S-22` tests. **Everything below this line depends on it.** First test is the S-01 concurrent-decrement regression. Rewriting checkout state management with no tests, against code with four known defects, is how a refactor becomes an outage.

**Weeks 5-8 — server domain layer**

`S-13` → `S-08` → `S-15` → `S-12` → `S-04` `S-09` `S-11` `S-05` `S-14` `S-17` `S-20` `S-21`

**Weeks 6-10 — frontend data layer** (overlaps the above)

`W-11` (foundation, no behavior change — its own PR) → `W-06` (memoize; fixes W-03 at the root — **highest value per hour in the register**) → RTK Query store + one endpoint → migrate reads → cart/checkout last, bundling `W-05` `W-07` `W-13` `W-14` `W-15` `W-16` `W-17` → `W-08` `W-09` `W-10` `W-12` lint rules and cleanup

**Ongoing — verification** (§14 Tier 3)

`@axe-core/react` in dev · `jest-axe` on shared components once S-22 lands a runner · manual keyboard pass on checkout with the mouse unplugged · VoiceOver pass on login → PDP → cart → checkout · 320px reflow check · Lighthouse in CI as a floor, with the caveat it catches maybe 30% of real issues.

**If you only do two things:** `W-06` (memoize contexts) and `A-03` (one line of aria-live). Together they are about a day and they fix the worst runtime bug and the worst accessibility bug in the app.
