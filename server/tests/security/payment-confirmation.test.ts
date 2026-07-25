import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/utils/prisma'
import { createAddress, createProduct, createUser, resetDb } from '../helpers/factories'

// confirmPayment()'s non-mock path calls razorpay.payments.fetch() over the
// network — mocked here so R1's amount/status logic can be tested against
// controlled responses without a real Razorpay account. vi.mock is hoisted
// above all imports by vitest's transform, so the static import below
// already resolves against this mock regardless of statement order.
const mockFetch = vi.hoisted(() => vi.fn())

vi.mock('razorpay', () => ({
  default: vi.fn().mockImplementation(() => ({
    payments: { fetch: mockFetch },
  })),
}))

import { confirmPayment, PaymentConfirmationError } from '../../src/services/payment-confirmation.service'

beforeEach(async () => {
  await resetDb()
  mockFetch.mockReset()
})

afterEach(() => {
  delete process.env.PAYMENTS_MOCK
  process.env.PAYMENTS_MOCK = 'true' // restore the suite default (tests/setup.ts)
})

async function createPendingOrder(total: number, razorpayOrderId = `order_${crypto.randomUUID()}`, stock = 5) {
  const user = await createUser()
  const address = await createAddress(user.id)
  const product = await createProduct({ price: total, stock })

  const order = await prisma.order.create({
    data: {
      orderNumber: `ORD-CONF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      addressId: address.id,
      subtotal: total,
      shippingCharge: 0,
      discount: 0,
      gstAmount: 0,
      total,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      razorpayOrderId,
      items: { create: [{ productId: product.id, quantity: 1, unitPrice: total, gstPercent: 18, subtotal: total }] },
    },
  })

  return { user, order, product, razorpayOrderId }
}

describe('confirmPayment — R1 amount/status verification (non-mock)', () => {
  it('confirms when the fetched payment is captured, order-matched, and amount-matched', async () => {
    const { order, razorpayOrderId } = await createPendingOrder(500)
    process.env.PAYMENTS_MOCK = 'false'
    mockFetch.mockResolvedValue({ status: 'captured', order_id: razorpayOrderId, amount: 50000 })

    const result = await confirmPayment({
      orderId: order.id,
      razorpayOrderId,
      razorpayPaymentId: 'pay_ok',
      source: 'client',
      actorUserId: order.userId,
    })

    expect(result.alreadyConfirmed).toBe(false)
    expect(result.order.paymentStatus).toBe('PAID')
    expect(mockFetch).toHaveBeenCalledWith('pay_ok')
  })

  it('rejects when the captured amount does not match the order total', async () => {
    const { order, razorpayOrderId } = await createPendingOrder(500)
    process.env.PAYMENTS_MOCK = 'false'
    mockFetch.mockResolvedValue({ status: 'captured', order_id: razorpayOrderId, amount: 1 }) // 1 paise vs 50000 expected

    await expect(
      confirmPayment({ orderId: order.id, razorpayOrderId, razorpayPaymentId: 'pay_low', source: 'client', actorUserId: order.userId })
    ).rejects.toMatchObject({ code: 'AMOUNT_MISMATCH' })

    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(refreshed.paymentStatus).toBe('PENDING')
  })

  it('rejects when the payment status is not captured', async () => {
    const { order, razorpayOrderId } = await createPendingOrder(500)
    process.env.PAYMENTS_MOCK = 'false'
    mockFetch.mockResolvedValue({ status: 'authorized', order_id: razorpayOrderId, amount: 50000 })

    await expect(
      confirmPayment({ orderId: order.id, razorpayOrderId, razorpayPaymentId: 'pay_uncaptured', source: 'client', actorUserId: order.userId })
    ).rejects.toMatchObject({ code: 'PAYMENT_NOT_CAPTURED' })

    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(refreshed.paymentStatus).toBe('PENDING')
  })

  it('fails closed (order stays PENDING) when the Razorpay fetch itself fails', async () => {
    const { order, razorpayOrderId } = await createPendingOrder(500)
    process.env.PAYMENTS_MOCK = 'false'
    mockFetch.mockRejectedValue(new Error('network error'))

    await expect(
      confirmPayment({ orderId: order.id, razorpayOrderId, razorpayPaymentId: 'pay_unreachable', source: 'client', actorUserId: order.userId })
    ).rejects.toMatchObject({ code: 'PAYMENT_VERIFICATION_UNAVAILABLE' })

    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(refreshed.paymentStatus).toBe('PENDING')
  })
})

describe('confirmPayment — mock mode skips the network check', () => {
  it('confirms without calling the Razorpay fetch', async () => {
    const { order, razorpayOrderId } = await createPendingOrder(500)
    // PAYMENTS_MOCK=true is the suite default (tests/setup.ts)

    const result = await confirmPayment({
      orderId: order.id,
      razorpayOrderId,
      razorpayPaymentId: 'pay_mock',
      source: 'client',
      actorUserId: order.userId,
    })

    expect(result.order.paymentStatus).toBe('PAID')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('confirmPayment — idempotency', () => {
  it('is a no-op on a second call for an already-PAID order, and writes no second audit row', async () => {
    const { order, razorpayOrderId } = await createPendingOrder(500)

    await confirmPayment({ orderId: order.id, razorpayOrderId, razorpayPaymentId: 'pay_first', source: 'client', actorUserId: order.userId })
    const second = await confirmPayment({ orderId: order.id, razorpayOrderId, razorpayPaymentId: 'pay_second', source: 'webhook', actorUserId: null })

    expect(second.alreadyConfirmed).toBe(true)

    const auditRows = await prisma.orderAuditLog.findMany({ where: { orderId: order.id, action: 'PAYMENT_CONFIRMED' } })
    expect(auditRows).toHaveLength(1)
  })
})

describe('R5 — both entry points write equivalent audit rows', () => {
  it('client and webhook confirmations produce the same action/fromState/toState shape', async () => {
    const clientOrder = await createPendingOrder(500)
    const webhookOrder = await createPendingOrder(500)

    await confirmPayment({
      orderId: clientOrder.order.id,
      razorpayOrderId: clientOrder.razorpayOrderId,
      razorpayPaymentId: 'pay_client',
      source: 'client',
      actorUserId: clientOrder.order.userId,
    })
    await confirmPayment({
      orderId: webhookOrder.order.id,
      razorpayOrderId: webhookOrder.razorpayOrderId,
      razorpayPaymentId: 'pay_webhook',
      source: 'webhook',
      actorUserId: null,
    })

    const [clientLog] = await prisma.orderAuditLog.findMany({ where: { orderId: clientOrder.order.id } })
    const [webhookLog] = await prisma.orderAuditLog.findMany({ where: { orderId: webhookOrder.order.id } })

    expect(clientLog.action).toBe(webhookLog.action)
    expect(clientLog.fromState).toBe(webhookLog.fromState)
    expect(clientLog.toState).toBe(webhookLog.toState)
    expect(clientLog.action).toBe('PAYMENT_CONFIRMED')
    expect(clientLog.fromState).toBe('PENDING')
    expect(clientLog.toState).toBe('PAID')

    // The only expected difference: who/what triggered it.
    expect(clientLog.userId).toBe(clientOrder.order.userId)
    expect(webhookLog.userId).toBeNull()
  })
})

describe('R1 — order binding, unit-level', () => {
  it('rejects when razorpayOrderId does not match the order being confirmed', async () => {
    const { order } = await createPendingOrder(500)

    await expect(
      confirmPayment({
        orderId: order.id,
        razorpayOrderId: 'order_does_not_belong_to_this_order',
        razorpayPaymentId: 'pay_x',
        source: 'client',
        actorUserId: order.userId,
      })
    ).rejects.toMatchObject({ code: 'ORDER_MISMATCH' })
  })

  it('client source scopes the order lookup to the acting user (cannot confirm another user\'s order)', async () => {
    const { order, razorpayOrderId } = await createPendingOrder(500)
    const otherUser = await createUser()

    await expect(
      confirmPayment({
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId: 'pay_x',
        source: 'client',
        actorUserId: otherUser.id,
      })
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
  })
})

describe('Phase 4 — re-validate before conversion', () => {
  it('rejects confirmation when a product was deactivated after order creation', async () => {
    const { order, product, razorpayOrderId } = await createPendingOrder(500)
    await prisma.product.update({ where: { id: product.id }, data: { isActive: false } })

    await expect(
      confirmPayment({ orderId: order.id, razorpayOrderId, razorpayPaymentId: 'pay_x', source: 'client', actorUserId: order.userId })
    ).rejects.toMatchObject({ code: 'PRODUCT_DEACTIVATED' })

    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(refreshed.paymentStatus).toBe('PENDING')
  })

  it('rejects confirmation when the reservation expired and current stock cannot cover it', async () => {
    const { order, product, razorpayOrderId } = await createPendingOrder(500, undefined, 1)

    // This order's own reservation expired (lazy expiry: still status ACTIVE,
    // but past expiresAt so it no longer counts for anyone, including itself).
    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        orderId: order.id,
        userId: order.userId,
        quantity: 1,
        expiresAt: new Date(Date.now() - 60_000),
        status: 'ACTIVE',
      },
    })
    // A different, unexpired order now holds the only physical unit. Reuses the
    // same product by pointing a second real order's item at it directly (the
    // FK on StockReservation.orderId requires a real Order row).
    const other = await createPendingOrder(500, undefined, 1)
    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        orderId: other.order.id,
        userId: other.order.userId,
        quantity: 1,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        status: 'ACTIVE',
      },
    })

    await expect(
      confirmPayment({ orderId: order.id, razorpayOrderId, razorpayPaymentId: 'pay_x', source: 'client', actorUserId: order.userId })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK_AT_CONFIRMATION' })

    const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(refreshed.paymentStatus).toBe('PENDING')
  })

  it('still confirms when the reservation expired but current stock covers the order', async () => {
    const { order, product, razorpayOrderId } = await createPendingOrder(500, undefined, 5)

    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        orderId: order.id,
        userId: order.userId,
        quantity: 1,
        expiresAt: new Date(Date.now() - 60_000), // expired
        status: 'ACTIVE',
      },
    })

    const result = await confirmPayment({
      orderId: order.id,
      razorpayOrderId,
      razorpayPaymentId: 'pay_x',
      source: 'client',
      actorUserId: order.userId,
    })

    expect(result.order.paymentStatus).toBe('PAID')
    const refreshedProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(refreshedProduct.stock).toBe(4) // decremented by the ordered quantity
  })
})

// PaymentConfirmationError is exercised via .toMatchObject({ code }) above;
// this just confirms it's the actual error class thrown, not a plain Error
// that happens to have a `code` property.
describe('PaymentConfirmationError', () => {
  it('is an instance of PaymentConfirmationError', async () => {
    const { order } = await createPendingOrder(500)
    await expect(
      confirmPayment({ orderId: order.id, razorpayOrderId: 'wrong', razorpayPaymentId: 'x', source: 'client', actorUserId: order.userId })
    ).rejects.toBeInstanceOf(PaymentConfirmationError)
  })
})
