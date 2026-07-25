# Frontend Engineering Assessment — ecommerce-platform

- **Scope:** `apps/web` (storefront), `apps/admin` (admin dashboard), `shared/` (cross-app components/types/utils)
- **Type:** Documentation-only architecture review. No code was modified.
- **Date:** 2026-07-19
- **Codebase size (frontend):** ~11,660 lines of TS/TSX across the three areas
- **Method:** Full-tree discovery, direct reads of all architecturally significant files (providers, contexts, checkout, cart, inventory snapshot lib, shared page components, both next.configs, both root layouts), and targeted greps for cross-cutting concerns (a11y attributes, storage usage, code-splitting, tests, security headers). Findings marked "Unable to confirm from available evidence" where the frontend alone cannot prove a claim.

---

## 1. Executive Summary

| Dimension | Score (1–5) | Notes |
|---|---|---|
| Overall frontend health | **3.3** | Well-structured for its size; missing the safety nets around it |
| Architecture | 3.5 | Clean context/provider design; no API layer; god components |
| Performance | 3.5 | ISR + rewrites proxy are right; no measurement, no budgets |
| Accessibility | 3.0 | Genuinely above-average modal/focus work; gaps in live regions and testing |
| Security | 3.0 | httpOnly-cookie auth done correctly; zero security headers, wildcard image hosts |
| Maintainability | 3.0 | Small, readable; duplication between apps and doc drift accumulating |
| Scalability | 3.5 | Stateless frontends scale trivially; API and image optimizer are the limits |
| Operational maturity | 2.0 | No error monitoring, no analytics, no frontend CI coverage confirmed |
| Engineering maturity | 2.0 | **Zero frontend tests, zero stories, no visual regression, no E2E** |

**Top strengths**

1. **Auth architecture is correct.** JWT in httpOnly cookies, same-origin `/api/*` rewrite proxy in both apps (`apps/web/next.config.js`, `apps/admin/next.config.js`), no tokens in `localStorage`, no `Authorization` headers in client code. This is the hardest thing to get right and it is right.
2. **Shared viewer-context pages** (`shared/pages/order/OrderDetailsPage.tsx` with `viewer: 'customer' | 'admin'`) genuinely eliminate cross-app duplication for the most complex screen in the product.
3. **`SharedModal` is a real accessible modal** — focus trap, Tab cycling, Escape, `role="dialog"`, `aria-modal`, focus restoration (`shared/components/UIPrimitives.tsx:160–230`). Plus a skip link and `main` landmark in the web root layout.
4. **Server-rendering used where it matters:** home and product listing are async server components with ISR (`revalidate: 60`), with a client island (`products-client.tsx`) for interactivity.
5. **Careful race-condition handling** in `auth.context.tsx` (documented SWR in-flight guard preventing spurious cart clears) shows real production debugging discipline.

**Top risks**

1. **No frontend test of any kind** — no unit, integration, E2E, or visual test files exist in `apps/` or `shared/`. Checkout and cart logic (money, inventory) are verified only by hand.
2. **No security headers** — neither `next.config.js` defines `headers()`; no CSP, no `X-Frame-Options`, no `Referrer-Policy`.
3. **Checkout page duplicates money math client-side** and displays a localStorage-derived subtotal alongside a server-validated total; coupon validation posts the *client* subtotal (`checkout/page.tsx:144`). Server is the final gatekeeper, but display drift and coupon-eligibility drift are live possibilities.
4. **`images.remotePatterns: { hostname: '**' }`** in both apps turns the Next image optimizer into an open fetch proxy for any HTTPS host.
5. **No error monitoring or analytics** — production frontend failures are invisible.

---

## 2. Frontend System Overview

**Purpose:** Customer storefront + admin dashboard for a physical-goods e-commerce platform (browse, cart, checkout via Razorpay, orders, returns/replacements).

**Architecture style:** Two independent Next.js 14 App Router applications sharing a non-packaged `shared/` source directory via tsconfig path aliases (`@shared/*`). Classic "modular monolith frontend" — not micro-frontends, not a design-system package.

**Technology stack**

| Concern | Choice | Evidence |
|---|---|---|
| Framework | Next.js 14 App Router, React 18 | both `package.json`s |
| Language | TypeScript 5.3 | both `package.json`s |
| Data fetching | SWR 2 (configured globally, sparsely used) + raw `fetch` | `providers.tsx`, page files |
| State | React Context (6 providers in web, 3 in admin) | `apps/web/src/contexts/`, `apps/admin/src/components/providers.tsx` |
| Styling (web) | SCSS BEM (`ms-*`) mid-migration from Tailwind; CSS-custom-property design tokens | 20 `.scss` files; 15 files still carry Tailwind utilities |
| Styling (admin) | Tailwind + one `admin.scss` | `apps/admin` |
| Charts (admin) | Recharts + D3 | admin `package.json` |
| Icons | lucide-react | throughout |
| Payment UI | Razorpay checkout.js injected at pay time | `checkout/page.tsx:224–246` |
| API access | Next `rewrites()` proxying `/api/*` → Express server (port 4000) | both `next.config.js` |

**ASCII architecture map**

```
                       ┌──────────────────────────────┐
                       │  Express API :4000 (/api/v1) │
                       └────────▲──────────▲──────────┘
              rewrites /api/* → │          │ ← rewrites /api/*
        ┌───────────────────────┴──┐    ┌──┴───────────────────────┐
        │ apps/web :3000           │    │ apps/admin :3001         │
        │ ┌──────────────────────┐ │    │ ┌──────────────────────┐ │
        │ │ Providers            │ │    │ │ Providers (own copy) │ │
        │ │  SWRConfig           │ │    │ │  Theme→Toast→Auth    │ │
        │ │  StoreConfig→Theme→  │ │    │ └──────────────────────┘ │
        │ │  Toast→Auth→Wishlist │ │    │ (dashboard)/ layout      │
        │ │  →Cart               │ │    │  client-side auth gate   │
        │ └──────────────────────┘ │    │  products/orders/…       │
        │ app/ routes (RSC + ISR   │    └──────────┬───────────────┘
        │  home, products; client  │               │
        │  cart/checkout/account)  │               │
        └──────────┬───────────────┘               │
                   │        shared/ (path alias, not a package)
                   └────► types/ UIPrimitives pages/order pages/product utils/
```

**High-level user request flow (checkout, the critical path):**
localStorage cart (`cart.context.tsx`) → local inventory-snapshot validation (`lib/inventory-snapshot.ts`, localStorage-cached, 10-min TTL) → `/cart/validate-checkout` (server re-prices) → `/orders` POST → Razorpay modal (or dev mock) → `/orders/verify-payment` → clear cart → order page.

**State ownership**

- `AuthContext` — `/auth/me` via SWR; login/register/logout imperatively.
- `CartContext` — **client-owned**: localStorage under `cart` key with `{userId, items}`, guest `cartSessionId` UUID, migration for a legacy array format. *Note: root `CLAUDE.md` describes the cart as "server-synced" — that is no longer true. Documentation drift.*
- `WishlistContext`, `ThemeContext`, `ToastContext` — standard.
- `StoreConfigContext` — `store.config.json` imported **at build time** into the client bundle.

**Routing:** File-system App Router. Web: public pages + `account/*` + `checkout` + `orders/[id]`. Admin: `login` + `(dashboard)/` group guarded by a client-side `useEffect` redirect. **No `middleware.ts` exists in either app.**

---

## 3. Frontend Architecture Assessment

### Strengths

- **Provider composition is explicit and ordered** (`apps/web/src/components/providers.tsx`), with a barrel re-export preserving import compatibility. Context files are small and single-purpose.
- **Atomic design in web** (`atoms/Button`, `molecules/ProductCard`, `organisms/Topbar`) is applied consistently with co-located `.scss`.
- **Correct RSC/client split** on the product listing: server component fetches with ISR, `ProductsClient` handles filters/pagination with URL-param state (`products-client.tsx:103` resets page on filter change — a detail teams usually miss).
- **The rewrites proxy** means every client fetch is same-origin and relative (`/api/v1/...`), which is what makes the httpOnly cookie model work with zero client token handling.

### Weaknesses and architecture smells

1. **No API/service layer.** Every page hand-rolls `fetch` with endpoint string literals, `res.json()`, and ad-hoc error handling. Evidence: `checkout/page.tsx` contains six inline fetch calls; `addresses`, `orders`, `wishlist`, all admin pages repeat the pattern. Consequences: no request typing (e.g. `availableCoupons: any[]`, `checkout/page.tsx:50`), no consistent error surface, endpoint churn touches dozens of files.
2. **God components.** `shared/pages/order/OrderDetailsPage.tsx` is **950 lines** and contains multiple exported components including `AdminRmaSection` with its own state machines. Also: admin dashboard `page.tsx` (607), admin orders (546), checkout (499), `product-form.tsx` (493). The viewer-context pattern is good; the file granularity is not.
3. **Duplicated platform code between apps.** `apps/admin/src/components/providers.tsx` (199 lines) re-implements Auth, Theme, and Toast providers that exist in web — with behavioral drift (admin toast has no exit animation or aria semantics; admin theme uses a different storage key). `shared/` exists precisely for this and isn't used for it. The SWR fetcher is also defined twice inside web itself (`providers.tsx` and `auth.context.tsx`).
4. **Two competing data-fetching idioms.** SWR is configured globally but used in exactly one place (auth). Everything else is `useEffect` + `useState` + `fetch`, forfeiting caching, dedupe, and revalidation — every navigation refetches addresses/orders/wishlist from scratch.
5. **Inconsistent API base handling.** Client code uses relative `/api/v1` (proxied); server components and `fallback-image.tsx` use `NEXT_PUBLIC_API_URL` with a fallback that *already includes* `/api/v1`, while `next.config.js` strips that suffix. Two conventions for one concern; a misconfigured env var breaks them differently.
6. **`shared/` is not a workspace package.** No independent typecheck or build; both apps compile it separately; nothing enforces its dependency direction (it currently imports `next/link` and `lucide-react`, so it silently depends on each app's node_modules resolution).
7. **Money as floating point strings.** `Product.price` is a string (`shared/types/index.ts`), converted via `Number()` and rendered with `.toFixed(2)` inline (`checkout/page.tsx:424,441,466`). `formatCurrency` exists in `shared/utils` and is used **zero times in apps/web**. Display-only today (server computes charges), but it's a drift generator.
8. **Build-time store config.** `store-config.context.tsx` imports `store.config.json` statically — config changes require a rebuild of both apps, contradicting the "runtime store config" model the server uses, and ships the whole config (courier partners, invoice settings) into the public bundle.
9. **Dead dependency:** `recharts` is declared in `apps/web/package.json` but referenced nowhere in `apps/web/src` or `shared/`.
10. **Lint configuration unverifiable.** `next lint` scripts and `eslint-config-next` exist, but no `.eslintrc*` file exists in either app. Unable to confirm from available evidence that linting actually runs with any ruleset.

### Coupling / cohesion / boundaries

- Dependency direction is mostly healthy: apps → shared, contexts → lib. One inversion: `CartContext` depends on `inventory-snapshot.ts` which itself reads `cartSessionId` from localStorage — cart-session knowledge is smeared across three files (`cart.context.tsx:100`, `inventory-snapshot.ts:151`, `checkout/page.tsx:81,170`).
- No circular dependencies observed at module level.
- Feature isolation is by route, which is adequate at this size.

---

## 4. UI Performance Assessment

**Bundle:** No bundle analysis exists (no `@next/bundle-analyzer`, no budgets, no CI size check). App is small; largest risk is admin's D3+Recharts pair (two charting libraries for one dashboard). `recharts` in web is dead weight only at install time (tree-shaken from bundles if unimported, but it obscures the dependency picture).

**Code splitting:** Route-level splitting only. **Zero uses of `next/dynamic` or `React.lazy`** anywhere. At current size this is acceptable; the admin dashboard charts are the first candidates when it isn't.

**Rendering:**
- ISR (60 s) on home/product-listing is the right call.
- `CartContext` computes `totalItems`/`subtotal` on every render without memo — trivial cost at cart sizes, fine.
- No virtualization; product grid is paginated (12/page), so unnecessary. Admin orders/customers tables: pagination present per file structure; unable to confirm limits from evidence read.
- 28 of 43 web `.tsx` files are `'use client'` — the interactive surface dominates; RSC adoption beyond the two listing pages is minimal (account, cart, checkout, wishlist are fully client-rendered with fetch-on-mount waterfalls).

**Network:**
- Checkout runs a mount-time waterfall: addresses → validate-checkout → coupons (`checkout/page.tsx:66–133`), the last two correctly sequenced (coupons need fresh subtotal), the first parallelizable.
- No SWR reuse means re-entering pages refetches everything; no HTTP cache headers can help since responses are cookie-authenticated JSON.
- Razorpay script is appended per order attempt with no cleanup, no `onerror` handler, and no reuse if already loaded (`checkout/page.tsx:224–246`) — a failed CDN load silently strands the user with a spinner.

**Images:** `next/image` via a `FallbackImage` wrapper plus a hand-rolled Cloudinary transform util (`utils/cloudinary.ts` — competent: f_auto/q_auto, srcset, blur placeholders). One raw `<img>` remains. The `hostname: '**'` wildcard is a security issue (below) but also a performance one: optimizer cache can be filled by arbitrary-host requests.

**Core Web Vitals:** No measurement of any kind (no `useReportWebVitals`, no RUM). Unable to confirm actual CWV state from available evidence.

**Scale readiness:**
- **10x users:** Fine. Frontends are stateless; ISR pages are cached.
- **100x users:** API becomes the constraint (out of frontend scope); the un-cached client fetch pattern multiplies API load ~linearly with navigation; the open image optimizer becomes a real cost/abuse surface.
- **1000x users:** Needs a CDN story for the Next apps, SWR (or RSC) caching for authenticated reads, and image optimization pushed fully to Cloudinary/R2 rather than the Next optimizer.

**Predicted first bottlenecks:** (1) API request amplification from cache-less client fetching; (2) Next image optimizer under wildcard hosts; (3) admin dashboard chart pages on low-end devices.

---

## 5. Security Assessment

**Threat summary:** The trust-boundary fundamentals are right (httpOnly cookies, same-origin proxy, no client secrets, React-default output encoding, no `dangerouslySetInnerHTML` in source). The gaps are all in the hardening layer that was never added.

### High risks

**H1 — No security headers anywhere.**
- Evidence: no `headers()` in either `next.config.js`; no middleware.
- Risk: no CSP → any future XSS runs unconstrained; no `X-Frame-Options`/`frame-ancestors` → both storefront *and admin* are frameable (clickjacking against admin order/refund actions); no `Referrer-Policy`, no `Permissions-Policy`.
- Likelihood: medium (needs a companion vuln to exploit) · Impact: high (admin actions include refunds).
- Mitigation: add a `headers()` block per app — CSP (Razorpay + Cloudinary/R2 allowlisted), `frame-ancestors 'none'` for admin, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

**H2 — Wildcard image remote patterns.**
- Evidence: `hostname: '**'` (https) in both `next.config.js` files.
- Risk: `/_next/image?url=https://attacker.example/...` makes the server fetch arbitrary HTTPS URLs — an SSRF-adjacent open proxy and a resource-abuse vector.
- Likelihood: high (trivially discoverable) · Impact: medium.
- Mitigation: enumerate the real hosts (Cloudinary, R2 public domain, localhost dev).

### Medium risks

**M1 — Admin route protection is client-side only.**
- Evidence: `(dashboard)/layout.tsx` redirects in `useEffect`; no `middleware.ts`; admin role check at login happens in browser JS (`admin providers.tsx:169`).
- The API's `authorizeAdmin` is the real gate (defense holds server-side), but admin page shells render for any authenticated non-admin until the client redirect fires, and the pattern invites future mistakes (e.g., embedding data in a layout).
- Mitigation: Next middleware verifying the session cookie (or at minimum its presence) for `(dashboard)/*`.

**M2 — CSRF posture unverifiable from the frontend.**
- Evidence: cookie-authenticated JSON POSTs with no CSRF token anywhere in client code. JSON content-type + CORS gives partial protection; actual safety depends on cookie `SameSite` attributes and the server's content-type enforcement. **Unable to confirm from available frontend evidence.**
- Mitigation: verify server sets `SameSite=Lax`/`Strict` and rejects non-JSON content types; document the decision.

**M3 — Coupon validation uses client-supplied order value without credentials.**
- Evidence: `checkout/page.tsx:141–145` posts `orderValue: subtotal` (localStorage-derived) and omits `credentials: 'include'` (the only API call in the file that does).
- Risk: users can probe/apply coupons against inflated subtotals; final enforcement presumably happens server-side at order creation (unable to confirm), but the frontend actively feeds untrusted numbers into an eligibility check.

### Low risks

- **L1 — Razorpay checkout.js** loaded from third-party CDN without SRI. Industry-standard accepted risk for PSP scripts; note it in the threat model, and a CSP `script-src` allowlist (H1) is the practical mitigation.
- **L2 — Client-visible store config**: full `store.config.json` (courier partners, invoice settings, feature flags) ships in the public JS bundle. Review it for anything that shouldn't be public before it grows.
- **L3 — No dependency vulnerability scanning** in CI for the frontend workspaces (CI file covers server typecheck/tests; no `npm audit`/Dependabot config observed — `.github/` was only partially inspected; unable to fully confirm).
- **L4 — localStorage cart/snapshot data is attacker-editable by design.** Handled correctly: server re-validates at checkout (`/cart/validate-checkout`, order creation). No finding beyond keeping that invariant.

**OWASP Top 10 mapping (frontend-relevant):** A01 Broken Access Control → M1 (mitigated server-side); A02 Crypto Failures → none observed (no client secrets); A03 Injection/XSS → no instances found, but no CSP backstop (H1); A05 Security Misconfiguration → H1, H2; A06 Vulnerable Components → L3 unknown; A08 Software/Data Integrity → L1.

---

## 6. Accessibility Assessment

**Positives (unusually good for this maturity level):**
- Skip-to-content link and focusable `main` landmark (`apps/web/src/app/layout.tsx`).
- `SharedModal`: full focus trap, Escape close, focus restore, `role="dialog"` + `aria-modal` (`UIPrimitives.tsx:160–230`).
- 51 `aria-*` usages across the frontend; icon-only controls spot-checked carry `aria-label` (e.g., checkout back link).
- Checkout address radios are real `<input type="radio">` wrapped in `<label>` — keyboard and SR-correct by construction.
- A `motion` SCSS mixin exists as a `prefers-reduced-motion` guard, and project rules mandate it.

**Gaps:**
- **Toasts are invisible to screen readers.** Neither web nor admin toast containers have `aria-live`/`role="status"` (verified: 0 matches in `toast.context.tsx` and admin providers). Checkout communicates payment progress and errors *primarily via toasts* — an SR user can miss "payment verification failed."
- **Admin app has no skip link or landmark structure** in its root layout.
- Color contrast: token-based theming exists but no contrast verification anywhere. Unable to confirm compliance from available evidence.
- No a11y tooling: no axe, no jsx-a11y config visible (see lint uncertainty), no keyboard-nav E2E.
- Charts (admin D3/Recharts): no evidence of text alternatives or table fallbacks for chart data. Unable to confirm.
- Responsive a11y: BottomNav/Topbar pattern is mobile-sound; no evidence of testing at zoom/reflow levels (WCAG 1.4.10).

**Recommended future work:** add `role="status" aria-live="polite"` to toast containers (one-line fix per app, disproportionate value); adopt jsx-a11y + axe smoke checks; contrast-audit the token palette once, encode results in the tokens file.

---

## 7. Technical Debt Register

| ID | Category | Description | Evidence | Business impact | Priority | Est. effort |
|---|---|---|---|---|---|---|
| TD-1 | Testing | Zero frontend tests of any kind; money/inventory/checkout logic hand-verified only | no `*.test.*`/`*.spec.*`/`*.stories.*` under `apps/`, `shared/` | Regressions in revenue path ship undetected | **P0** | M (bootstrap) |
| TD-2 | Security | No security headers / CSP; wildcard image hosts | both `next.config.js` | Clickjacking/XSS blast radius; optimizer abuse | **P0** | S |
| TD-3 | Architecture | No API client layer; raw fetch + string endpoints + `any` responses everywhere | e.g. `checkout/page.tsx` ×6, all admin pages | Every API change is a shotgun edit; silent shape drift | P1 | M |
| TD-4 | Component | 950-line `OrderDetailsPage.tsx` (multi-component file incl. RMA state machines); 4 more files ≥490 lines | wc -l evidence in §3 | Slows every order/RMA feature; review blind spots | P1 | M |
| TD-5 | Duplication | Admin re-implements Auth/Theme/Toast providers; fetcher defined twice in web; `formatCurrency` unused in web (inline `₹…toFixed(2)` instead) | `admin providers.tsx`; grep: 0 `formatCurrency` uses in web | Behavior drift between apps (already happening: toast, theme key) | P1 | S–M |
| TD-6 | Styling | Tailwind→BEM migration stalled mid-way; 15 web files still mix idioms, violating the repo's own no-mixing rule | grep; checkout uses `ms-*` + `w-full px-6` in same file | Two mental models per file; inconsistent UI | P2 | M (incremental) |
| TD-7 | Docs | CLAUDE.md claims cart is "server-synced"; it is localStorage-owned with snapshot validation | `cart.context.tsx` vs CLAUDE.md | Agents/devs build on a false model | P2 | XS |
| TD-8 | Dependency | `recharts` dead in web; D3 **and** Recharts both in admin; no lockfile audit in CI | package.json files | Install weight; unpatched-vuln exposure unknown | P2 | XS–S |
| TD-9 | Architecture | `shared/` not a workspace package; no boundary enforcement or independent typecheck | root `package.json` workspaces | Breakage discovered only at app build | P2 | S |
| TD-10 | Config | Store config bundled at build time client-side while server reads it at runtime | `store-config.context.tsx` | Config change requires redeploy of 2 apps; drift between server/client values | P2 | S |
| TD-11 | Complexity | `inventory-snapshot.ts` (191 lines): a localStorage cache + TTL + force-refresh protocol to pre-validate quantities the server re-validates anyway | file read | High-maintenance optimistic layer for modest UX gain; bug surface in the cart path | P3 | note-only unless it bites |
| TD-12 | Tooling | No `.eslintrc` in either app despite `next lint` scripts | ls evidence | Lint may be a no-op; rules unenforced | P2 | XS |

---

## 8. Refactoring Recommendations (future work only — nothing implemented)

### R1 — Frontend test bootstrap on the revenue path (P0)
- **Problem/evidence:** TD-1. The only logic-dense, money-adjacent modules (`cart.context.tsx`, `inventory-snapshot.ts`, checkout flow) have no tests; server workspace already adopted vitest, frontend did not.
- **Why it matters:** cart/checkout regressions are direct revenue loss and are exactly the kind of multi-effect async code that breaks silently (the auth/cart race fix in git history proves it).
- **Strategy:** Vitest + Testing Library reusing `server/vitest.config.ts` conventions; unit-test `cart.context` (hydrate/claim/switch-user/logout matrix), `inventory-snapshot` (stale/missing/inactive), `migrateItem`. One Playwright smoke: browse → add → checkout with mock Razorpay key (the dev mock path at `checkout/page.tsx:212` already exists for this).
- **Success criteria:** cart+snapshot ≥80% branch coverage; checkout smoke green in CI. **Effort:** M. **Epic:** "Frontend test foundation" → stories: harness setup, cart unit suite, snapshot unit suite, checkout E2E smoke, CI wiring.

### R2 — Security hardening pass (P0)
- **Problem/evidence:** H1, H2, M1 (§5).
- **Strategy:** `headers()` in both next.configs (CSP with Razorpay/Cloudinary allowlists, `frame-ancestors`, `nosniff`, referrer policy); enumerate image hosts; add `middleware.ts` to admin gating `(dashboard)/*` on session-cookie presence. No API changes required.
- **Success criteria:** securityheaders.com A-rating; `/_next/image` rejects unknown hosts; unauthenticated `(dashboard)` request redirects at the edge. **Effort:** S. **Epic:** "Frontend hardening" → stories: headers-web, headers-admin, image allowlist, admin middleware, CSRF posture verification with backend team.

### R3 — Typed API client layer (P1)
- **Problem/evidence:** TD-3.
- **Strategy:** one `shared/api/` module: typed `apiFetch<T>` wrapping the `{success,message,data}` envelope, per-domain functions (`orders.create`, `coupons.validate`…), types from `shared/types`. Migrate opportunistically — checkout first, then admin pages as touched. Standardize on SWR for authenticated reads to recover caching (addresses, orders, wishlist).
- **Migration considerations:** don't block features on full migration; forbid new raw fetches via lint rule once the client exists.
- **Success criteria:** checkout page contains zero inline endpoint strings; `availableCoupons` and friends fully typed. **Effort:** M. **Epic:** "API client" → stories: core client, checkout migration, SWR adoption for account pages, admin migration, lint guard.

### R4 — Decompose OrderDetailsPage and extract shared providers (P1)
- **Problem/evidence:** TD-4, TD-5.
- **Strategy:** split `OrderDetailsPage.tsx` along its existing seams (`AdminRmaSection`, customer RMA request flow, status tracker already partially in `components.tsx`) into files ≤250 lines; move Toast/Theme providers into `shared/` and consume from both apps (Auth can stay split — the apps' auth semantics genuinely differ).
- **Success criteria:** no file in `shared/pages` >300 lines; one Toast implementation with `aria-live` serving both apps. **Effort:** M.

### R5 — Finish the styling migration deliberately (P2)
- **Problem/evidence:** TD-6. The repo has a rule ("do not mix Tailwind and BEM in one component") that its own checkout page violates.
- **Strategy:** inventory the 15 mixed files; migrate on touch as already mandated, plus a one-time sweep of the 3 worst offenders; add stylelint or a grep-based CI check for Tailwind utility classes inside `ms-*` components.
- **Effort:** M spread over time. **Success criteria:** mixed-file count trending to zero, enforced in CI.

### R6 — Promote `shared/` to a workspace package (P2)
- **Problem/evidence:** TD-9. **Strategy:** add `shared/package.json`, include in workspaces, own tsconfig + typecheck script in CI; keep path aliases as-is to avoid import churn. **Effort:** S. **Success criteria:** `tsc --noEmit` runs for shared independently in CI.

### R7 — Runtime store-config endpoint (P2)
- **Problem/evidence:** TD-10. **Strategy:** serve a public, cacheable `/api/v1/config/public` (server already loads the file at runtime); `StoreConfigProvider` fetches with the build-time JSON as fallback/initial value — no flash, no rebuilds on config edits, and an explicit public/private config split. **Effort:** S (needs one server endpoint — coordinate).

---

## 9. Missing Engineering Practices

| Practice | Status | Why it matters | Recommended first step | Priority |
|---|---|---|---|---|
| Frontend testing (unit/E2E) | **Absent** | Revenue path unguarded | R1 | P0 |
| Error monitoring (Sentry etc.) | Absent | Production failures invisible; checkout errors die in `console.error` | Add Sentry to both apps + source maps | P0/P1 |
| Security header governance | Absent | §5 H1 | R2 | P0 |
| Frontend CI coverage | Unconfirmed (CI file focuses on server; lint config missing) | Broken builds/lint ship | Add web/admin build+typecheck+lint jobs; restore `.eslintrc` | P1 |
| Component documentation / Storybook | Absent | `shared/` primitives + `viewer` pattern are undocumented API surface | Storybook for `UIPrimitives` + atoms only | P2 |
| Bundle analysis & performance budgets | Absent | No regression detection | `@next/bundle-analyzer` + size-limit in CI | P2 |
| Web Vitals / RUM | Absent | No CWV visibility | `useReportWebVitals` → analytics sink | P2 |
| Accessibility reviews/tooling | Absent (good instincts, no process) | §6 gaps | jsx-a11y + axe smoke in E2E | P1 |
| Visual regression | Absent | Mid-migration styling churn is exactly when UIs silently break | Playwright screenshots on 5 key pages | P2 |
| Analytics strategy | Absent | No funnel visibility (add-to-cart → checkout → paid) | Define events; any lightweight provider | P2 |
| i18n/l10n | Absent (₹ and en-IN strings hardcoded) | Only matters if market expansion is planned | Decision record only, for now | P3 |
| ADRs / frontend architecture docs | Partial (CLAUDE.md exists but has drifted — cart claim) | Agents and humans build on stale models | Fix drift now; add ADRs for cart-ownership and styling-migration decisions | P1 (drift fix: XS) |
| Browser compatibility strategy | Absent (no browserslist config observed) | Unknown support floor | Add browserslist; document floor | P3 |
| Release governance / feature flags | Partial (Store.config feature flags exist, build-time only) | Can't dark-launch | R7 enables runtime flags | P2 |

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation | Priority | Suggested owner |
|---|---|---|---|---|---|
| Checkout regression ships untested | High | Critical (revenue) | R1 tests + Sentry | P0 | Web team |
| XSS/clickjacking amplified by missing CSP/headers | Medium | High (admin refund actions) | R2 | P0 | Platform |
| Image optimizer abused via wildcard hosts | High | Medium (cost/SSRF-adjacent) | R2 host allowlist | P0 | Platform |
| Client/server money display drift (localStorage prices vs validated prices) | Medium | Medium (trust/support tickets) | Render totals only from `validate-checkout` response | P1 | Web team |
| Admin/web provider drift causes inconsistent behavior | Medium | Medium | R4 extraction | P1 | Web team |
| Razorpay script load failure strands checkout silently | Low | High per-incident | `onerror` + retry/reuse guard | P1 | Web team |
| CSRF exposure if cookie SameSite is lax/none and server accepts form posts | Unknown | High | Verify with backend (M2) | P1 | Backend+Web |
| Styling migration stalls permanently, doubling UI cost | Medium | Medium | R5 CI guard | P2 | Web team |
| shared/ breakage discovered late | Medium | Low–Medium | R6 | P2 | Platform |
| Dependency vulns unnoticed | Unknown | Medium | Dependabot + audit in CI | P2 | Platform |

---

## 11. Overall Frontend Maturity Assessment

| Dimension | Level (1–5) | Key observation |
|---|---|---|
| Architecture | 3.5 | Right macro-shape (two apps + shared, proxy, RSC where it counts); missing the API-layer meso-structure |
| Component reusability | 3 | Genuine shared-page innovation; undermined by god files and app-level provider duplication |
| UI consistency | 2.5 | Mid-migration split brain (Tailwind vs BEM), enforced by rule but not by tooling |
| State management | 3.5 | Contexts fit the scale; cart/auth interplay is thoughtfully handled; SWR underexploited |
| Performance engineering | 2 | Sound defaults, zero measurement |
| Accessibility | 3 | Above-average craftsmanship, no process; toast live-region gap is the standout defect |
| Security posture | 3 | Core auth model excellent; hardening layer entirely absent |
| Testing strategy | 1 | Nonexistent on the frontend |
| Developer experience | 3 | Small, legible codebase; path aliases; but lint unverifiable and no test harness |
| Design system maturity | 2 | Tokens + primitives exist; no docs, no Storybook, no governance |
| Documentation quality | 2.5 | CLAUDE.md is rich but already factually wrong about the cart |
| Deployment readiness | 2.5 | Builds cleanly; no headers, monitoring, or CDN/browser strategy |
| Enterprise readiness | 2 | Single-brand, single-locale, single-tenant by construction — appropriate for now |

### Verdict

This is a **well-shaped small frontend with production-grade instincts and pre-production safety nets**. The decisions that are hard to retrofit — cookie-based auth through a same-origin proxy, shared viewer-context pages, RSC/ISR on catalog pages, accessible modal primitives — are already correct, which puts this codebase ahead of most at its size. The gaps are almost all in the *surrounding* engineering system rather than the code: no tests, no monitoring, no security headers, no enforcement of its own styling and documentation rules.

**Suitable for long-term evolution?** Yes, conditionally. The architecture will scale to a substantially larger product without structural rework, *provided* the P0 items land before feature velocity increases: test coverage on the cart/checkout path, security headers + image-host allowlist, and error monitoring. The P1 tier (API client layer, OrderDetailsPage decomposition, provider deduplication, CI coverage for the frontend) is what keeps the next 12 months of feature work from compounding today's duplication into tomorrow's rewrite.

**Next 6–12 months, in order:** (1) R1 tests + Sentry; (2) R2 hardening; (3) R3 API client + SWR adoption; (4) R4 decomposition/dedup; (5) styling-migration enforcement and the measurement stack (bundle analysis, Web Vitals, visual regression) as capacity allows.

**Evidence honesty:** claims marked "unable to confirm" throughout: CSRF/SameSite posture, actual lint execution, CI coverage of frontend workspaces beyond the server job, color contrast, chart accessibility, admin table pagination limits, and real-world Core Web Vitals. These require server-config inspection or runtime measurement, both out of scope for this static review.
