# Repo Mental Map — ecommerce-platform

## What This Repo Does

Full-stack e-commerce platform for selling physical goods online. It comprises three main applications — a customer-facing storefront, an admin/merchant dashboard, and a REST API backend — plus a shared library used by both apps. Features include product browsing, cart, checkout, order management, returns (RMA), and replacements.

---

## Architecture at a Glance

```
ecommerce-platform/          # npm workspace monorepo
├── apps/
│   ├── web/                 # Customer storefront (Next.js)
│   └── admin/               # Merchant/admin dashboard (Next.js)
├── server/                  # REST API backend (Express + Prisma + MySQL)
│   └── prisma/schema.prisma # Database schema — PROTECTED
├── shared/                  # Shared types, components, hooks, pages, utils
│   └── types/               # TypeScript type definitions — PROTECTED
├── docs/                    # Documentation (this file lives here)
└── .workflow/               # agentsmyth lifecycle workflow configs and skills
```

---

## Key Paths

| Path | Purpose |
|---|---|
| `apps/web/src` | Customer storefront source |
| `apps/admin/src` | Admin dashboard source |
| `server/src` | Backend API source (routes, services, controllers, middleware) |
| `shared/` | Shared components, hooks, types, pages, utils |
| `server/prisma/schema.prisma` | Prisma database schema |
| `.workflow/config/` | agentsmyth lifecycle configuration |

---

## Protected Paths

These must not be changed without explicit user review and approval:

| Path | Reason |
|---|---|
| `server/prisma/schema.prisma` | Database schema — changes require migrations and affect all data models |
| `shared/types/` | Shared TypeScript types — breaking changes propagate to all apps |
| `server/src/routes/webhook.routes.ts` | Payment webhook handler — security-critical |
| `.env*` | Environment secrets |

---

## Source-of-Truth Hierarchy

1. **Requirements:** Notion — https://app.notion.com/p/383ad9949bf48086b34eeb53690caf26
2. **Decisions:** Notion — https://app.notion.com/p/383ad9949bf48086b34eeb53690caf26
3. **Code:** `main` branch is authoritative for current state

---

## Verification Defaults

| Check | Command | Required before ship? |
|---|---|---|
| Build | `npm run build` | Yes |
| Lint | `npm run lint` | No (recommended) |
| DB migration | `npm run db:migrate` | Only when schema changes |

No automated test suite exists yet.

---

## Branch and Release Policy

- Default branch: `main`
- **All changes must go through a feature branch + PR** — no direct commits to `main`
- PR review is required before merging
- Deployment targets: Vercel (web + admin apps), cloud server (backend API)

---

## Known Risks and Non-Goals

**The AI agent must never:**
- Modify payment or checkout logic without explicit user approval
- Run destructive database commands (DROP, DELETE on prod tables, irreversible migrations)
- Push directly to `main`
- Expose `.env` file contents in any artifact, log, or summary

**Out of scope:**
- Multi-tenant / SaaS functionality
- Native mobile apps
