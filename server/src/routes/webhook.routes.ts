import { Router, Response } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '../utils/prisma'
import { generateInvoicePdf } from '../services/invoice.service'
import { sendOrderConfirmationEmail, sendShippingUpdateEmail } from '../services/email.service'
import { RmaService } from '../services/rma.service'
import { ShipmentStatus } from '@prisma/client'
import { confirmPayment } from '../services/payment-confirmation.service'

const router = Router()

/**
 * Verifies an HMAC-SHA256 webhook signature over a re-serialization of the
 * already-parsed body. Kept for the logistics webhook, which is signed
 * differently and out of this chain's scope (R3 covers Razorpay only).
 * Returns false when the secret is unset so an unconfigured webhook fails closed.
 */
export function verifyWebhookSignature(body: unknown, signature: string | undefined, secret: string | undefined): boolean {
  if (!secret || !signature) return false

  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')

  // timingSafeEqual throws on length mismatch, so guard first
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * R3 (SEC-3): verifies an HMAC-SHA256 signature over the exact raw request
 * bytes, not a re-serialization of anything already parsed — the input
 * Razorpay actually signed. Requires the route to be mounted behind
 * express.raw() so `rawBody` is a Buffer, not a parsed object.
 * Returns false when the secret is unset so an unconfigured webhook fails closed.
 */
export function verifyWebhookSignatureRaw(rawBody: Buffer, signature: string | undefined, secret: string | undefined): boolean {
  if (!secret || !signature) return false

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')

  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Razorpay webhook — mounted behind express.raw() in index.ts for this path only
router.post('/razorpay', async (req, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string
    const rawBody = req.body as Buffer

    if (!verifyWebhookSignatureRaw(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) {
      console.error('Invalid webhook signature')
      res.status(400).json({ success: false, message: 'Invalid signature' })
      return
    }

    const event = JSON.parse(rawBody.toString('utf8'))
    const paymentEntity = event.payload?.payment?.entity

    if (!paymentEntity) {
      res.json({ success: true })
      return
    }

    const razorpayOrderId = paymentEntity.order_id
    const razorpayPaymentId = paymentEntity.id

    // Find order by Razorpay order ID
    const order = await prisma.order.findFirst({
      where: { razorpayOrderId },
      include: {
        items: { include: { product: true } },
        address: true,
        user: true,
      },
    })

    if (!order) {
      console.error('Order not found for webhook:', razorpayOrderId)
      res.json({ success: true })
      return
    }

    // Handle different events
    switch (event.event) {
      case 'payment.captured': {
        // NOTE: Stock was already deducted during order creation.
        // Do NOT deduct again here to prevent double-reduction.
        //
        // confirmPayment() errors are NOT caught here — they propagate to
        // the route's outer catch, which returns 500. That is deliberate:
        // Razorpay retries on a non-2xx response, and a confirmation that
        // couldn't be verified (e.g. a transient failure fetching the
        // payment from Razorpay) must cause a retry, not a silent 200 that
        // leaves the order PENDING forever with Razorpay believing it
        // succeeded. An earlier version of this code caught the error here
        // and still fell through to `res.json({ success: true })` below —
        // exactly the silent-success bug this comment now warns against.
        const result = await confirmPayment({
          orderId: order.id,
          razorpayOrderId,
          razorpayPaymentId,
          source: 'webhook',
          actorUserId: null,
        })

        if (result.alreadyConfirmed) {
          console.log('Order already marked as paid:', order.id)
          break
        }

        const updatedOrder = result.order
        if (!updatedOrder.user) {
          console.error('Order user not found for webhook:', razorpayOrderId)
          break
        }

        const validOrder = updatedOrder as typeof updatedOrder & { user: NonNullable<typeof updatedOrder.user> }

        // Generate invoice
        const invoicePath = await generateInvoicePdf(validOrder as any)
        await prisma.order.update({
          where: { id: order.id },
          data: { invoiceUrl: invoicePath },
        })

        // Send email
        await sendOrderConfirmationEmail(validOrder as any, invoicePath)
        break
      }

      case 'payment.failed': {
        const fromState = order.paymentStatus
        await prisma.$transaction([
          prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'FAILED',
              status: 'CANCELLED',
            },
          }),
          prisma.orderAuditLog.create({
            data: {
              orderId: order.id,
              userId: null,
              action: 'PAYMENT_FAILED',
              fromState,
              toState: 'FAILED',
              metadata: { source: 'webhook' },
            },
          }),
        ])

        // Restore stock since payment failed and order is cancelled
        for (const item of order.items) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          })
        }
        break
      }

      case 'refund.created': {
        const fromState = order.paymentStatus
        await prisma.$transaction([
          prisma.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: 'REFUNDED',
              status: 'REFUNDED',
            },
          }),
          prisma.orderAuditLog.create({
            data: {
              orderId: order.id,
              userId: null,
              action: 'REFUND_ISSUED',
              fromState,
              toState: 'REFUNDED',
              metadata: { source: 'webhook' },
            },
          }),
        ])

        // Restore stock on refund
        for (const item of order.items) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          })
        }
        break
      }
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ success: false })
  }
})

const LogisticsPayloadSchema = z.object({
  shipmentId: z.string().optional(),
  awbNumber: z.string().optional(),
  status: z.nativeEnum(ShipmentStatus),
})

// Logistics webhook
router.post('/logistics', async (req, res: Response) => {
  try {
    const signature = req.headers['x-logistics-signature'] as string

    if (!verifyWebhookSignature(req.body, signature, process.env.LOGISTICS_WEBHOOK_SECRET)) {
      console.error('Invalid logistics webhook signature')
      res.status(400).json({ success: false, message: 'Invalid signature' })
      return
    }

    // Abstract parser since couriers have different formats.
    // Assuming a unified format for this architecture: { shipmentId, awbNumber, status, timestamp, location }
    const parsed = LogisticsPayloadSchema.safeParse(req.body)

    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid payload', errors: parsed.error.flatten() })
      return
    }

    const { shipmentId, awbNumber, status: internalStatus } = parsed.data

    if (!shipmentId && !awbNumber) {
      res.status(400).json({ success: false, message: 'Missing shipmentId or awbNumber' })
      return
    }

    const shipment = await prisma.shipment.findFirst({
      where: shipmentId ? { id: shipmentId } : { awbNumber },
      include: { order: { include: { user: true, items: true, address: true } } }
    })

    if (!shipment) {
      console.error('Shipment not found for webhook:', { shipmentId, awbNumber })
      res.json({ success: true })
      return
    }

    if (shipment.status === internalStatus) {
      res.json({ success: true })
      return
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: internalStatus,
        deliveredAt: internalStatus === 'DELIVERED' ? new Date() : undefined,
      }
    })

    // If forward delivery, update order status
    if (shipment.type === 'FORWARD' && internalStatus === 'DELIVERED') {
      const previousStatus = shipment.order.status

      await prisma.order.update({
        where: { id: shipment.orderId },
        data: { status: 'DELIVERED' }
      })

      await prisma.orderAuditLog.create({
        data: {
          orderId: shipment.orderId,
          action: 'ORDER_DELIVERED',
          fromState: previousStatus,
          toState: 'DELIVERED',
          metadata: { source: 'logistics-webhook', shipmentId: shipment.id },
        },
      })
    }

    // If reverse delivery, handle RMA status and refund.
    // The pickup FK lives on Shipment, so the RMA id is already loaded.
    if (shipment.type === 'REVERSE' && internalStatus === 'DELIVERED' && shipment.rmaPickupId) {
      const rma = await prisma.rMARequest.findUnique({
        where: { id: shipment.rmaPickupId }
      })

      if (rma && rma.status === 'PICKUP_SCHEDULED') {
        // Mark as received. We set restockItems to false here to be safe and require admin to manually restock if needed.
        await RmaService.markReceived(rma.id, null, false)
        
        // Auto-trigger refund if it's a RETURN
        if (rma.type === 'RETURN') {
          try {
            await RmaService.issueRefund(rma.id, null)
          } catch (refundError) {
            console.error(`Auto-refund failed for RMA ${rma.id}:`, refundError)
            // Refund failure should not fail the webhook, admin can retry manually
          }
        }
      }
    }

    // Send shipping update email
    if (shipment.order && shipment.order.user) {
      await sendShippingUpdateEmail(
        {
          id: shipment.order.id,
          orderNumber: shipment.order.orderNumber,
          user: { name: shipment.order.user.name, email: shipment.order.user.email },
        },
        {
          status: internalStatus,
          courierPartner: updatedShipment.courierPartner,
          awbNumber: updatedShipment.awbNumber,
          trackingUrl: updatedShipment.trackingUrl,
          expectedBy: updatedShipment.expectedBy,
        }
      )
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Logistics webhook error:', error)
    res.status(500).json({ success: false })
  }
})

export default router
