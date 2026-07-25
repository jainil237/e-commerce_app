import { beforeEach, describe, expect, it } from 'vitest'
import { RmaService } from '../../src/services/rma.service'
import { prisma } from '../../src/utils/prisma'
import { createAddress, createProduct, createUser, resetDb } from '../helpers/factories'

// OrderAuditLog.userId is a real FK to User — every admin action below needs
// an actual persisted admin user, not a placeholder string.
async function createAdmin() {
  return createUser({ role: 'ADMIN' })
}

beforeEach(async () => {
  await resetDb()
})

// Builds a DELIVERED, PAID order directly via Prisma (bypassing the HTTP
// order-creation flow, which is exercised elsewhere) so the RMA flow has a
// realistic order to act on. unitPrice/gstPercent mirror what order.routes.ts
// stores at creation time.
async function createDeliveredOrder(unitPrice: number, gstPercent: number, quantity = 1) {
  const user = await createUser()
  const address = await createAddress(user.id)
  const product = await createProduct({ price: unitPrice, gstPercent })

  const order = await prisma.order.create({
    data: {
      orderNumber: `ORD-TEST-${Date.now()}`,
      userId: user.id,
      addressId: address.id,
      subtotal: unitPrice * quantity,
      shippingCharge: 0,
      discount: 0,
      gstAmount: 0, // GST-inclusive design — see order.routes.ts:92
      total: unitPrice * quantity,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      razorpayPaymentId: 'pay_test_delivered',
      items: {
        create: [{ productId: product.id, quantity, unitPrice, gstPercent, subtotal: unitPrice * quantity }],
      },
    },
    include: { items: true },
  })

  return { user, order, orderItem: order.items[0] }
}

async function fullReturnFlow(unitPrice: number, gstPercent: number) {
  const { user, order, orderItem } = await createDeliveredOrder(unitPrice, gstPercent)
  const admin = await createAdmin()

  const rma = await RmaService.createRmaRequest({
    orderId: order.id,
    userId: user.id,
    type: 'RETURN',
    reason: 'DAMAGED',
    items: [{ orderItemId: orderItem.id, quantity: 1 }],
    images: [],
  })

  await RmaService.approveRmaRequest(rma.id, admin.id)
  await RmaService.markReceived(rma.id, admin.id, false)
  const completed = await RmaService.issueRefund(rma.id, admin.id)

  const refund = await prisma.refund.findUniqueOrThrow({ where: { rmaRequestId: rma.id } })
  return { user, order, rma, completed, refund }
}

describe('RMA refund — happy path', () => {
  it('takes a return from request through refund completion', async () => {
    const { completed, refund } = await fullReturnFlow(1000, 18)

    expect(completed.status).toBe('REFUND_COMPLETED')
    expect(refund.status).toBe('PAID')
  })

  it('writes an OrderAuditLog row for every RMA state transition', async () => {
    const { order } = await fullReturnFlow(1000, 18)

    const actions = (await prisma.orderAuditLog.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } })).map(
      (log) => log.action
    )

    expect(actions).toEqual([
      'RMA_REQUEST_CREATED',
      'RMA_APPROVED',
      'RMA_ITEM_RECEIVED',
      'RMA_REFUND_COMPLETED',
    ])
  })
})

describe('RMA refund — idempotency and state guards', () => {
  it('rejects issuing a refund twice for the same RMA', async () => {
    const { rma } = await fullReturnFlow(1000, 18)
    const admin = await createAdmin()

    await expect(RmaService.issueRefund(rma.id, admin.id)).rejects.toThrow(/already been issued/i)
  })

  it('rejects issuing a refund before the item is received', async () => {
    const { user, order, orderItem } = await createDeliveredOrder(1000, 18)
    const admin = await createAdmin()
    const rma = await RmaService.createRmaRequest({
      orderId: order.id,
      userId: user.id,
      type: 'RETURN',
      reason: 'DAMAGED',
      items: [{ orderItemId: orderItem.id, quantity: 1 }],
      images: [],
    })
    await RmaService.approveRmaRequest(rma.id, admin.id)

    await expect(RmaService.issueRefund(rma.id, admin.id)).rejects.toThrow(/can only be issued after the item is received/i)
  })
})

describe('TD-7 — GST asymmetry between order pricing and refund calculation', () => {
  // Documents today's actual bug: orders store GST-inclusive unit prices
  // (order.routes.ts:92, `const totalGst = 0 // GST is now inclusive`), but
  // the refund calculation in rma.service.ts adds GST on top of that
  // already-inclusive unitPrice. Every return over-refunds by one GST
  // percentage on top of what was actually charged.
  it('today: a full-item return refunds more than the customer was charged', async () => {
    const unitPrice = 1000
    const gstPercent = 18
    const { refund } = await fullReturnFlow(unitPrice, gstPercent)

    // What was actually charged for this order (GST-inclusive design).
    const charged = unitPrice
    // What rma.service.ts currently computes: unitPrice + GST on top of it.
    const currentlyRefunded = unitPrice + (unitPrice * gstPercent) / 100

    expect(Number(refund.amount)).toBeCloseTo(currentlyRefunded, 2)
    expect(Number(refund.amount)).toBeGreaterThan(charged) // over-refund, characterized
  })

  // Describes the FIXED state (plan Phase 4 / R4): a full-order refund must
  // equal exactly what was charged, since prices are GST-inclusive. Forward-
  // only per brief A2 — this does not retro-adjust existing Refund rows.
  // Expected to fail until Phase 4 lands.
  it.fails('R4: a full-item return refunds exactly what was charged, no GST added on top', async () => {
    const unitPrice = 1000
    const gstPercent = 18
    const { refund } = await fullReturnFlow(unitPrice, gstPercent)

    expect(Number(refund.amount)).toBeCloseTo(unitPrice, 2)
  })
})
