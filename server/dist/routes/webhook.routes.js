"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../utils/prisma");
const invoice_service_1 = require("../services/invoice.service");
const email_service_1 = require("../services/email.service");
const router = (0, express_1.Router)();
// Razorpay webhook
router.post('/razorpay', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        // Verify webhook signature
        const expectedSignature = crypto_1.default
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');
        if (signature !== expectedSignature) {
            console.error('Invalid webhook signature');
            res.status(400).json({ success: false, message: 'Invalid signature' });
            return;
        }
        const event = req.body;
        const paymentEntity = event.payload?.payment?.entity;
        if (!paymentEntity) {
            res.json({ success: true });
            return;
        }
        const razorpayOrderId = paymentEntity.order_id;
        const razorpayPaymentId = paymentEntity.id;
        // Find order by Razorpay order ID
        const order = await prisma_1.prisma.order.findFirst({
            where: { razorpayOrderId },
            include: {
                items: { include: { product: true } },
                address: true,
                user: true,
            },
        });
        if (!order) {
            console.error('Order not found for webhook:', razorpayOrderId);
            res.json({ success: true });
            return;
        }
        // Handle different events
        switch (event.event) {
            case 'payment.captured':
                // Check if already processed (idempotency)
                if (order.paymentStatus === 'PAID') {
                    console.log('Order already marked as paid:', order.id);
                    break;
                }
                // Update order
                await prisma_1.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        paymentStatus: 'PAID',
                        status: 'CONFIRMED',
                        razorpayPaymentId,
                    },
                });
                // Deduct stock
                for (const item of order.items) {
                    await prisma_1.prisma.product.update({
                        where: { id: item.productId },
                        data: { stock: { decrement: item.quantity } },
                    });
                }
                if (!order.user) {
                    console.error('Order user not found for webhook:', razorpayOrderId);
                    break;
                }
                const validOrder = order;
                // Generate invoice
                const invoicePath = await (0, invoice_service_1.generateInvoicePdf)(validOrder);
                await prisma_1.prisma.order.update({
                    where: { id: order.id },
                    data: { invoiceUrl: invoicePath },
                });
                // Send email
                await (0, email_service_1.sendOrderConfirmationEmail)(validOrder, invoicePath);
                break;
            case 'payment.failed':
                await prisma_1.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        paymentStatus: 'FAILED',
                        status: 'CANCELLED',
                    },
                });
                break;
            case 'refund.created':
                await prisma_1.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        paymentStatus: 'REFUNDED',
                        status: 'REFUNDED',
                    },
                });
                break;
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false });
    }
});
exports.default = router;
//# sourceMappingURL=webhook.routes.js.map