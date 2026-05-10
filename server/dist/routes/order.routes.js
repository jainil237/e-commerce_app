"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const razorpay_1 = __importDefault(require("razorpay"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../utils/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const config_1 = require("../utils/config");
const error_middleware_1 = require("../middleware/error.middleware");
const invoice_service_1 = require("../services/invoice.service");
const email_service_1 = require("../services/email.service");
const router = (0, express_1.Router)();
const razorpay = new razorpay_1.default({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});
const createOrderSchema = zod_1.z.object({
    items: zod_1.z.array(zod_1.z.object({
        productId: zod_1.z.string().uuid(),
        quantity: zod_1.z.number().int().positive(),
    })).min(1),
    addressId: zod_1.z.string().uuid(),
    couponCode: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
// Create order and Razorpay order
router.post('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const validatedData = createOrderSchema.parse(req.body);
        const config = (0, config_1.getStoreConfig)();
        // Verify address belongs to user
        const address = await prisma_1.prisma.address.findFirst({
            where: {
                id: validatedData.addressId,
                userId: req.user.id,
            },
        });
        if (!address) {
            throw (0, error_middleware_1.createError)(400, 'Invalid address', 'INVALID_ADDRESS');
        }
        // Get products and validate stock
        const productIds = validatedData.items.map(item => item.productId);
        const products = await prisma_1.prisma.product.findMany({
            where: {
                id: { in: productIds },
                isActive: true,
            },
            include: {
                category: true,
            },
        });
        if (products.length !== productIds.length) {
            throw (0, error_middleware_1.createError)(400, 'Some products are unavailable', 'PRODUCTS_UNAVAILABLE');
        }
        // Check stock
        for (const item of validatedData.items) {
            const product = products.find(p => p.id === item.productId);
            if (product.stock < item.quantity) {
                throw (0, error_middleware_1.createError)(400, `Insufficient stock for ${product.name}`, 'INSUFFICIENT_STOCK');
            }
        }
        // Calculate totals
        let subtotal = 0;
        let totalGst = 0;
        const orderItems = [];
        for (const item of validatedData.items) {
            const product = products.find(p => p.id === item.productId);
            const itemSubtotal = Number(product.price) * item.quantity;
            const itemGst = itemSubtotal * (product.gstPercent / 100);
            subtotal += itemSubtotal;
            totalGst += itemGst;
            orderItems.push({
                productId: product.id,
                quantity: item.quantity,
                unitPrice: Number(product.price),
                gstPercent: product.gstPercent,
                subtotal: itemSubtotal,
            });
        }
        // Calculate shipping
        let shippingCharge = config.shipping.baseShippingCharge;
        if (subtotal >= config.shipping.freeShippingAbove) {
            shippingCharge = 0;
        }
        // Apply coupon if provided
        let discount = 0;
        if (validatedData.couponCode) {
            const coupon = await prisma_1.prisma.coupon.findUnique({
                where: { code: validatedData.couponCode },
            });
            if (coupon && coupon.isActive) {
                if (coupon.expiresAt && coupon.expiresAt < new Date()) {
                    throw (0, error_middleware_1.createError)(400, 'Coupon has expired', 'COUPON_EXPIRED');
                }
                if (coupon.maxUsage && coupon.usedCount >= coupon.maxUsage) {
                    throw (0, error_middleware_1.createError)(400, 'Coupon usage limit reached', 'COUPON_LIMIT_REACHED');
                }
                if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue)) {
                    throw (0, error_middleware_1.createError)(400, `Minimum order value ₹${coupon.minOrderValue} required`, 'COUPON_MIN_ORDER');
                }
                if (coupon.discountType === 'PERCENTAGE') {
                    discount = subtotal * (Number(coupon.discountValue) / 100);
                }
                else {
                    discount = Number(coupon.discountValue);
                }
            }
        }
        const total = subtotal + shippingCharge + totalGst - discount;
        // Generate order number
        const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        // Create Razorpay order (or mock if using placeholder keys)
        let razorpayOrder;
        if (process.env.RAZORPAY_KEY_ID === 'rzp_test_placeholder' || process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_placeholder')) {
            razorpayOrder = {
                id: `order_mock_${Date.now()}`,
                amount: Math.round(total * 100),
                currency: config.store.currency,
            };
        }
        else {
            razorpayOrder = await razorpay.orders.create({
                amount: Math.round(total * 100), // in paise
                currency: config.store.currency,
                receipt: orderNumber,
                notes: {
                    userId: req.user.id,
                },
            });
        }
        // Create order in database
        const order = await prisma_1.prisma.order.create({
            data: {
                orderNumber,
                userId: req.user.id,
                addressId: address.id,
                subtotal,
                shippingCharge,
                discount,
                gstAmount: totalGst,
                total,
                status: 'PENDING',
                paymentStatus: 'PENDING',
                razorpayOrderId: razorpayOrder.id,
                couponCode: validatedData.couponCode,
                notes: validatedData.notes,
                items: {
                    create: orderItems,
                },
            },
            include: {
                items: {
                    include: {
                        product: {
                            include: { images: true },
                        },
                    },
                },
                address: true,
            },
        });
        res.status(201).json({
            success: true,
            data: {
                order: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    total: order.total.toString(),
                },
                razorpay: {
                    orderId: razorpayOrder.id,
                    amount: razorpayOrder.amount,
                    currency: razorpayOrder.currency,
                    key: process.env.RAZORPAY_KEY_ID,
                },
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Verify payment
router.post('/verify-payment', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            throw (0, error_middleware_1.createError)(400, 'Missing payment details', 'MISSING_PAYMENT_DETAILS');
        }
        // In mock/dev mode, skip signature verification
        const isMockMode = !process.env.RAZORPAY_KEY_ID ||
            process.env.RAZORPAY_KEY_ID === 'rzp_test_placeholder' ||
            process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_placeholder');
        if (!isMockMode) {
            // Verify Razorpay HMAC signature
            const body = razorpayOrderId + '|' + razorpayPaymentId;
            const expectedSignature = crypto_1.default
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(body)
                .digest('hex');
            if (expectedSignature !== razorpaySignature) {
                throw (0, error_middleware_1.createError)(400, 'Invalid payment signature', 'INVALID_SIGNATURE');
            }
        }
        // Get order
        const order = await prisma_1.prisma.order.findFirst({
            where: {
                id: orderId,
                userId: req.user.id,
            },
            include: {
                items: {
                    include: { product: true },
                },
                address: true,
            },
        });
        if (!order) {
            throw (0, error_middleware_1.createError)(404, 'Order not found', 'ORDER_NOT_FOUND');
        }
        // Update order
        const updatedOrder = await prisma_1.prisma.order.update({
            where: { id: orderId },
            data: {
                paymentStatus: 'PAID',
                status: 'CONFIRMED',
                razorpayPaymentId,
            },
            include: {
                items: {
                    include: {
                        product: {
                            include: { images: true },
                        },
                    },
                },
                address: true,
                user: true,
            },
        });
        // Deduct stock
        for (const item of order.items) {
            await prisma_1.prisma.product.update({
                where: { id: item.productId },
                data: {
                    stock: { decrement: item.quantity },
                },
            });
        }
        // Increment coupon usage
        if (order.couponCode) {
            await prisma_1.prisma.coupon.update({
                where: { code: order.couponCode },
                data: { usedCount: { increment: 1 } },
            });
        }
        if (!updatedOrder.user) {
            throw (0, error_middleware_1.createError)(500, 'User details missing', 'MISSING_USER');
        }
        const orderWithUser = {
            ...updatedOrder,
            user: updatedOrder.user
        };
        // Generate invoice
        const invoicePath = await (0, invoice_service_1.generateInvoicePdf)(orderWithUser);
        // Update invoice URL
        await prisma_1.prisma.order.update({
            where: { id: orderId },
            data: { invoiceUrl: invoicePath },
        });
        // Send confirmation email (non-blocking — don't fail the payment if email fails)
        (0, email_service_1.sendOrderConfirmationEmail)(orderWithUser, invoicePath)
            .catch(err => console.error('[Email] Failed to send order confirmation:', err));
        res.json({
            success: true,
            data: {
                orderId: updatedOrder.id,
                orderNumber: updatedOrder.orderNumber,
                status: updatedOrder.status,
                paymentStatus: updatedOrder.paymentStatus,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Get user's orders
router.get('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const [orders, total] = await Promise.all([
            prisma_1.prisma.order.findMany({
                where: { userId: req.user.id },
                skip,
                take: limit,
                include: {
                    items: {
                        include: {
                            product: {
                                include: { images: { take: 1 } },
                            },
                        },
                    },
                    shipping: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma_1.prisma.order.count({ where: { userId: req.user.id } }),
        ]);
        res.json({
            success: true,
            data: orders.map(o => ({
                ...o,
                subtotal: o.subtotal.toString(),
                shippingCharge: o.shippingCharge.toString(),
                discount: o.discount.toString(),
                gstAmount: o.gstAmount.toString(),
                total: o.total.toString(),
            })),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Get order by ID
router.get('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await prisma_1.prisma.order.findFirst({
            where: {
                id,
                userId: req.user.id,
            },
            include: {
                items: {
                    include: {
                        product: {
                            include: { images: true, category: true },
                        },
                    },
                },
                address: true,
                shipping: true,
            },
        });
        if (!order) {
            throw (0, error_middleware_1.createError)(404, 'Order not found', 'ORDER_NOT_FOUND');
        }
        res.json({
            success: true,
            data: {
                ...order,
                subtotal: order.subtotal.toString(),
                shippingCharge: order.shippingCharge.toString(),
                discount: order.discount.toString(),
                gstAmount: order.gstAmount.toString(),
                total: order.total.toString(),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Download invoice
router.get('/:id/invoice', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await prisma_1.prisma.order.findFirst({
            where: {
                id,
                userId: req.user.id,
            },
            include: {
                items: { include: { product: true } },
                address: true,
                user: true,
            },
        });
        if (!order) {
            throw (0, error_middleware_1.createError)(404, 'Order not found', 'ORDER_NOT_FOUND');
        }
        if (order.paymentStatus !== 'PAID') {
            throw (0, error_middleware_1.createError)(404, 'Invoice not available', 'INVOICE_NOT_FOUND');
        }
        if (!order.user) {
            throw (0, error_middleware_1.createError)(500, 'User details missing', 'MISSING_USER');
        }
        let invoiceUrl = order.invoiceUrl;
        if (!invoiceUrl) {
            invoiceUrl = await (0, invoice_service_1.generateInvoicePdf)(order);
            await prisma_1.prisma.order.update({
                where: { id },
                data: { invoiceUrl },
            });
        }
        if (invoiceUrl.startsWith('http')) {
            return res.redirect(invoiceUrl);
        }
        res.download(invoiceUrl, `invoice-${order.orderNumber}.pdf`);
    }
    catch (error) {
        next(error);
    }
});
// Send invoice over email
router.post('/:id/invoice/email', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await prisma_1.prisma.order.findFirst({
            where: {
                id,
                userId: req.user.id,
            },
            include: {
                items: { include: { product: true } },
                address: true,
                user: true,
            },
        });
        if (!order) {
            throw (0, error_middleware_1.createError)(404, 'Order not found', 'ORDER_NOT_FOUND');
        }
        if (order.paymentStatus !== 'PAID') {
            throw (0, error_middleware_1.createError)(404, 'Invoice not available', 'INVOICE_NOT_FOUND');
        }
        if (!order.user) {
            throw (0, error_middleware_1.createError)(500, 'User details missing', 'MISSING_USER');
        }
        let invoiceUrl = order.invoiceUrl;
        if (!invoiceUrl) {
            invoiceUrl = await (0, invoice_service_1.generateInvoicePdf)(order);
            await prisma_1.prisma.order.update({
                where: { id },
                data: { invoiceUrl },
            });
        }
        await (0, email_service_1.sendInvoiceEmail)(order, invoiceUrl);
        res.json({
            success: true,
            message: `Invoice sent to ${order.user.email}`,
        });
    }
    catch (error) {
        next(error);
    }
});
// Cancel order
router.post('/:id/cancel', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const order = await prisma_1.prisma.order.findFirst({
            where: {
                id,
                userId: req.user.id,
            },
            include: {
                items: true,
                user: { select: { name: true, email: true } },
            },
        });
        if (!order) {
            throw (0, error_middleware_1.createError)(404, 'Order not found', 'ORDER_NOT_FOUND');
        }
        if (!['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status)) {
            throw (0, error_middleware_1.createError)(400, 'Order cannot be cancelled', 'CANNOT_CANCEL');
        }
        // Update order status
        await prisma_1.prisma.order.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });
        // Restore stock
        for (const item of order.items) {
            await prisma_1.prisma.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
            });
        }
        // Send cancellation email
        if (order.user) {
            (0, email_service_1.sendOrderCancelledEmail)(order)
                .catch(err => console.error('Failed to send cancellation email:', err));
        }
        res.json({
            success: true,
            message: 'Order cancelled successfully',
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=order.routes.js.map