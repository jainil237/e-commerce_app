import { Prisma } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { getStoreConfig } from '../utils/config'
import { createError } from '../middleware/error.middleware'

/**
 * Single owner of all Product.stock mutations and ReservationStatus transitions.
 * All stock arithmetic and reservation state changes route through this service.
 */

/**
 * Compute available stock for a product, accounting for active, unexpired
 * reservations held by other requesters.
 *
 * Lazy expiry: an expired reservation stops counting the instant this query reads it;
 * status is transitioned to EXPIRED opportunistically only when a transaction already
 * has the row in hand (never as a prerequisite for correctness).
 *
 * @param productIds - array of product UUIDs
 * @param requesterKey - `userId` (string) or `sessionId` (string) of the requester, or
 *                       `undefined` to exclude nothing. Read-only display contexts (e.g.
 *                       `/validate-checkout`) pass the requester's key so a shopper's own
 *                       hold doesn't count against their own view of availability. Contexts
 *                       that are about to make a NEW claim on stock — creating a reservation,
 *                       or re-validating one before conversion — must not exclude by requester:
 *                       a different order already held by the same requester is a real,
 *                       outstanding claim on the same physical stock and must count.
 * @param tx - optional Prisma transaction. If provided, queries run inside it.
 * @param excludeOrderId - when set, excludes only this order's own reservation(s) instead
 *                          of applying requesterKey exclusion. Payment confirmation uses this.
 * @returns map of productId -> effective available quantity
 */
export async function getEffectiveAvailability(
  productIds: string[],
  requesterKey: string | undefined,
  tx?: Prisma.TransactionClient,
  excludeOrderId?: string
) {
  const client = tx || prisma

  const products = await client.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, stock: true },
  })

  const reservations = await client.stockReservation.findMany({
    where: {
      productId: { in: productIds },
      status: 'ACTIVE',
      ...(excludeOrderId
        ? { orderId: { not: excludeOrderId } }
        : requesterKey
          ? {
              // Exclude the requester's own active reservations — they should not
              // count against their own availability. A shopper can see their own
              // holds when they look at checkout, but it does not reduce the stock
              // they perceive as available.
              OR: [
                { userId: { not: requesterKey } },
                { userId: null, sessionId: { not: requesterKey } },
              ],
            }
          : {}),
    },
    select: { productId: true, quantity: true, expiresAt: true },
  })

  const now = new Date()
  const result: Record<string, number> = {}

  for (const product of products) {
    const productReservations = reservations.filter((r) => r.productId === product.id)
    const unexpiredHolds = productReservations
      .filter((r) => r.expiresAt > now) // lazy expiry: only count if still in the future
      .reduce((sum, r) => sum + r.quantity, 0)

    result[product.id] = Math.max(0, product.stock - unexpiredHolds)
  }

  return result
}

/**
 * Lock each product row (`SELECT ... FOR UPDATE`) and verify availability,
 * BEFORE anything else in the caller's transaction touches these rows.
 *
 * Order matters: `Order.items` has an FK to `Product`, so inserting an
 * `OrderItem` takes an implicit shared lock on the referenced `Product` row
 * for FK integrity. If that shared lock were taken first and this function's
 * exclusive `FOR UPDATE` came second, two concurrent transactions could each
 * hold the shared lock and then both block trying to upgrade to exclusive —
 * a real MySQL deadlock (error 1213), reproduced under an actual concurrent
 * test run. Taking the exclusive lock FIRST, before any shared lock can be
 * acquired by this same transaction, means only one lock type is ever
 * contested: the loser just queues for the exclusive lock and proceeds
 * cleanly once the winner commits, instead of deadlocking.
 *
 * Throws (rolling back the whole transaction, including order creation) if
 * any item is unavailable.
 *
 * @param orderItems - array of { productId, quantity }
 * @param tx - Prisma transaction (required; must be the transaction order creation runs in)
 */
export async function reserveStock(
  orderItems: Array<{ productId: string; quantity: number }>,
  tx: Prisma.TransactionClient
) {
  // Processed in productId order — same deadlock-avoidance convention used
  // by convertReservations/restoreStock, for the case of multiple distinct
  // products in one order (two transactions locking two products in the
  // same relative order can't form a circular wait).
  const sorted = [...orderItems].sort((a, b) => a.productId.localeCompare(b.productId))

  for (const item of sorted) {
    const locked = await tx.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`SELECT id, name FROM Product WHERE id = ${item.productId} FOR UPDATE`
    )
    const product = locked[0]
    if (!product) {
      throw createError(400, 'Some products are unavailable', 'PRODUCTS_UNAVAILABLE')
    }

    // No exclusion here: this call is admitting a NEW claim on stock, so every
    // existing active reservation must count — including one from a different
    // order already held by this same user. Excluding by userId (as the
    // read-only /validate-checkout path does) would let the same user reserve
    // the same last unit twice across two orders.
    const availability = await getEffectiveAvailability([item.productId], undefined, tx)
    const available = availability[item.productId] ?? 0

    if (available < item.quantity) {
      throw createError(400, `Insufficient stock for ${product.name}`, 'INSUFFICIENT_STOCK')
    }
  }
}

/**
 * Insert ACTIVE stock reservations for an order, stamped with the order's ID
 * at creation — the link is established at birth rather than reconstructed
 * later. Must be called only after `reserveStock` has already locked and
 * validated every item in the same transaction; this function does no
 * locking or checking of its own.
 *
 * @param orderId - UUID of the order being created
 * @param orderItems - array of { productId, quantity }
 * @param userId - UUID of the user placing the order (used as the reservation owner key)
 * @param tx - Prisma transaction (required; must be the same transaction `reserveStock` ran in)
 */
export async function createReservations(
  orderId: string,
  orderItems: Array<{ productId: string; quantity: number }>,
  userId: string,
  tx: Prisma.TransactionClient
) {
  const config = getStoreConfig()
  const expiresAt = new Date(Date.now() + config.inventory.reservationDurationMinutes * 60_000)

  await Promise.all(
    orderItems.map((item) =>
      tx.stockReservation.create({
        data: {
          productId: item.productId,
          quantity: item.quantity,
          orderId,
          userId,
          expiresAt,
          status: 'ACTIVE',
        },
      })
    )
  )
}

/**
 * Convert ACTIVE reservations to CONVERTED status and decrement Product.stock
 * by the reserved quantity. Called at payment confirmation inside the transaction
 * that marks the order PAID.
 *
 * @param orderId - UUID of the order being confirmed
 * @param tx - Prisma transaction (required; must be the same transaction that marks order PAID)
 */
export async function convertReservations(orderId: string, tx: Prisma.TransactionClient) {
  // Fetch all ACTIVE reservations for this order
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, status: 'ACTIVE' },
    include: { product: true },
  })

  if (reservations.length === 0) {
    return // No reservations to convert (edge case, but idempotent)
  }

  // Mark as CONVERTED
  await tx.stockReservation.updateMany({
    where: { orderId, status: 'ACTIVE' },
    data: { status: 'CONVERTED' },
  })

  // Decrement stock. Items must be processed in consistent order to avoid deadlocks.
  const sortedReservations = [...reservations].sort((a, b) =>
    a.productId.localeCompare(b.productId)
  )

  for (const reservation of sortedReservations) {
    await tx.product.update({
      where: { id: reservation.productId },
      data: { stock: { decrement: reservation.quantity } },
    })
  }
}

/**
 * Release ACTIVE reservations without returning stock (they were never decremented).
 * Transition status to RELEASED.
 *
 * @param orderId - UUID of the order whose reservations are being released
 * @param tx - Prisma transaction (optional; if not provided, runs in implicit transaction)
 */
export async function releaseReservations(
  orderId: string,
  tx?: Prisma.TransactionClient
) {
  const client = tx || prisma

  await client.stockReservation.updateMany({
    where: { orderId, status: 'ACTIVE' },
    data: { status: 'RELEASED' },
  })
}

/**
 * Restore stock for CONVERTED reservations of a cancelled order.
 * Idempotent: restoring already-released or already-expired reservations is a no-op.
 *
 * This is the single transactional restore point for all cancellation flows:
 * - order cancellation (cancel unpaid → release; cancel paid → restore)
 * - webhook payment.failed (restore)
 * - webhook refund.created (restore)
 *
 * @param orderId - UUID of the order whose stock is being restored
 * @param tx - Prisma transaction (optional; if not provided, runs in implicit transaction)
 */
export async function restoreStock(
  orderId: string,
  tx?: Prisma.TransactionClient
) {
  const client = tx || prisma

  const reservations = await client.stockReservation.findMany({
    where: { orderId, status: 'CONVERTED' },
    include: { product: true },
  })

  if (reservations.length === 0) {
    return // Nothing to restore (already released, or never converted)
  }

  // Mark as RELEASED (so we do not restore twice)
  await client.stockReservation.updateMany({
    where: { orderId, status: 'CONVERTED' },
    data: { status: 'RELEASED' },
  })

  // Increment stock. Items processed in consistent order to avoid deadlocks.
  const sortedReservations = [...reservations].sort((a, b) =>
    a.productId.localeCompare(b.productId)
  )

  for (const reservation of sortedReservations) {
    await client.product.update({
      where: { id: reservation.productId },
      data: { stock: { increment: reservation.quantity } },
    })
  }
}

/**
 * Mark ACTIVE reservations whose hold has lapsed as EXPIRED.
 *
 * This is cleanup, not correctness. Availability already ignores lapsed
 * reservations at read time (`getEffectiveAvailability` filters on
 * `expiresAt > now`), so an unswept row never oversells — it just accumulates.
 * Without this the table grows without bound, since nothing else ever
 * transitions an abandoned-checkout reservation out of ACTIVE.
 *
 * Deliberately does NOT touch Product.stock: an ACTIVE reservation is a soft
 * hold that was never decremented from stock in the first place (that happens
 * at conversion). Incrementing here would invent inventory.
 *
 * Safe to run at any cadence, including not at all for a while — which matters
 * because the worker is idle-spun-down on Render's free tier.
 *
 * @returns number of reservations marked EXPIRED
 */
export async function sweepExpiredReservations(): Promise<number> {
  const result = await prisma.stockReservation.updateMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  })

  if (result.count > 0) {
    console.log(`[Inventory] swept ${result.count} expired reservation(s)`)
  }

  return result.count
}
