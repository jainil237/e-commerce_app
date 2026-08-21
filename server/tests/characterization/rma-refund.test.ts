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

describe('TD-7 — GST asymmetry between order pricing and refund calculation (fixed: R4, plan Phase 4)', () => {
  // Was it.fails through Phase 1-3 (see git history); flipped to plain `it`
  // now that rma.service.ts's refund calculation no longer adds GST on top
  // of the already GST-inclusive unitPrice.
  it('a full-item return refunds exactly what was charged, no GST added on top', async () => {
    const unitPrice = 1000
    const gstPercent = 18
    const { refund } = await fullReturnFlow(unitPrice, gstPercent)

    expect(Number(refund.amount)).toBeCloseTo(unitPrice, 2)
  })
})

describe('TiDB compatibility — FOR UPDATE locking prevents write skew (R3/Q5, Phase 1)', () => {
  it('concurrent approveRmaRequest calls on the same RMA result in only one winner', async () => {
    const { user, order, orderItem } = await createDeliveredOrder(1000, 18)
    const admin1 = await createAdmin()
    const admin2 = await createAdmin()

    const rma = await RmaService.createRmaRequest({
      orderId: order.id,
      userId: user.id,
      type: 'RETURN',
      reason: 'DAMAGED',
      items: [{ orderItemId: orderItem.id, quantity: 1 }],
      images: [],
    })

    // Fire two concurrent approveRmaRequest calls
    const results = await Promise.allSettled([
      RmaService.approveRmaRequest(rma.id, admin1.id),
      RmaService.approveRmaRequest(rma.id, admin2.id),
    ])

    // Exactly one must succeed
    const succeeded = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')

    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ status: 'rejected' })
    expect((failed[0] as PromiseRejectedResult).reason?.message).toMatch(/Only PENDING requests can be approved/i)

    // Verify the RMA is in APPROVED status (exactly once)
    const updated = await prisma.rMARequest.findUniqueOrThrow({ where: { id: rma.id } })
    expect(updated.status).toBe('APPROVED')
  })

  it('concurrent markReceived calls on the same RMA are serialized by the lock', async () => {
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

    // Fire two concurrent markReceived calls
    const results = await Promise.allSettled([
      RmaService.markReceived(rma.id, admin.id, false),
      RmaService.markReceived(rma.id, admin.id, false),
    ])

    // Both should succeed (the lock serializes them, no status check to fail)
    const succeeded = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')

    expect(succeeded).toHaveLength(2)
    expect(failed).toHaveLength(0)

    // Verify the RMA is in ITEM_RECEIVED status (idempotent)
    const updated = await prisma.rMARequest.findUniqueOrThrow({ where: { id: rma.id } })
    expect(updated.status).toBe('ITEM_RECEIVED')
  })

  it('concurrent issueRefund calls on the same RMA result in only one winner', async () => {
    const { user, order, orderItem } = await createDeliveredOrder(1000, 18)
    const admin = await createAdmin()

    // Set up RMA and bring it to ITEM_RECEIVED status (ready for refund)
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
    // Do NOT call issueRefund yet — we want to test concurrent issueRefund calls

    const admin1 = await createAdmin()
    const admin2 = await createAdmin()

    // Fire two concurrent issueRefund calls
    const results = await Promise.allSettled([
      RmaService.issueRefund(rma.id, admin1.id),
      RmaService.issueRefund(rma.id, admin2.id),
    ])

    // Exactly one must succeed
    const succeeded = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r) => r.status === 'rejected')

    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect((failed[0] as PromiseRejectedResult).reason?.message).toMatch(/already been issued/i)

    // Verify only one Refund.status = PAID transition occurred
    const refund = await prisma.refund.findUniqueOrThrow({ where: { rmaRequestId: rma.id } })
    expect(refund.status).toBe('PAID')
    expect(refund.paymentId).toBeDefined()

    // Verify the RMA is in REFUND_COMPLETED status (exactly once)
    const updated = await prisma.rMARequest.findUniqueOrThrow({ where: { id: rma.id } })
    expect(updated.status).toBe('REFUND_COMPLETED')
  })
})
