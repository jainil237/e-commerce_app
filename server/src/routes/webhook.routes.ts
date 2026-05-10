import { Router, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '../utils/prisma'
import { generateInvoicePdf } from '../services/invoice.service'
import { sendOrderConfirmationEmail } from '../services/email.service'

const router = Router()

// Razorpay webhook
router.post('/razorpay', async (req, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex')

    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature')
      res.status(400).json({ success: false, message: 'Invalid signature' })
      return
    }

    const event = req.body
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
      case 'payment.captured':
        // Check if already processed (idempotency)
        if (order.paymentStatus === 'PAID') {
          console.log('Order already marked as paid:', order.id)
          break
        }

        // Update order
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PAID',
            status: 'CONFIRMED',
            razorpayPaymentId,
          },
        })

        // Deduct stock
        for (const item of order.items) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          })
        }

        if (!order.user) {
          console.error('Order user not found for webhook:', razorpayOrderId)
          break
        }

        const validOrder = order as typeof order & { user: NonNullable<typeof order.user> }

        // Generate invoice
        const invoicePath = await generateInvoicePdf(validOrder as any)
        await prisma.order.update({
          where: { id: order.id },
          data: { invoiceUrl: invoicePath },
        })

        // Send email
        await sendOrderConfirmationEmail(validOrder as any, invoicePath)
        break

      case 'payment.failed':
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'FAILED',
            status: 'CANCELLED',
          },
        })
        break

      case 'refund.created':
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'REFUNDED',
            status: 'REFUNDED',
          },
        })
        break
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ success: false })
  }
})

export default router
