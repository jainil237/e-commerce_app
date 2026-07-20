# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Gate

Before any implementation work, load the Agentsmyth v0.1.1 lifecycle workflow:

1. `workflow/router.md` — classify the request (Trivial / Standard / Complex) and select the current phase.
2. `workflow/config/agent-behavior.yaml` — task class definitions, artifact chain, evidence and waiver policy.
3. `workflow/skills/lifecycle-orchestrator/SKILL.md` — primary routing skill for Standard and Complex work.

Full lifecycle for Standard/Complex: **Think → Plan → Build → Review → Test → Ship → Reflect**. Every phase transition requires an artifact with `status: ready-for-next-phase`. See `.claude/CLAUDE.md` for protected paths, branch policy, verification commands, and constraints.

## Workflow Gate

This repo uses the **agentsmyth** lifecycle for non-trivial work. Entry point: `workflow/router.md`. Use `/think`, `/plan`, `/build`, `/review`, `/test`, `/ship`, `/reflect` slash commands for structured lifecycle phases. Artifacts go in `workflow/artifacts/briefs/`. The `.claude/CLAUDE.md` and `.claude/rules/` files carry detailed coding rules per domain — they are auto-loaded by Claude Code.

## Monorepo Structure

npm workspaces with three independently deployable packages:

| Package | Port | Purpose |
|---------|------|---------|
| `apps/web` | 3000 | Customer-facing Next.js 14 storefront |
| `apps/admin` | 3001 | Admin dashboard (Next.js 14) |
| `server` | 4000 | Express 5 REST API |

`shared/` contains types (`shared/types/index.ts`), UI primitives (`shared/components/UIPrimitives.tsx`), page-level components (`shared/pages/`), hooks, and utilities (`shared/utils/index.ts` — `formatCurrency`, `formatDate`, `getDiscountPercentage`, `parseTags`) consumed by both Next.js apps. It is a real workspace package (`@ecom/shared`, listed in the root `workspaces` array); apps still import from it via the `@shared/*` tsconfig alias rather than the `@ecom/shared` package name, since both resolve to the same files and rewriting every call site bought nothing.

## Commands

```bash
# Run everything (all three services concurrently)
npm run dev

# Run individually
npm run dev:server
npm run dev:web
npm run dev:admin

# Build all
npm run build

# Lint all workspaces
npm run lint

# Database (runs in server/ workspace)
npm run db:migrate      # prisma migrate dev
npm run db:generate     # prisma generate (after schema changes without migration)
npm run db:seed         # tsx scripts/seed.ts
npm run db:studio       # prisma studio
npm run db:reset        # prisma migrate reset --force (server workspace only)

# Run server alone (from repo root)
npm run dev --workspace=server
```

`apps/web` has a Vitest + Testing Library suite (`npm run test --workspace=apps/web`). `apps/admin` and `server` have no test suite yet.

## Server Architecture

**Express 5** app (`server/src/index.ts`) with:
- All routes under `/api/v1/`
- JWT auth via **httpOnly cookies** (not Authorization headers). Access token (15 min) + refresh token rotation. Custom cookie parser — no `cookie-parser` package.
- Rate limiting: 1000 req/15 min dev, 100 prod
- Static file serving: `server/uploads/` exposed at `/uploads`

**Auth middleware** (`server/src/middleware/auth.middleware.ts`) has three exports:
- `authenticate` — requires valid session; attaches `req.user` as `AuthRequest`
- `optionalAuth` — same as `authenticate` but continues without error if unauthenticated (used for guest checkout routes)
- `authorizeAdmin` — stack after `authenticate`; rejects non-ADMIN roles with 403

**API response shape**: all endpoints return `{ success: boolean, message: string, data?: any }`. Throw errors via `createError(statusCode, message, code)` from `error.middleware.ts`.

**Route → no controller layer** for most routes: business logic lives directly in route handler files (e.g. `admin.routes.ts` is 36 KB). The `controllers/` directory only contains RMA controllers. **Validation** uses Zod schemas defined inline within each route file; the one exception is `server/src/validators/rma.validator.ts`.

**Storage provider** (`server/src/services/storage.service.ts`): auto-selects at startup via env vars — Cloudflare R2 → Cloudinary → local disk fallback. Never hardcode a storage path.

**Store config** (`Store.config.json` at repo root): loaded at runtime by `server/src/utils/config.ts`. Controls store name, feature flags, courier partners, shipping thresholds, invoice settings, etc. Avoid hardcoding values that belong here.

**Email service** (`server/src/services/email.service.ts`): sends transactional emails (order confirmation, shipping updates, OTP) via Nodemailer. Silently no-ops if SMTP is not fully configured — dev environments work without email setup.

## Database

MySQL via **Prisma 5**. Schema: `server/prisma/schema.prisma`.

Key models and relationships:
- `User` → `Order` (one-to-many, userId nullable for guest checkout)
- `Order` → `Shipment` (one-to-one), `OrderItem[]`, `RMARequest[]`, `OrderAuditLog[]`
- `Product` → `StockReservation[]` — stock is soft-locked during checkout for 15 min (`inventory.reservationDurationMinutes` in Store.config.json)
- `RMARequest` (return/replacement) → `RMAItem[]`, `Refund?`, `Shipment` (pickup + replacement, two foreign keys on Shipment)
- `OrderAuditLog` — append-only; every status transition must write here

Payment: **Razorpay** (`razorpay` package). Webhook verification in `server/src/routes/webhook.routes.ts`.

## Frontend Architecture (apps/web)

**Next.js 14 App Router**. Data fetching via **SWR** with a global fetcher (`credentials: 'include'`). No Redux or Zustand.

**TypeScript path aliases** (defined in `tsconfig.json`): `@/*` → `./src/*`, `@shared/*` → `../../shared/*`, `@config/*` → `../../config/*`.

State is managed through React Contexts (`apps/web/src/contexts/`), all exported from `@/contexts`:
- `AuthContext` — current user, login/logout
- `CartContext` — cart items, add/remove/update (server-synced)
- `WishlistContext` — wishlist state
- `ThemeContext` — dark/light mode via CSS variables
- `ToastContext` — toast notifications
- `StoreConfigContext` — Store.config.json values for the frontend

Provider nesting order matters and is set in `apps/web/src/components/providers.tsx`.

**Component organization** follows atomic design: `atoms/` → `molecules/` (e.g. `ProductCard/`) → `organisms/` (e.g. `Topbar/`, `BottomNav/`). Shared cross-app UI goes in `shared/components/UIPrimitives.tsx` (`SharedBadge`, `SharedButton`, `SharedTableActionCell`).

**Styling** (`apps/web`): SCSS BEM — migrating away from Tailwind CSS and CSS Modules. All new and migrated components use co-located `.scss` files with `ms-*` BEM class names (storefront namespace). Shared foundation:
- `apps/web/src/styles/_variables.scss` — compile-time breakpoints (`$bp-sm/md/lg/xl`), z-index scale, transition durations
- `apps/web/src/styles/_mixins.scss` — `sm`/`md`/`lg`/`xl` breakpoint mixins, `motion` (reduced-motion guard), `glass`, `hide-scrollbar`, `eyebrow`, `card-surface`, `price-text`, `focus-ring`
- `apps/web/src/app/globals.css` — design tokens as CSS custom properties (`--surface-*`, `--text-*`, `--border-*`, `--shadow-*`, `--radius-*`, `--blur-glass`, etc.)

Rules: all transitions/animations must use `@include motion`. Do not mix Tailwind utilities and BEM classes within the same component — enforced by `scripts/verify-no-tailwind-with-scss.mjs`, ratcheted against a recorded baseline of pre-existing violations so it fails only on new ones. Unmigrated pages still use Tailwind — migrate to BEM when touching them. Use `clsx` for conditional class names.

## Admin App (apps/admin)

Same stack and path aliases as `apps/web`. Dashboard analytics use **D3.js** and **Recharts**. Sections under `(dashboard)/`: products, orders, customers, coupons, settings. No shared context providers — admin manages its own auth state independently.

## Environment Variables

Server reads from `server/.env`. Minimum required:
- `DATABASE_URL` — MySQL connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `FRONTEND_URL` (default: `http://localhost:3000`), `ADMIN_URL` (default: `http://localhost:3001`)
- `SERVER_BASE_URL` — used for local storage URL construction
- Storage: `R2_*` vars for Cloudflare R2, or `CLOUDINARY_*` for Cloudinary (see respective service files)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` for Nodemailer email (optional — service no-ops if absent)

## Key Patterns

- **Order status mutations** must write an `OrderAuditLog` entry.
- **Stock changes** during checkout go through `StockReservation` (soft-lock), not direct decrements.
- **Shared page components** (`shared/pages/order/OrderDetailsPage.tsx`) accept a `viewer: ViewerContext` prop (`'customer' | 'admin'`) to render conditionally for each context rather than duplicating the component.
- **RMA flow**: `PENDING → APPROVED → PICKUP_SCHEDULED → ITEM_RECEIVED → REFUND_INITIATED/REPLACEMENT_SHIPPED → COMPLETED`. Each state drives a shipment record with `ShipmentType: REVERSE | REPLACEMENT`.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->