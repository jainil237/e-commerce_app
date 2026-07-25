import {
  PrismaClient,
  RMARequestStatus,
  RMARequestType,
  ReturnReason,
  RefundMode,
  ShipmentType,
  ShipmentStatus,
  Prisma,
} from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import Razorpay from 'razorpay'
import { isPaymentsMockMode } from '../config/payments'

// ponytail: DEBT — own PrismaClient instead of the `../utils/prisma` singleton, so this
// opens a second connection pool and skips the singleton's `config/env` import and log
// config. Same in rma.controller.ts and admin.rma.controller.ts (4 pools total).
// Fix: swap all three to `import { prisma } from '../utils/prisma'`. Deferred — mechanical
// but touches every query in three files; do it in an isolated commit.
const prisma = new PrismaClient()

// Empty string, not a placeholder-shaped fallback: the SDK client only needs
// a string to construct, and isPaymentsMockMode() below is what actually
// gates whether any of its methods get called.
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
})

interface CreateRmaRequestInput {
  orderId: string
  userId: string
  type: RMARequestType
  reason: ReturnReason
  items: Array<{ orderItemId: string; quantity: number }>
  images: string[]
  customerNote?: string
  refundDetails?: {
    mode: RefundMode
    bankDetails?: string
  }
}

export class RmaService {
  /**
   * Generates a unique RMA number
   */
  private static generateRmaNumber(): string {
    return `RMA-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
  }

  /**
   * Create a new Return or Replacement Request
   */
  static async createRmaRequest(input: CreateRmaRequestInput) {
    return prisma.$transaction(async (tx) => {
      // 1. Validate Order
      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { items: { include: { product: true } } },
      })

      if (!order || order.userId !== input.userId) {
        throw new Error('Order not found or unauthorized')
      }

      if (order.status !== 'DELIVERED') {
        throw new Error('Returns/Replacements can only be requested for DELIVERED orders')
      }

      // 2. Validate Items & Eligibility
      for (const reqItem of input.items) {
        const orderItem = order.items.find((i) => i.id === reqItem.orderItemId)
        if (!orderItem) throw new Error(`Item ${reqItem.orderItemId} not found in order`)
        if (reqItem.quantity > orderItem.quantity) {
          throw new Error('Cannot return more than ordered quantity')
        }

        // Check if product allows return/replace
        if (input.type === 'RETURN' && !orderItem.product.isReturnable) {
          throw new Error(`Product ${orderItem.product.name} is not returnable`)
        }
        if (input.type === 'REPLACEMENT' && !orderItem.product.isReplaceable) {
          throw new Error(`Product ${orderItem.product.name} is not replaceable`)
        }

        // Check return window
        // ponytail: DEBT — returnWindow is measured from order.updatedAt, which any later
        // write to the order bumps. A day-20 admin edit resets a day-1 delivery's 7-day
        // window back to zero, so expired returns get accepted.
        // Fix: read Shipment.deliveredAt (type FORWARD) — the logistics webhook now
        // populates it. Deferred: needs a backfill for orders delivered before that landed,
        // plus a decision on the fallback when deliveredAt is null.
        const deliveredAt = order.updatedAt
        const daysSinceDelivery = Math.floor(
          (Date.now() - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24)
        )
        if (daysSinceDelivery > orderItem.product.returnWindow) {
          throw new Error(`Return window expired for ${orderItem.product.name}`)
        }
      }

      // 3. Create RMA Request
      const rmaRequest = await tx.rMARequest.create({
        data: {
          rmaNumber: this.generateRmaNumber(),
          orderId: input.orderId,
          userId: input.userId,
          type: input.type,
          reason: input.reason,
          customerNote: input.customerNote,
          items: {
            create: input.items.map((i) => ({
              orderItemId: i.orderItemId,
              quantity: i.quantity,
            })),
          },
          images: {
            create: input.images.map((url) => ({ url })),
          },
        },
      })

      // 4. Handle Refund Details if it's a RETURN
      if (input.type === 'RETURN') {
        // Calculate partial refund amount based on items. unitPrice is
        // already GST-inclusive (order.routes.ts stores the charged price
        // directly, with gstAmount always 0 at the order level) — refunding
        // unitPrice + GST on top double-counts GST that was never charged
        // separately. R4 (TD-7): refund exactly what was paid, no more.
        let totalRefund = new Prisma.Decimal(0)
        for (const reqItem of input.items) {
          const orderItem = order.items.find((i) => i.id === reqItem.orderItemId)!
          const unitPrice = orderItem.unitPrice
          const itemTotal = unitPrice.mul(reqItem.quantity)
          totalRefund = totalRefund.add(itemTotal)
        }

        const mode = input.refundDetails?.mode || 'ORIGINAL_PAYMENT_METHOD'
        await tx.refund.create({
          data: {
            rmaRequestId: rmaRequest.id,
            amount: totalRefund,
            mode,
            bankDetails: input.refundDetails?.bankDetails,
          },
        })
      }

      // 5. Audit Log
      await tx.orderAuditLog.create({
        data: {
          orderId: input.orderId,
          userId: input.userId,
          action: 'RMA_REQUEST_CREATED',
          metadata: { rmaId: rmaRequest.id, type: input.type },
        },
      })

      return rmaRequest
    })
  }

  /**
   * Approve an RMA Request
   */
  static async approveRmaRequest(rmaId: string, adminId: string, adminNote?: string) {
    return prisma.$transaction(async (tx) => {
      const rma = await tx.rMARequest.findUnique({
        where: { id: rmaId },
        include: { items: true },
      })

      if (!rma) throw new Error('RMA not found')
      if (rma.status !== 'PENDING') throw new Error('Only PENDING requests can be approved')

      // Update status
      const updated = await tx.rMARequest.update({
        where: { id: rmaId },
        data: { status: 'APPROVED', adminNote },
      })

      // If it's a REPLACEMENT, reserve stock immediately to prevent overselling
      if (rma.type === 'REPLACEMENT') {
        for (const item of rma.items) {
          const orderItem = await tx.orderItem.findUnique({ where: { id: item.orderItemId } })
          if (orderItem) {
            await tx.product.update({
              where: { id: orderItem.productId },
              data: { stock: { decrement: item.quantity } },
            })
          }
        }
      }

      await tx.orderAuditLog.create({
        data: {
          orderId: rma.orderId,
          userId: adminId,
          action: 'RMA_APPROVED',
          metadata: { rmaId },
        },
      })

      return updated
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  /**
   * Reject an RMA Request
   */
  static async rejectRmaRequest(rmaId: string, adminId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.rMARequest.update({
        where: { id: rmaId },
        data: { status: 'REJECTED', adminNote: reason },
      })

      await tx.orderAuditLog.create({
        data: {
          orderId: updated.orderId,
          userId: adminId,
          action: 'RMA_REJECTED',
          metadata: { rmaId, reason },
        },
      })

      return updated
    })
  }

  /**
   * Schedule reverse pickup
   */
  static async schedulePickup(rmaId: string, adminId: string, courierPartner: string, awbNumber: string) {
    return prisma.$transaction(async (tx) => {
      const rma = await tx.rMARequest.findUnique({ where: { id: rmaId } })
      if (!rma) throw new Error('RMA not found')

      // Create a REVERSE shipment
      const shipment = await tx.shipment.create({
        data: {
          orderId: rma.orderId,
          courierPartner,
          awbNumber,
          type: 'REVERSE',
          status: 'PROCESSING',
          rmaPickupId: rmaId,
        },
      })

      const updated = await tx.rMARequest.update({
        where: { id: rmaId },
        data: { status: 'PICKUP_SCHEDULED' },
      })

      await tx.orderAuditLog.create({
        data: {
          orderId: rma.orderId,
          userId: adminId,
          action: 'RMA_PICKUP_SCHEDULED',
          metadata: { rmaId, courierPartner, awbNumber },
        },
      })

      return updated
    })
  }

  /**
   * Mark reverse pickup as received
   */
  static async markReceived(rmaId: string, adminId: string | null, restockItems: boolean) {
    return prisma.$transaction(async (tx) => {
      const rma = await tx.rMARequest.findUnique({
        where: { id: rmaId },
        include: { items: { include: { orderItem: true } } },
      })
      if (!rma) throw new Error('RMA not found')

      const updated = await tx.rMARequest.update({
        where: { id: rmaId },
        data: { status: 'ITEM_RECEIVED' },
      })

      // Restock items if they are in resalable condition
      if (restockItems) {
        for (const item of rma.items) {
          await tx.product.update({
            where: { id: item.orderItem.productId },
            data: { stock: { increment: item.quantity } },
          })
        }
      }

      await tx.orderAuditLog.create({
        data: {
          orderId: rma.orderId,
          userId: adminId,
          action: 'RMA_ITEM_RECEIVED',
          metadata: { rmaId, restockItems },
        },
      })

      return updated
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  /**
   * Initiate Refund
   */
  static async issueRefund(rmaId: string, adminId: string | null, paymentId?: string) {
    return prisma.$transaction(async (tx) => {
      const rma = await tx.rMARequest.findUnique({
        where: { id: rmaId },
        include: { refund: true },
      })
      if (!rma) throw new Error('RMA not found')
      if (!rma.refund) throw new Error('No refund associated with this RMA')

      // Idempotency: a refund is real money, so never issue one twice. Guards against
      // double-clicks, client retries, and webhook replays.
      if (rma.refund.status === 'PAID') throw new Error('Refund has already been issued for this RMA')
      if (rma.status === 'REFUND_COMPLETED') throw new Error('Refund has already been completed for this RMA')
      if (rma.status !== 'ITEM_RECEIVED') {
        throw new Error(`Refund can only be issued after the item is received (current status: ${rma.status})`)
      }

      // Call Razorpay API if ORIGINAL_PAYMENT_METHOD and not mock
      let actualPaymentId = paymentId

      if (rma.refund.mode === 'ORIGINAL_PAYMENT_METHOD') {
        const order = await tx.order.findUnique({ where: { id: rma.orderId } })
        if (order?.razorpayPaymentId) {
          if (!isPaymentsMockMode()) {
            try {
              const refundResponse = await razorpay.payments.refund(order.razorpayPaymentId, {
                amount: Math.round(Number(rma.refund.amount) * 100), // in paise
                notes: {
                  rmaId: rma.id,
                  orderId: rma.orderId
                }
              })
              actualPaymentId = refundResponse.id
            } catch (error: any) {
              throw new Error(`Refund failed: ${error.message}`)
            }
          } else {
            actualPaymentId = paymentId || `rfnd_mock_${Date.now()}`
          }
        }
      }

      await tx.refund.update({
        where: { id: rma.refund.id },
        data: { status: 'PAID', paymentId: actualPaymentId },
      })

      const updated = await tx.rMARequest.update({
        where: { id: rmaId },
        data: { status: 'REFUND_COMPLETED' }, // Alternatively REFUND_INITIATED if async webhook
      })

      await tx.orderAuditLog.create({
        data: {
          orderId: rma.orderId,
          userId: adminId,
          action: 'RMA_REFUND_COMPLETED',
          metadata: { rmaId, amount: rma.refund.amount },
        },
      })

      return updated
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  /**
   * Ship Replacement
   */
  static async shipReplacement(rmaId: string, adminId: string, courierPartner: string, awbNumber: string) {
    return prisma.$transaction(async (tx) => {
      const rma = await tx.rMARequest.findUnique({ where: { id: rmaId } })
      if (!rma) throw new Error('RMA not found')
      if (rma.type !== 'REPLACEMENT') throw new Error('RMA is not a replacement request')

      // Create a REPLACEMENT shipment
      const shipment = await tx.shipment.create({
        data: {
          orderId: rma.orderId,
          courierPartner,
          awbNumber,
          type: 'REPLACEMENT',
          status: 'DISPATCHED',
          rmaReplacementId: rmaId,
          dispatchedAt: new Date(),
        },
      })

      const updated = await tx.rMARequest.update({
        where: { id: rmaId },
        data: { status: 'REPLACEMENT_SHIPPED' },
      })

      await tx.orderAuditLog.create({
        data: {
          orderId: rma.orderId,
          userId: adminId,
          action: 'RMA_REPLACEMENT_SHIPPED',
          metadata: { rmaId, courierPartner, awbNumber },
        },
      })

      return updated
    })
  }
}
