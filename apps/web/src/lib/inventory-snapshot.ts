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

/** Clear all snapshots */
export function clearSnapshots() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SNAPSHOT_KEY)
}

/** Validate requested quantity against cached snapshot */
export function validateAgainstSnapshot(
  productId: string,
  requestedQty: number
): { valid: boolean; availableQty?: number; error?: string } {
  const snap = getSnapshot(productId)
  if (!snap) {
    return { valid: false, error: 'No inventory snapshot available' }
  }
  if (!snap.isActive) {
    return { valid: false, error: 'Product is no longer available' }
  }
  if (snap.availableQty < requestedQty) {
    return {
      valid: false,
      availableQty: snap.availableQty,
      error: `Only ${snap.availableQty} items available`,
    }
  }
  return { valid: true, availableQty: snap.availableQty }
}

/** Fetch latest snapshots from backend and cache them */
export async function refreshSnapshots(productIds: string[]): Promise<InventorySnapshot[]> {
  if (productIds.length === 0) return []
  const res = await fetch('/api/v1/cart/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds }),
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
  const snaps = await refreshSnapshots([productId])
  return snaps[0] || null
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
