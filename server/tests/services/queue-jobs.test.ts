import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../src/utils/prisma'
import { processJob } from '../../src/queues/worker'
import { JOB } from '../../src/queues/jobs'
import { createAddress, createProduct, createUser, resetDb } from '../helpers/factories'

// The email service is the side effect under test — count sends rather than
// actually delivering.
const sendSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../../src/services/email.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/email.service')>()),
  sendOrderConfirmationEmail: sendSpy,
}))

beforeEach(async () => {
  await resetDb()
  sendSpy.mockClear()
})

async function seedPaidOrder() {
  const user = await createUser()
  const address = await createAddress(user.id)
  const product = await createProduct({ stock: 5 })

  return prisma.order.create({
    data: {
      orderNumber: `ORD-TEST-${Date.now()}`,
      userId: user.id,
      addressId: address.id,
      subtotal: 100,
      shippingCharge: 0,
      discount: 0,
      gstAmount: 0,
      total: 100,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      // Pre-set so the handler skips PDF generation and exercises only the
      // email path this test is about.
      invoiceUrl: 'https://example.test/invoice.pdf',
      items: {
        create: [{ productId: product.id, quantity: 1, unitPrice: 100, gstPercent: 0, subtotal: 100 }],
      },
    },
  })
}

const runConfirmation = (orderId: string) =>
  processJob({ name: JOB.ORDER_CONFIRMATION, data: { orderId } } as never)

describe('order-confirmation job idempotency (P2-2)', () => {
  it('sends the confirmation email on first run', async () => {
    const order = await seedPaidOrder()

    await runConfirmation(order.id)

    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('does not re-send when the job is retried after a successful send', async () => {
    const order = await seedPaidOrder()

    // Simulates a worker crash between send and job completion: BullMQ retries
    // a job it never saw complete, so the handler runs a second time.
    await runConfirmation(order.id)
    await runConfirmation(order.id)

    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('records exactly one audit entry marking the send', async () => {
    const order = await seedPaidOrder()

    await runConfirmation(order.id)
    await runConfirmation(order.id)

    const logs = await prisma.orderAuditLog.findMany({
      where: { orderId: order.id, action: 'ORDER_CONFIRMATION_EMAIL_SENT' },
    })
    expect(logs).toHaveLength(1)
  })

  it('does not reuse another order\'s marker', async () => {
    const first = await seedPaidOrder()
    const second = await seedPaidOrder()

    await runConfirmation(first.id)
    await runConfirmation(second.id)

    expect(sendSpy).toHaveBeenCalledTimes(2)
  })
})
