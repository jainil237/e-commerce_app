---
name: ecommerce-implementation-patterns
description: Architectural patterns and conventions discovered in the e-commerce app codebase
metadata:
  type: project
---

# E-commerce App Implementation Patterns

## Component Structure & Organization

### File Organization
- **Pages**: `apps/web/src/app/` (Next.js 14 app directory)
- **Components**: 
  - `apps/web/src/components/molecules/` — mid-level components (ProductCard, TrackingModal)
  - `apps/web/src/components/organisms/` — large components (Topbar, BottomNav)
  - `apps/web/src/components/layout/` — layout wrappers
- **Shared across apps**: `shared/pages/order/`, `shared/types/`, `shared/components/`
- **Contexts**: `apps/web/src/contexts/` — React Context for auth, toast, etc.

### Component Patterns
- All client components use `'use client'` directive (Next.js 14)
- Page components are functional components with hooks
- Props interfaces are defined inline or in shared types
- Shared types live in `shared/types/index.ts` (Order, Product, User, etc.)

## State Management & Data Fetching

- **State**: React hooks (useState, useEffect)
- **Auth**: Context-based (`useAuth()` from `@/contexts`)
- **Toast notifications**: Context-based (`useToast()` from `@/contexts`)
- **Data fetching**: Direct fetch API calls (not SWR or other libraries)
- **API paths**: All prefixed with `/api/v1/` (e.g., `/api/v1/orders/{id}`)

## Styling System

### CSS Variables (defined in `apps/web/src/app/globals.css`)
- **Brand**: `--brand-primary`, `--brand-accent`, `--brand-primary-fg`
- **Surfaces**: `--surface-0` (white), `--surface-1` (off-white), `--surface-2` (light gray)
- **Text**: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-inverse`
- **Semantic**: `--success`, `--warning`, `--error`, `--info`
- **Borders**: `--border-base`, `--border-subtle`
- **Radii**: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-2xl`
- **Dark mode**: Automatic via `.dark` class with inverted color maps

### Tailwind Usage
- Classes use CSS variables: `className="bg-[var(--surface-0)]"`
- No hardcoded colors; always use variables
- `transition` class for smooth state changes
- `hover:opacity-90` for button feedback

### Icons
- Library: **lucide-react** (`Loader2`, `X`, etc.)
- Direct import: `import { X } from 'lucide-react'`

## Backend (Express.js)

### Route Structure
- Routes in `server/src/routes/` (order.routes.ts, admin.routes.ts, etc.)
- Exported as `export default router`
- Public endpoints: no `authenticate` middleware
- Protected endpoints: use `authenticate` middleware

### Configuration
- `Store.config.json` at repo root contains all static config
- Loaded via `getStoreConfig()` from `server/src/utils/config.ts`
- Config structure includes: store metadata, features, courier partners, shipping, invoice, etc.

### Error Handling
- Custom error wrapper: `createError(status, message, code)`
- Middleware at route level: `(req, res, next) => { try { ... } catch (error) { next(error) } }`

### API Response Format
```typescript
{
  success: boolean,
  data?: any,
  message?: string,
  meta?: { /* pagination, etc */ }
}
```

## Modal & UI Patterns

### Modal Implementation (from TrackingModal)
- **Overlay**: `fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50`
- **Container**: `bg-[var(--surface-0)] rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col`
- **Header**: Border-bottom with close button (X icon)
- **Content**: Scrollable area with form/content
- **Footer/Actions**: Below content, full-width buttons

### Form Elements
- **Selects**: `border border-[var(--border-base)] rounded-md ... focus:ring-2 focus:ring-[var(--brand-primary)]`
- **Inputs**: Same border/focus pattern as selects
- **Buttons**: 
  - Primary: `bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] font-semibold`
  - Secondary: `border border-[var(--border-base)] text-[var(--text-primary)]`
  - Hover states: `hover:opacity-90` or `hover:bg-[var(--surface-2)]`
  - Disabled: `disabled:opacity-50 disabled:cursor-not-allowed`

### Input Accessibility
- Labels: `<label className="block text-sm font-semibold">` before input
- Placeholders use `--text-tertiary` color
- IDs and aria attributes where appropriate (e.g., `aria-label="Close modal"`)

## Specific to Delivery Tracking Feature

### Backend Endpoint Pattern
- Public endpoint: `router.get('/courier-config', async (req, res, next) => { ... })`
- No auth middleware; config is non-sensitive
- Response structure: `{ success: true, data: { partners: [], trackingUrls: {} } }`

### iframe Embedding
- Sandbox attrs: `sandbox="allow-scripts allow-same-origin allow-forms"`
- Error handling: `onError` callback to show fallback
- Fallback: `<a href={url} target="_blank">Open in New Tab</a>`

### URL Template Interpolation
- Template from config: e.g., `"https://example.com/track?awb={awb}"`
- Client-side replacement: `template.replace('{awb}', actualAwb.trim())`
- No server-side URL shortening or validation needed

## Build & Testing

### Build Commands
- `npm run build --workspace=apps/web` — Next.js build for customer app
- `npm run build --workspace=apps/admin` — Next.js build for admin app
- `npm run build --workspace=server` — TypeScript compilation (Express)
- `npm run build` — all workspaces

### Build Verification
- No pre-existing build errors in web/admin (clean builds)
- Server has unrelated TypeScript config issues (not blocking feature work)

## Repository Structure

```
e-commerce_app/
├── apps/
│   ├── web/                    # Customer-facing Next.js 14 app
│   │   └── src/
│   │       ├── app/            # Pages
│   │       ├── components/     # UI components
│   │       │   ├── molecules/  # Mid-level components
│   │       │   └── organisms/  # Large components
│   │       └── contexts/       # React Context hooks
│   └── admin/                  # Admin Next.js 14 app
├── server/                     # Express.js backend
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   └── utils/
│   └── prisma/                 # Database schema
├── shared/                     # Shared types & components
│   ├── types/index.ts         # TypeScript interfaces
│   ├── pages/
│   └── components/
├── Store.config.json           # Global app configuration
├── .workflow/                  # Agentsmyth workflow artifacts
└── .claude/                    # Claude Code config & memory
```

## Key Files to Know

- **API routes**: `server/src/routes/order.routes.ts` (orders API)
- **Types**: `shared/types/index.ts` (Order, Product, User, etc.)
- **Shared order display**: `shared/pages/order/OrderDetailsPage.tsx` (used by both web and admin)
- **Config**: `Store.config.json` (courier partners, shipping, invoice, etc.)
- **CSS variables**: `apps/web/src/app/globals.css` (design tokens)
- **Auth context**: `apps/web/src/contexts/` (useAuth, useToast)

## Critical Lesson: Express Route Ordering Matters

**Issue encountered during delivery tracking modal test phase:**

When adding a new public endpoint `/courier-config` to `order.routes.ts`, the endpoint was initially placed at the end of the file (line 610), after a parametric route `/:id` (line 443). This caused all requests to `/api/v1/orders/courier-config` to be routed to the `:id` handler instead of the literal `/courier-config` handler.

**Root cause**: Express matches routes in order of definition. The parametric pattern `/:id` matches the string "courier-config" and captures it as an ID parameter.

**Solution**: Always place literal (non-parametric) routes BEFORE parametric routes in the same router. Move `/courier-config` immediately after the `GET /` route and before any `/:id`, `/:id/invoice`, etc. routes.

**Code order in order.routes.ts:**
```typescript
router.post('/', authenticate, ...)         // POST /
router.post('/verify-payment', authenticate, ...)
router.get('/courier-config', async ...)   // ← Literal route (no auth) — must be before /:id
router.get('/', authenticate, ...)         // GET /
router.get('/:id', authenticate, ...)      // Parametric route — matches anything after here
router.get('/:id/invoice', authenticate, ...)
router.post('/:id/cancel', authenticate, ...)
```

**Takeaway**: When adding new endpoints to a route handler that already has parametric routes, always add literal routes before parametric ones, regardless of file location. Test endpoint access immediately after adding routes to catch routing bugs early.
