'use client'

// ─── Types ───
export interface InventorySnapshot {
  skuId: string
  sku: string
  availableQty: number
  updatedAt: string
  isActive: boolean
}

interface SnapshotStore {
  snapshots: Record<string, InventorySnapshot>
  fetchedAt: string
}

// ─── Constants ───
const SNAPSHOT_KEY = 'inventorySnapshots'
const DEFAULT_REFRESH_MS = 10 * 60 * 1000 // 10 minutes

function loadStore(): SnapshotStore {
  if (typeof window === 'undefined') return { snapshots: {}, fetchedAt: '' }
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return { snapshots: {}, fetchedAt: '' }
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.snapshots === 'object' && typeof parsed.fetchedAt === 'string') {
      return parsed as SnapshotStore
    }
  } catch {
    localStorage.removeItem(SNAPSHOT_KEY)
  }
  return { snapshots: {}, fetchedAt: '' }
}

function saveStore(store: SnapshotStore) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(store))
}

// ─── Core API ───

/** Check if cached snapshot is stale (older than interval) */
export function isSnapshotStale(intervalMs = DEFAULT_REFRESH_MS): boolean {
  const store = loadStore()
  if (!store.fetchedAt) return true
  const fetched = new Date(store.fetchedAt).getTime()
  return Date.now() - fetched > intervalMs
}

/** Get a single snapshot from localStorage */
export function getSnapshot(productId: string): InventorySnapshot | null {
  const store = loadStore()
  return store.snapshots[productId] || null
}

/** Get all cached snapshots */
export function getAllSnapshots(): Record<string, InventorySnapshot> {
  return loadStore().snapshots
}

/** Set / override a snapshot locally */
export function setSnapshot(snapshot: InventorySnapshot) {
  const store = loadStore()
  store.snapshots[snapshot.skuId] = snapshot
  saveStore(store)
}

/** Remove a snapshot */
export function removeSnapshot(productId: string) {
  const store = loadStore()
  delete store.snapshots[productId]
  saveStore(store)
}

/** Clear all cached snapshots */
export function clearSnapshots(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SNAPSHOT_KEY)
}

/** Force refresh snapshot for a product by clearing cache first */
export async function forceRefreshSnapshot(productId: string): Promise<InventorySnapshot | null> {
  // Clear ALL snapshots to ensure fresh data
  clearSnapshots()

  // Fetch fresh data
  return await refreshSnapshot(productId)
}

// ───────────────────────────────────────────────────────────────────
// CANONICAL INVENTORY VALIDATION
// ───────────────────────────────────────────────────────────────────
//
// Single source of truth formula:
//
//   availableQty = local_snapshot_available_qty
//
// To validate a new absolute cart qty:
//   allowed = (newCartQty <= availableQty)
//
// ───────────────────────────────────────────────────────────────────

/**
 * Validate whether a quantity update is allowed locally.
 *
 * @param productId  - product to check
 * @param newAbsoluteQty - the TOTAL cart qty the user wants to have after the operation
 * @returns validation result
 */
export function validateCartQuantity(
  productId: string,
  newAbsoluteQty: number,
): { valid: boolean; maxAllowed?: number; error?: string } {
  const snap = getSnapshot(productId)

  if (!snap) {
    // No snapshot — allow and let the server be the gatekeeper during checkout
    return { valid: true }
  }
  if (!snap.isActive) {
    return { valid: false, error: 'Product is no longer available' }
  }

  const maxAllowed = snap.availableQty

  if (newAbsoluteQty > maxAllowed) {
    if (maxAllowed <= 0) {
      return {
        valid: false,
        maxAllowed: 0,
        error: 'This product is currently out of stock',
      }
    }
    return {
      valid: false,
      maxAllowed,
      error: `Only ${maxAllowed} items available`,
    }
  }

  return { valid: true, maxAllowed }
}

/** Fetch latest snapshots from backend and cache them */
export async function refreshSnapshots(productIds: string[]): Promise<InventorySnapshot[]> {
  if (productIds.length === 0) return []
  const sessionId = typeof window !== 'undefined' ? localStorage.getItem('cartSessionId') || undefined : undefined
  const res = await fetch('/api/v1/cart/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ productIds, sessionId }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Failed to fetch inventory snapshot')

  const snapshots: InventorySnapshot[] = data.data?.snapshots || []
  const store = loadStore()
  for (const snap of snapshots) {
    store.snapshots[snap.skuId] = snap
  }
  store.fetchedAt = new Date().toISOString()
  saveStore(store)
  return snapshots
}

/** Refresh a single product snapshot */
export async function refreshSnapshot(productId: string): Promise<InventorySnapshot | null> {
  try {
    const snaps = await refreshSnapshots([productId])
    return snaps[0] || null
  } catch (error) {
    throw error
  }
}

/** Auto-refresh if stale; always returns current cached data */
export async function ensureSnapshots(
  productIds: string[],
  intervalMs = DEFAULT_REFRESH_MS
): Promise<Record<string, InventorySnapshot>> {
  const store = loadStore()
  const missing = productIds.filter(id => !store.snapshots[id])
  const stale = isSnapshotStale(intervalMs)

  if (missing.length > 0 || stale) {
    await refreshSnapshots(productIds)
  }
  return loadStore().snapshots
}
