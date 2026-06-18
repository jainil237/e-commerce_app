---
slug: delivery-tracking-modal
version: 1
artifact: plan
status: ready-for-next-phase
created: 2026-06-17
updated: 2026-06-18
manifest_ids: [R1, R2, R3, RI1, RI2, RI3, RI4]
upstream:
  brief: .workflow/artifacts/briefs/delivery-tracking-modal-v1.md
orchestration:
  phase: build
  status: ready-for-next-phase
  next_phase: review
  blockers: []
  user_checkpoint: none
---

# Delivery Tracking Modal — Plan

## Summary

Add a delivery tracking modal to the customer-facing web app (`apps/web`). The modal accepts a courier partner (dropdown from `Store.config.json`) and AWB number (pre-filled from order data), then renders the courier's tracking page in an iframe. A "Track Delivery" button on the order detail page triggers the modal; it is shown only when the order is shipped or has tracking data.

**Approach selected:** Option B — iframe embed of courier tracking URL.

**Task class:** Standard. Single build workstream. Three sequential phases (backend config endpoint → modal component → page integration).

## Inputs

- Approved brief: `.workflow/artifacts/briefs/delivery-tracking-modal-v1.md`
- User decision: Option B (iframe)
- `Store.config.json → courier` block: partners list + trackingUrls map
- `server/src/utils/config.ts` → `getStoreConfig()` / `getTrackingUrl()`
- `server/src/utils/tracking.ts` → `getTrackingUrl(courier, awb): string` (already in tracking.ts, duplicated in config.ts — use config.ts version)
- `server/src/routes/order.routes.ts` — existing order routes; add courier config endpoint here
- `apps/web/src/app/orders/[id]/page.tsx` — customer order detail page
- `shared/pages/order/OrderDetailsPage.tsx` — shared layout (not modified)
- `shared/pages/order/components.tsx` — `TrackingCard` (not modified)
- `shared/types/index.ts` — `Order.tracking` shape (not modified)

## Requirement Coverage

| Manifest ID | Covered by phases | Notes |
|---|---|---|
| R1 | Phase 2 (modal component) | Courier dropdown, AWB input, pre-fill, submit |
| R2 | Phase 2 (modal component) | Iframe displays courier tracking page after submit |
| R3 | Phase 3 (page integration) | "Track Delivery" button on order detail page |
| RI1 | Phase 2, Phase 3 | Shared components not modified; admin view unaffected |
| RI2 | Phase 1 (backend endpoint) | Partners served from `Store.config.json` via API |
| RI3 | All phases | `shared/types/index.ts` not modified; `Order.tracking` already covers needed shape |
| RI4 | Branch strategy | Feature branch + PR required |

## Repo Impact Map

| File | Change type | Manifest IDs | Notes |
|---|---|---|---|
| `server/src/routes/order.routes.ts` | Add endpoint | RI2 | `GET /api/v1/orders/courier-config` — returns `{ partners, trackingUrls }` from Store.config |
| `apps/web/src/components/molecules/TrackingModal/TrackingModal.tsx` | Create | R1, R2 | New modal component; web-only |
| `apps/web/src/app/orders/[id]/page.tsx` | Modify | R3 | Add trigger button + modal state + render `<TrackingModal>` |
| `shared/pages/order/components.tsx` | No change | RI1 | TrackingCard remains; admin unaffected |
| `shared/types/index.ts` | No change | RI3 | `Order.tracking` already has `{ courier, trackingId, trackingUrl }` |

## Source-of-Truth Strategy

No external source-of-truth update required. Requirements tracked in Notion (location: `<USER-TODO>`). No ticket ID referenced. Source-of-truth update: not required for this task.

## Approach

1. **Phase 1 (backend):** Add a public-facing read-only endpoint in `order.routes.ts` that returns the courier partners list and URL templates from `getStoreConfig()`. No auth required (config is non-sensitive). Endpoint: `GET /api/v1/orders/courier-config`.

2. **Phase 2 (modal component):** Create `TrackingModal` in `apps/web/src/components/molecules/TrackingModal/TrackingModal.tsx`. On mount, fetch `/api/v1/orders/courier-config` for the dropdown. Pre-fill courier from `order.tracking?.courier`, AWB from `order.tracking?.trackingId`. "Track" button constructs the tracking URL from `trackingUrls[selectedCourier].replace('{awb}', awb)` (client-side, avoids a second round-trip) and sets it as the iframe `src`. Include an `<a>` fallback link for couriers that block iframe embedding.

3. **Phase 3 (integration):** In `apps/web/src/app/orders/[id]/page.tsx`, add `isTrackingOpen` state. Add a "Track Delivery" button visible when `order.status === 'SHIPPED' || order.status === 'DELIVERED' || !!order.tracking`. Render `<TrackingModal>` conditionally.

## Phases

### Phase 1 — Backend courier config endpoint

- **Manifest IDs:** RI2
- **Touches:** `server/src/routes/order.routes.ts`
- **Work:**
  - Import `getStoreConfig` (already imported in file).
  - Add `router.get('/courier-config', ...)` handler (no auth middleware — data is non-sensitive public config).
  - Response: `res.json({ success: true, data: { partners: config.courier.partners, trackingUrls: config.courier.trackingUrls } })`
- **Exit gate:** `curl http://localhost:3001/api/v1/orders/courier-config` returns `{ success: true, data: { partners: [...], trackingUrls: {...} } }` with HTTP 200. No 500 or missing fields.

### Phase 2 — TrackingModal component

- **Manifest IDs:** R1, R2, RI1, RI3
- **Touches:** `apps/web/src/components/molecules/TrackingModal/TrackingModal.tsx` (new file)
- **Work:**
  - `'use client'` component.
  - Props: `{ isOpen: boolean; onClose: () => void; order: Order }`
  - Local state: `courier` (string, defaults to `order.tracking?.courier ?? ''`), `awb` (string, defaults to `order.tracking?.trackingId ?? ''`), `trackingUrl` (string | null, null until user hits Track), `partners` (string[]), `trackingUrls` (Record<string, string>), `loadError` (boolean for iframe error fallback).
  - On mount: `fetch('/api/v1/orders/courier-config')` → populate `partners` dropdown and `trackingUrls` map.
  - "Track" button: if `courier` and `awb` are non-empty, compute `url = trackingUrls[courier]?.replace('{awb}', awb.trim())` → set `trackingUrl`.
  - Iframe: `<iframe src={trackingUrl} onError={() => setLoadError(true)} />` with `sandbox="allow-scripts allow-same-origin allow-forms"`.
  - Fallback: when `loadError` or iframe cannot load, show "Open tracking page in new tab" anchor to the same URL.
  - Close button: calls `onClose()`, resets `trackingUrl` and `loadError`.
  - Uses existing CSS variables (`--surface-0`, `--brand-primary`, etc.) for styling; no new design tokens.
- **Exit gate:** Component file exists. Renders without TypeScript errors (`npm run build --workspace=apps/web` passes). Dropdown is populated from API response. "Track" button sets iframe src. `order.tracking` data pre-fills fields when present.

### Phase 3 — Order detail page integration

- **Manifest IDs:** R3, RI4
- **Touches:** `apps/web/src/app/orders/[id]/page.tsx`
- **Work:**
  - Import `TrackingModal`.
  - Add `const [isTrackingOpen, setIsTrackingOpen] = useState(false)`.
  - Show "Track Delivery" button when: `order.status === 'SHIPPED' || order.status === 'DELIVERED' || !!order.tracking`. Disable/hide otherwise.
  - Render `<TrackingModal isOpen={isTrackingOpen} onClose={() => setIsTrackingOpen(false)} order={order} />` at page root (outside `OrderDetailsPage` to avoid shared component coupling).
  - Button placement: alongside existing invoice download/email buttons in the page's action area, or beneath the `<OrderDetailsPage>` component — whichever is less invasive to existing layout.
- **Exit gate:** "Track Delivery" button is visible on a shipped order and absent/disabled on a pending order. Clicking opens the modal. Closing the modal hides it. `npm run build` passes. Admin order detail page unchanged.

## Dependency Order

```
Phase 1 (backend endpoint)
  → Phase 2 (modal fetches from endpoint; Phase 1 must be testable first)
    → Phase 3 (page imports modal; Phase 2 must exist first)
```

All three phases are strictly sequential. No parallel workstreams.

## Branch Strategy

- Branch name: `feature/delivery-tracking-modal`
- Cut from: `main`
- All three phases committed to this branch.
- No commits to `main` directly.
- PR opened after Phase 3 is complete and `npm run build` passes.

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner | Manifest IDs |
|---|---|---|---|---|---|
| Courier tracking pages block iframe (X-Frame-Options: DENY) | High (common for Delhivery, BlueDart) | Medium — iframe shows blank | Always render fallback "Open in new tab" link alongside iframe; handle `onError` + frame load detection | Build | R2 |
| `getStoreConfig()` throws if config file path changes | Low | Low — endpoint 500s | Wrap in try/catch; return 500 with clear message | Build | RI2 |
| `order.tracking` is null on unshipped orders | Certain | Low — button must not show | Condition on `order.status` or `!!order.tracking` before showing button | Build | R3 |
| CSS var mismatch in new component (dark mode) | Low | Low — visual only | Use only established `--surface-*`, `--text-*`, `--brand-*` tokens; test in both themes | Build | R1 |

## Verification Plan

| Manifest ID | Evidence type | Evidence | Owner phase | Notes |
|---|---|---|---|---|
| R1 | command | `npm run build --workspace=apps/web` passes | Build (Phase 2) | TypeScript compilation confirms props, state shape, dropdown render |
| R2 | manual QA | Open modal on a shipped order, enter courier + AWB, click Track; iframe renders courier page or fallback link shown | Build (Phase 2) | Cannot automate iframe content check; manual QA required |
| R3 | manual QA | Button visible on shipped order, absent on pending order; click opens modal, X closes it | Build (Phase 3) | |
| RI1 | manual QA | Navigate to admin order detail; layout and TrackingCard unchanged | Build (Phase 3) | Confirms shared components not regressed |
| RI2 | command | `curl /api/v1/orders/courier-config` returns partners list from Store.config.json | Build (Phase 1) | |
| RI3 | command | `npm run build` (all workspaces) passes — `shared/types/index.ts` unchanged | Build (Phase 3) | |
| RI4 | review | PR opened from `feature/delivery-tracking-modal` to `main`; no direct main commits | Ship | |

## Architecture Notes

- role: Principal Engineer
- decision: Courier config (partners + URL templates) served via `GET /api/v1/orders/courier-config` rather than a new dedicated config route. Rationale: avoids creating a new route file; `order.routes.ts` already imports `getStoreConfig`; keeps blast radius small.
- decision: URL template interpolation (`{awb}` → actual AWB) done client-side inside `TrackingModal`. This avoids a second API round-trip after the user hits "Track" and keeps the modal responsive. The URL template is non-sensitive (public tracking page URLs).
- decision: `TrackingModal` lives in `apps/web/src/components/molecules/TrackingModal/` (web-only). It is not placed in `shared/` because the admin view does not need this modal; admin has its own shipment management UI.
- constraint: `shared/pages/order/components.tsx` (TrackingCard) and `shared/types/index.ts` must not change. The existing `Order.tracking` type already has `{ courier, trackingId, trackingUrl }` which is sufficient for pre-filling.
- tradeoff: Client-side URL construction means if `Store.config.json` changes the `{awb}` placeholder format, the client-side logic must also update. Accepted — `{awb}` is a stable convention; server already uses the same format.
- tradeoff: No iframe height auto-sizing (courier pages vary in length). Fixed modal height with scroll. Fallback link handles the case where embedding is blocked.
- downstream: Build is single-workstream, strictly sequential. Review focus: iframe sandbox attrs, fallback UX, button visibility logic. Test: manual QA on shipped/unshipped orders in both themes. Ship: standard PR.

## Open Questions

None. Q1 resolved (Option B chosen by user).

## Exit Gate

- [x] Every active R and RI mapped to a phase.
- [x] Every phase has a binary exit gate.
- [x] Verification plan covers every R and RI.
- [ ] User approved or waiver recorded.
