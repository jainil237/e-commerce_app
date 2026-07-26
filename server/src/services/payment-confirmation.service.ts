import Razorpay from 'razorpay'
import { Prisma } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { isPaymentsMockMode } from '../config/payments'
import { convertReservations, getEffectiveAvailability } from './inventory.service'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
})

export class PaymentConfirmationError extends Error {
  code: string
  statusCode: number

  constructor(message: string, code: string, statusCode = 400) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

interface ConfirmPaymentInput {
  orderId: string
  razorpayOrderId: string
  razorpayPaymentId: string
  source: 'client' | 'webhook'
  // The authenticated user for the client entry point (also scopes the order
  // lookup so a customer cannot confirm someone else's order); null for the
  // webhook, which has no user session and is scoped by Razorpay's own
  // signature instead.
  actorUserId: string | null
}

// The single transactional path both `POST /orders/verify-payment` and the
// `payment.captured` webhook confirm through. Previously each did this
// independently and disagreed: only the client route incremented coupon
// usage, and neither wrote an audit row. Both defects are structural once
// there is only one place this logic lives.
export async function confirmPayment(input: ConfirmPaymentInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where:
        input.source === 'client'
          ? { id: input.orderId, userId: input.actorUserId ?? undefined }
          : { id: input.orderId },
      include: {
        items: { include: { product: true } },
        address: true,
        user: true,
      },
    })

    if (!order) {
      throw new PaymentConfirmationError('Order not found', 'ORDER_NOT_FOUND', 404)
    }

    // Idempotency: a webhook replay or a duplicate client confirmation is a
    // no-op success, not an error — this preserves the webhook's existing
    // idempotency behavior and extends it to the client path.
    if (order.paymentStatus === 'PAID') {
      return { order, alreadyConfirmed: true as const }
    }

    // R1, layer 1 (always, offline): the razorpayOrderId being confirmed
    // must be the one this order was actually created with. This alone
    // closes the replay case — a valid signature for order A's Razorpay
    // order can never be used to confirm order B.
    if (order.razorpayOrderId !== input.razorpayOrderId) {
      throw new PaymentConfirmationError('Payment does not match this order', 'ORDER_MISMATCH', 400)
    }

    // R1, layer 2 (non-mock only, network): confirm the payment was actually
    // captured, for this Razorpay order, for the correct amount. A stored
    // amount comparison alone would only prove consistency with a value we
    // wrote ourselves; fetching from Razorpay catches partial capture and
    // out-of-band amount changes that layer 1 cannot see.
    if (!isPaymentsMockMode()) {
      let payment
      try {
        payment = await razorpay.payments.fetch(input.razorpayPaymentId)
      } catch {
        // Fetch failure must not confirm the order — leave it PENDING. The
        // webhook remains the authoritative backstop, so a transient
        // Razorpay outage delays confirmation rather than losing the
        // payment or accepting one that was never verified.
        throw new PaymentConfirmationError(
          'Unable to verify payment with Razorpay',
          'PAYMENT_VERIFICATION_UNAVAILABLE',
          502
        )
      }

      if (payment.status !== 'captured') {
        throw new PaymentConfirmationError('Payment has not been captured', 'PAYMENT_NOT_CAPTURED', 400)
      }
      if (payment.order_id !== order.razorpayOrderId) {
        throw new PaymentConfirmationError('Payment does not match this order', 'ORDER_MISMATCH', 400)
      }
      const expectedAmount = Math.round(Number(order.total) * 100)
      if (Number(payment.amount) !== expectedAmount) {
        throw new PaymentConfirmationError('Captured amount does not match order total', 'AMOUNT_MISMATCH', 400)
      }
    }

    const fromState = order.paymentStatus

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'PAID',
        status: 'CONFIRMED',
        razorpayPaymentId: input.razorpayPaymentId,
      },
      include: {
        items: { include: { product: { include: { images: true } } } },
        address: true,
        user: true,
      },
    })

    // Phase 4: Re-validate before conversion. Fail closed (leave order PENDING) if stock is insufficient.
    // Check 1: Products must still be active (not deactivated post-order-creation)
    const currentProducts = await tx.product.findMany({
      where: { id: { in: order.items.map(i => i.productId) } },
      select: { id: true, isActive: true, stock: true },
    })

    for (const item of order.items) {
      const product = currentProducts.find(p => p.id === item.productId)
      if (!product) {
        throw new PaymentConfirmationError(
          `Product ${item.productId} no longer exists`,
          'PRODUCT_DELETED',
          400
        )
      }
      if (!product.isActive) {
        throw new PaymentConfirmationError(
          'One or more products in this order have been deactivated',
          'PRODUCT_DEACTIVATED',
          400
        )
      }
    }

    // Check 2: Validate stock availability. If reservations expired, check current stock directly.
    // Excludes only this order's own reservation (by orderId), not every reservation the
    // user holds — a user with a second in-flight order on the same product must still have
    // that sibling hold count against this order's availability, or this check could pass
    // while the sibling order is left holding stock that doesn't really exist for both.
    const effectiveAvailability = await getEffectiveAvailability(
      order.items.map(i => i.productId),
      order.userId ?? '',
      tx,
      order.id
    )

    for (const item of order.items) {
      const available = effectiveAvailability[item.productId] ?? 0
      if (available < item.quantity) {
        throw new PaymentConfirmationError(
          `Insufficient stock for one or more items (${item.quantity} requested, ${available} available)`,
          'INSUFFICIENT_STOCK_AT_CONFIRMATION',
          400
        )
      }
    }

    // Convert reservations to decrements: mark them CONVERTED and decrement stock.
    // This is the single point where stock is decremented for a confirmed order.
    await convertReservations(order.id, tx)

    // Coupon usage — inside this transaction now, not a separate write
    // after the fact. This is the structural prerequisite Phase 4's
    // concurrency test depends on: two simultaneous confirmations for the
    // same coupon now serialize through the same transaction instead of
    // racing two independent read-then-write sequences.
    if (order.couponCode) {
      const coupon = await tx.coupon.findUnique({ where: { code: order.couponCode.toUpperCase() } })
      if (coupon) {
        // R4: a conditional update, not a plain increment. Two orders can
        // both pass the maxUsage check at *creation* time (that race is a
        // separate, pre-existing gap outside this chain's scope) and both
        // still be confirmed here — the order's discounted total was
        // already charged either way, so declining to confirm a payment
        // that already happened isn't the right response. What this guard
        // protects is the counter itself: usedCount can never be pushed
        // past maxUsage, so it stays trustworthy for every check after it.
        const usageResult = await tx.coupon.updateMany({
          where: {
            id: coupon.id,
            OR: [{ maxUsage: null }, { usedCount: { lt: coupon.maxUsage ?? 0 } }],
          },
          data: { usedCount: { increment: 1 } },
        })

        if (usageResult.count > 0 && order.userId) {
          if (coupon.perUserLimit) {
            // Same guard shape as the global counter above: conditional
            // increment on the existing row, gated on its own usedCount.
            const perUserUpdate = await tx.couponUsage.updateMany({
              where: { couponId: coupon.id, userId: order.userId, usedCount: { lt: coupon.perUserLimit } },
              data: { usedCount: { increment: 1 } },
            })
            if (perUserUpdate.count === 0) {
              // No row yet (first use), or the row exists and is already at
              // its limit. Attempt to create the first-use row; if a
              // concurrent confirmation created it first, the unique
              // constraint on (couponId, userId) rejects this one — that's
              // correct, not an error to surface, since the limit is what's
              // being protected, not this specific increment.
              try {
                await tx.couponUsage.create({
                  data: { couponId: coupon.id, userId: order.userId, usedCount: 1 },
                })
              } catch (err) {
                if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
                  throw err
                }
              }
            }
          } else {
            await tx.couponUsage.upsert({
              where: { couponId_userId: { couponId: coupon.id, userId: order.userId } },
              create: { couponId: coupon.id, userId: order.userId, usedCount: 1 },
              update: { usedCount: { increment: 1 } },
            })
          }
        }
      }
    }

    await tx.orderAuditLog.create({
      data: {
        orderId: order.id,
        userId: input.actorUserId,
        action: 'PAYMENT_CONFIRMED',
        fromState,
        toState: 'PAID',
        metadata: { source: input.source, razorpayPaymentId: input.razorpayPaymentId },
      },
    })

    return { order: updatedOrder, alreadyConfirmed: false as const }
  })
}
