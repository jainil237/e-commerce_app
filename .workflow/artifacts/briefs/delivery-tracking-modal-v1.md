---
slug: delivery-tracking-modal
version: 1
artifact: brief
status: ready-for-next-phase
created: 2026-06-17
updated: 2026-06-17
manifest_ids: [R1, R2, R3, RI1, RI2, RI3, RI4]
upstream: []
orchestration:
  phase: think
  status: ready-for-next-phase
  next_phase: plan
  blockers: []
  user_checkpoint: brief-review
---

# Delivery Tracking Modal — Brief

## Source Links

- User request (this conversation)
- `apps/web/src/app/orders/[id]/page.tsx` — order detail page (web, customer)
- `shared/pages/order/OrderDetailsPage.tsx` — shared order detail layout
- `shared/pages/order/components.tsx` — `TrackingCard` component (existing static tracking display)
- `shared/types/index.ts` — `Order.tracking` type (`{ courier, trackingId, trackingUrl }`)
- `server/src/utils/tracking.ts` — `getTrackingUrl()` utility
- `Store.config.json` — `courier.partners` list and `courier.trackingUrls` map
- `server/src/routes/order.routes.ts` — existing order API; maps DB shipment fields to `Order.tracking`
- `server/prisma/schema.prisma` — `Shipment` model has `courierPartner`, `awbNumber`

## Problem

Customers viewing an order can currently see a static `TrackingCard` showing the courier name, AWB ID, and an external link to the courier's tracking page. There is no in-app delivery status display. Customers must leave the site to check their shipment.

The request is to add a modal in the web app where the customer selects a delivery partner and enters (or confirms) the AWB number, then sees latest delivery updates and status without leaving the site.

## Goals

1. Open a delivery tracking modal from the order details page in the web app (customer view).
2. Present a dropdown of courier partners populated from `Store.config.json → courier.partners`.
3. Accept an AWB number as a text input.
4. Display latest delivery updates and status inside the modal.
5. Pre-fill courier and AWB from the order's existing tracking data when available.

## Non-Goals

- Admin-side tracking management (admin already sets AWB and courier via the existing admin flow).
- Changing the `TrackingCard` for admin viewers.
- Adding new courier partners to `Store.config.json` (config is out of scope here).
- Real-time push updates / polling (initial load only, unless Q1 answer changes this).

## User Impact

Customers can check delivery status without leaving the store. Reduces support inquiries about "where is my order."

## Success Metrics

- Modal opens from order detail page with pre-filled courier + AWB (when available).
- Dropdown lists all configured courier partners.
- Status/updates are displayed inside the modal.
- No unhandled error state when AWB is not yet assigned.

## Requirements

### R1 — Tracking modal UI
A modal on the customer order detail page (`apps/web`) with:
- Courier partner dropdown (values from `Store.config.json → courier.partners`)
- AWB number text input
- A "Track" / submit action that triggers status display
- Pre-filled from `order.tracking.courier` / `order.tracking.trackingId` when present
- Acceptance: Modal renders, dropdown is populated, AWB field accepts input, pre-fill works when tracking data exists.

### R2 — Delivery status display in modal
After submitting courier + AWB, the modal shows latest delivery updates and status.
- Acceptance: At minimum one status indicator (e.g., current status string) is shown after submission. Depends on Q1 resolution.

### R3 — Modal trigger
A "Track Delivery" button or link on the order detail page (customer view) that opens the modal. Should appear when the order has shipped or tracking data exists.
- Acceptance: Button visible on shipped orders; clicking opens the modal; absent or disabled on unshipped orders.

## Constraints

- `[domain.yaml]` Payment/checkout flows must not be touched.
- `[repo-profile.yaml]` `shared/types/index.ts` is a protected path — adding a new field requires coordination.
- `[domain.yaml]` `.env` values must not appear in any artifact.
- `[domain.yaml]` No destructive DB commands without explicit approval.
- Courier partners must come from `Store.config.json`; do not hardcode them.
- No direct-to-`main` commits — feature branch + PR required.

## Risks

- **Tracking data source (Q1 is blocking)**: if live API integration is required, this needs new backend routes, possibly third-party API credentials, error handling for unavailable tracking APIs, and may elevate this to Complex. If a redirect or iframe approach is accepted, scope is significantly smaller.
- **AWB not yet assigned**: orders may have no tracking data yet; modal must handle gracefully.
- `shared/pages/order/components.tsx` is used by both web and admin viewers — changes must not break admin.

## Open Questions

### Q1 — Tracking data source *(BLOCKING)*
**Owner:** User  
**Blocking: yes**

How should "latest delivery updates and status" be fetched and displayed?

**Option A — External redirect / new tab**: Clicking Track opens the courier's tracking URL in a new tab (already supported via `getTrackingUrl()`). Modal becomes a launcher, not a status display. Simplest; no backend change needed.

**Option B — Embedded iframe**: Modal embeds the courier's tracking page in an iframe. Medium complexity; works for couriers that allow embedding; no API credentials needed.

**Option C — Backend courier API integration**: A new server route calls the courier's tracking API (e.g. Delhivery `https://track.delhivery.com/api/v1/packages/json/`) and returns structured status + events. Most robust; requires backend work, possible API keys, error handling per courier. Elevates complexity.

Which option should we implement?

## Requirement Manifest

### Explicit (R)

| ID | Summary | Acceptance |
|---|---|---|
| R1 | Tracking modal with courier dropdown and AWB input | Modal renders with dropdown from config, AWB field, pre-fill when tracking exists, submit action |
| R2 | Delivery status display inside modal | Status/updates visible after submitting courier + AWB |
| R3 | Modal trigger button on order detail page | Button visible on shipped orders; opens modal; absent/disabled on unshipped |

### Implicit (RI)

| ID | Source | Summary | Acceptance |
|---|---|---|---|
| RI1 | `shared/pages/order/components.tsx` | Changes to shared components must not break admin viewer | Admin order detail renders without regression |
| RI2 | `Store.config.json` | Courier partner list must be loaded from config, not hardcoded | Dropdown is driven by `Store.config.json → courier.partners`; adding a new partner to config updates dropdown without code change |
| RI3 | `shared/types/index.ts` (protected path) | If new types are added, they must be backward-compatible | Existing consumers of `Order` type compile without change |
| RI4 | `repo-profile.yaml` branch policy | Work must be on a feature branch with a PR | No direct commits to `main`; PR created before merge |

### Assumptions (A)

| ID | Assumption |
|---|---|
| A1 | The modal is triggered from the customer `OrderDetailsPage` view only (not orders list). |
| A2 | Courier partner list is sourced from `Store.config.json → courier.partners` array, which is already available at runtime via the config utility. |
| A3 | When `order.tracking` is populated, the modal opens pre-filled; user can edit before submitting. |
| A4 | The "Track" button / modal trigger is shown only when `order.status` indicates the order has shipped (e.g., status `SHIPPED` or `DELIVERED`) OR when `order.tracking` is present. |

### Open Questions (Q)

| ID | Question | Owner | Blocking |
|---|---|---|---|
| Q1 | How should delivery status data be sourced and displayed in the modal? (Option A: redirect, B: iframe, C: backend API) | User | yes |

## Questions For User

**Q1 (blocking):** How should the modal display "latest delivery updates and status"?

- **Option A** — Open external tracking link in a new tab (simplest, uses existing `getTrackingUrl()`, no backend change)
- **Option B** — Embed the courier's tracking page in an iframe inside the modal (medium complexity, no API needed)
- **Option C** — Fetch live structured tracking data from courier APIs via a new backend endpoint (most powerful, requires credentials per courier, adds backend complexity)

Your answer determines whether this is a Standard or Complex task and what backend work is needed.

## Architecture Notes

- role: Architect
- decision: Classified as **Standard** pending Q1 answer. If Option C (courier API integration) is chosen, re-classify as **Complex** due to new service layer, per-courier error handling, and possible credential management.
- constraint: `TrackingCard` in `shared/pages/order/components.tsx` is shared between web (customer) and admin views. New modal must be web-only; `TrackingCard` should remain unchanged or have its change backward-compatible. The modal component itself belongs in `apps/web/src/` or as a new web-specific component.
- constraint: `shared/types/index.ts` is a protected path. Adding fields needs careful review; the existing `Order.tracking` type already covers courier/AWB/URL so no new type field is expected for Options A/B.
- tradeoff: Option A is a redirect (not in-modal display) but requires zero backend work and is fully functional for tracking. Option C gives the best UX but couples the app to each courier's API contract.
- downstream: Plan phase will map out component location, any new backend route, and the config-reading pattern for courier partners. Build workstreams are independent if UI and backend are split (Option C only).

## Exit Gate

- [x] Every active R and RI has acceptance criteria.
- [x] Blocking Q IDs appear in orchestration.blockers: [Q1]
- [ ] User approved or waiver recorded.
