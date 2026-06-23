# agentsmyth Workflow Gate — ecommerce-platform

> **Domain:** ecommerce-platform | Full-stack e-commerce platform for selling physical goods online, comprising a customer-facing storefront (Next.js), admin dashboard (Next.js), and REST API backend (Express + Prisma + MySQL). Supports product browsing, cart, checkout, order management, returns, and replacements.

## Mandatory — read before any task

1. `workflow/router.md` — routes all tasks through the lifecycle.
2. `workflow/config/agent-behavior.yaml` — behavior invariants, task classes, evidence rules.

Never skip this gate. Never mark a phase complete without evidence.

## Branch policy

Default branch: `main`
All changes via non-default branch required.

## Protected paths

- `.git/**` — repository metadata
- `.env*` — potential secrets
- `**/*secret*` — potential secrets
- `server/prisma/schema.prisma` — database schema — changes affect all data models and require migration
- `shared/types/**` — shared TypeScript types consumed by all apps — breaking changes propagate everywhere
- `server/src/routes/webhook.routes.ts` — payment webhook handler — must never be modified without explicit approval

## Verification commands

- `npm run build`
- `npm run lint`
- `npm run db:migrate`

## Constraints

- Do not introduce domain-specific behavior unless the user request or repo context requires it.
- Treat compatibility, source authority, verification, and release impact as implicit requirements when material.
- Do not modify payment or checkout logic (server/src/routes/webhook.routes.ts, checkout flows, Razorpay integration) without explicit user approval.
- Do not expose secrets, credentials, private tokens, API keys, or sensitive local paths in lifecycle artifacts.
- Do not perform destructive actions without explicit user approval.
- Do not claim external state without evidence.
- Do not include environment variable values, connection strings, or authentication material in any artifact section.
- Do not run destructive database commands (DROP, DELETE on production tables, irreversible migrations) without explicit user approval.
- Do not push directly to main — always use a feature branch and open a PR.
- Do not expose .env file contents in any written artifact, log, or summary.
- Do not make any source, ticketing, hosting, CI, package, or deployment provider mandatory by default.
- Use configured providers only when this config, another workflow config, or the user request enables them.
