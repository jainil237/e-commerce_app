# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Gate

Before any implementation work, follow the Agentsmyth Workflow Gate defined in `.claude/CLAUDE.md`. All Standard and Complex tasks require a brief artifact before any code is written.

## Monorepo Structure

npm workspaces with three independently deployable packages:

| Package | Port | Purpose |
|---------|------|---------|
| `apps/web` | 3000 | Customer-facing Next.js 14 storefront |
| `apps/admin` | 3001 | Admin dashboard (Next.js 14) |
| `server` | 4000 | Express 5 REST API |

`shared/` contains types (`shared/types/index.ts`), UI primitives (`shared/components/UIPrimitives.tsx`), page-level components (`shared/pages/`), hooks, and utilities consumed by both Next.js apps. It is **not** a workspace package — apps import from it via relative paths or tsconfig path aliases.

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
npm run db:seed         # tsx scripts/seed.ts
npm run db:studio       # prisma studio
npm run db:reset        # prisma migrate reset --force

# Run server alone (from repo root)
npm run dev --workspace=server
```

No test suite is currently configured.

## Server Architecture

**Express 5** app (`server/src/index.ts`) with:
- All routes under `/api/v1/`
- JWT auth via **httpOnly cookies** (not Authorization headers). Access token (15 min) + refresh token rotation. Custom cookie parser — no `cookie-parser` package.
- Auth middleware: `server/src/middleware/auth.middleware.ts` — attaches `req.user` as `AuthRequest`
- Rate limiting: 1000 req/15 min dev, 100 prod
- Static file serving: `server/uploads/` exposed at `/uploads`

**Route → no controller layer** for most routes: business logic lives directly in route handler files (e.g. `admin.routes.ts` is 36 KB). The `controllers/` directory only contains RMA controllers.

**Storage provider** (`server/src/services/storage.service.ts`): auto-selects at startup via env vars — Cloudflare R2 → Cloudinary → local disk fallback. Never hardcode a storage path.

**Store config** (`Store.config.json` at repo root): loaded at runtime by `server/src/utils/config.ts`. Controls store name, features flags, courier partners, shipping thresholds, invoice settings, etc. Avoid hardcoding values that belong here.

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

**Next.js 14 App Router**. Data fetching via **SWR** with a global fetcher (credentials: include). No Redux or Zustand.

State is managed through React Contexts (`apps/web/src/contexts/`), all exported from `@/contexts`:
- `AuthContext` — current user, login/logout
- `CartContext` — cart items, add/remove/update (server-synced)
- `WishlistContext` — wishlist state
- `ThemeContext` — dark/light mode via CSS variables
- `ToastContext` — toast notifications
- `StoreConfigContext` — Store.config.json values for the frontend

Provider nesting order matters and is set in `apps/web/src/components/providers.tsx`.

**Component organization** follows atomic design: `atoms/` → `molecules/` (e.g. `ProductCard/`) → `organisms/` (e.g. `Topbar/`, `BottomNav/`). Shared cross-app UI goes in `shared/components/UIPrimitives.tsx` (`SharedBadge`, `SharedButton`, `SharedTableActionCell`).

**Styling**: Tailwind CSS + CSS custom properties for theming (`--surface-1`, `--text-primary`, etc. defined in `globals.css`). Use `clsx` + `tailwind-merge` for conditional classes.

## Admin App (apps/admin)

Same stack as `apps/web`. Dashboard analytics use **D3.js** and **Recharts**. No shared context providers — admin manages its own auth state independently.

## Environment Variables

Server reads from `server/.env`. Minimum required:
- `DATABASE_URL` — MySQL connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `FRONTEND_URL` (default: `http://localhost:3000`), `ADMIN_URL` (default: `http://localhost:3001`)
- `SERVER_BASE_URL` — used for local storage URL construction
- Storage: `R2_*` vars for Cloudflare R2, or `CLOUDINARY_*` for Cloudinary (see respective service files)
- `SMTP_*` for Nodemailer email

## Key Patterns

- **Order status mutations** must write an `OrderAuditLog` entry.
- **Stock changes** during checkout go through `StockReservation` (soft-lock), not direct decrements.
- **Shared page components** (`shared/pages/order/OrderDetailsPage.tsx`) accept a `viewer: ViewerContext` prop (`'customer' | 'admin'`) to render conditionally for each context rather than duplicating the component.
- **RMA flow**: `PENDING → APPROVED → PICKUP_SCHEDULED → ITEM_RECEIVED → REFUND_INITIATED/REPLACEMENT_SHIPPED → COMPLETED`. Each state drives a shipment record with `ShipmentType: REVERSE | REPLACEMENT`.
