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
 * Create ACTIVE stock reservations for an order at order-creation time,
 * after atomically verifying availability.
 *
 * Each product row is locked (`SELECT ... FOR UPDATE`) inside the caller's
 * transaction before availability is checked and the reservation inserted.
 * Every reservation writer takes this same lock before checking, so
 * concurrent reservation attempts for the same product serialize on the
 * lock instead of racing on a plain read — this is what the old atomic
 * `updateMany` decrement guaranteed, reproduced for a write that no longer
 * touches `Product.stock` directly. Throws (rolling back the whole
 * transaction, including order creation) if any item is unavailable.
 *
 * Reservations are stamped with the order's ID at creation — the link is
 * established at birth rather than reconstructed later.
 *
 * @param orderId - UUID of the order being created
 * @param orderItems - array of { productId, quantity }
 * @param userId - UUID of the user placing the order (used as the reservation owner key)
 * @param tx - Prisma transaction (required; order creation must be atomic)
 */
export async function createReservations(
  orderId: string,
  orderItems: Array<{ productId: string; quantity: number }>,
  userId: string,
  tx: Prisma.TransactionClient
) {
  const config = getStoreConfig()
  const expiresAt = new Date(Date.now() + config.inventory.reservationDurationMinutes * 60_000)

  // Processed in productId order — same deadlock-avoidance convention used
  // by convertReservations/restoreStock and by the route this replaces.
  const sorted = [...orderItems].sort((a, b) => a.productId.localeCompare(b.productId))

  for (const item of sorted) {
    const locked = await tx.$queryRaw<Array<{ id: string; name: string; stock: number }>>(
      Prisma.sql`SELECT id, name, stock FROM Product WHERE id = ${item.productId} FOR UPDATE`
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

    await tx.stockReservation.create({
      data: {
        productId: item.productId,
        quantity: item.quantity,
        orderId,
        userId,
        expiresAt,
        status: 'ACTIVE',
      },
    })
  }
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
