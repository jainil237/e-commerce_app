"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const prisma_1 = require("../utils/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const config_1 = require("../utils/config");
const image_upload_service_1 = require("../services/image-upload.service");
const email_service_1 = require("../services/email.service");
const storage_service_1 = require("../services/storage.service");
const r2_service_1 = require("../services/r2.service");
const cloudinary_service_1 = require("../services/cloudinary.service");
const router = (0, express_1.Router)();
// All admin routes require authentication and admin role
router.use(auth_middleware_1.authenticate);
router.use(auth_middleware_1.authorizeAdmin);
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
        }
        cb(null, true);
    },
});
// ==================== Dashboard ====================
router.get('/dashboard/summary', async (_req, res, next) => {
    try {
        const [totalRevenue, totalOrders, totalProducts, totalUsers, lowStockProducts] = await Promise.all([
            prisma_1.prisma.order.aggregate({
                where: { paymentStatus: 'PAID' },
                _sum: { total: true },
            }),
            prisma_1.prisma.order.count(),
            prisma_1.prisma.product.count({ where: { isActive: true } }),
            prisma_1.prisma.user.count({ where: { role: 'CUSTOMER' } }),
            prisma_1.prisma.product.count({
                where: { isActive: true, stock: { lt: 10 } },
            }),
        ]);
        res.json({
            success: true,
            data: {
                totalRevenue: totalRevenue._sum.total?.toString() || '0',
                totalOrders,
                totalProducts,
                totalUsers,
                lowStockProducts,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/sales-chart', async (req, res, next) => {
    try {
        const period = req.query.period || 'monthly';
        const now = new Date();
        const orders = await prisma_1.prisma.order.findMany({
            where: {
                paymentStatus: 'PAID',
                createdAt: {
                    gte: period === 'monthly'
                        ? new Date(now.getFullYear(), now.getMonth() - 11, 1)
                        : new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000),
                },
            },
            select: {
                total: true,
                createdAt: true,
            },
        });
        // Group by month or week
        const grouped = {};
        for (const order of orders) {
            const date = new Date(order.createdAt);
            const key = period === 'monthly'
                ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                : `${date.getFullYear()}-W${getWeekNumber(date)}`;
            grouped[key] = (grouped[key] || 0) + Number(order.total);
        }
        const chartData = Object.entries(grouped)
            .map(([period, revenue]) => ({ period, revenue: revenue.toFixed(2) }))
            .sort((a, b) => a.period.localeCompare(b.period));
        res.json({
            success: true,
            data: chartData,
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/dashboard/category-sales', async (_req, res, next) => {
    try {
        const orders = await prisma_1.prisma.order.findMany({
            where: { paymentStatus: 'PAID' },
            include: {
                items: {
                    include: {
                        product: {
                            include: { category: true },
                        },
                    },
                },
            },
        });
        const categoryRevenue = {};
        for (const order of orders) {
            for (const item of order.items) {
                const categoryName = item.product.category.name;
                categoryRevenue[categoryName] = (categoryRevenue[categoryName] || 0) + Number(item.subtotal);
            }
        }
        const chartData = Object.entries(categoryRevenue)
            .map(([category, revenue]) => ({ category, revenue: revenue.toFixed(2) }))
            .sort((a, b) => Number(b.revenue) - Number(a.revenue))
            .slice(0, 10);
        res.json({
            success: true,
            data: chartData,
        });
    }
    catch (error) {
        next(error);
    }
});
// ==================== Products ====================
router.get('/products', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search;
        const category = req.query.category;
        const status = req.query.status;
        const skip = (page - 1) * limit;
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { sku: { contains: search } },
            ];
        }
        if (category) {
            where.categoryId = category;
        }
        if (status === 'active') {
            where.isActive = true;
        }
        else if (status === 'inactive') {
            where.isActive = false;
        }
        const [products, total] = await Promise.all([
            prisma_1.prisma.product.findMany({
                where,
                skip,
                take: limit,
                include: {
                    category: { select: { id: true, name: true } },
                    images: { orderBy: { sortOrder: 'asc' } },
                    _count: { select: { orderItems: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma_1.prisma.product.count({ where }),
        ]);
        res.json({
            success: true,
            data: products.map(p => ({
                ...p,
                price: p.price.toString(),
                mrp: p.mrp.toString(),
            })),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/products/:id', async (req, res, next) => {
    try {
        const product = await prisma_1.prisma.product.findUnique({
            where: { id: req.params.id },
            include: {
                category: true,
                images: { orderBy: { sortOrder: 'asc' } },
            },
        });
        if (!product) {
            throw (0, error_middleware_1.createError)(404, 'Product not found', 'PRODUCT_NOT_FOUND');
        }
        res.json({
            success: true,
            data: {
                ...product,
                price: product.price.toString(),
                mrp: product.mrp.toString(),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/products', upload.array('images', 5), async (req, res, next) => {
    try {
        const data = JSON.parse(req.body.data || '{}');
        const files = req.files;
        const uploadedImages = await (0, image_upload_service_1.uploadProductImages)(files || []);
        const product = await prisma_1.prisma.product.create({
            data: {
                name: data.name,
                slug: data.slug || slugify(data.name),
                description: data.description,
                price: parseFloat(data.price),
                mrp: parseFloat(data.mrp),
                stock: parseInt(data.stock) || 0,
                sku: data.sku,
                categoryId: data.categoryId,
                weight: data.weight ? parseFloat(data.weight) : null,
                tags: data.tags,
                gstPercent: parseFloat(data.gstPercent) || 18,
                isFeatured: data.isFeatured || false,
                isActive: data.isActive !== false,
                images: {
                    create: uploadedImages.map((image, index) => ({
                        url: image.url,
                        altText: data.name,
                        sortOrder: index,
                    })),
                },
            },
            include: { images: true },
        });
        res.status(201).json({
            success: true,
            data: {
                ...product,
                price: product.price.toString(),
                mrp: product.mrp.toString(),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.put('/products/:id', upload.array('images', 5), async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = JSON.parse(req.body.data || '{}');
        const files = req.files;
        const uploadedImages = await (0, image_upload_service_1.uploadProductImages)(files || []);
        const updateData = {
            name: data.name,
            slug: data.slug,
            description: data.description,
            price: parseFloat(data.price),
            mrp: parseFloat(data.mrp),
            stock: parseInt(data.stock),
            sku: data.sku,
            categoryId: data.categoryId,
            weight: data.weight ? parseFloat(data.weight) : null,
            tags: data.tags,
            gstPercent: parseFloat(data.gstPercent) || 18,
            isFeatured: data.isFeatured || false,
            isActive: data.isActive !== false,
        };
        const product = await prisma_1.prisma.product.update({
            where: { id },
            data: updateData,
        });
        // Add new images
        if (uploadedImages.length > 0) {
            const existingCount = await prisma_1.prisma.productImage.count({ where: { productId: id } });
            await prisma_1.prisma.productImage.createMany({
                data: uploadedImages.map((image, index) => ({
                    productId: id,
                    url: image.url,
                    altText: data.name,
                    sortOrder: existingCount + index,
                })),
            });
        }
        res.json({
            success: true,
            data: {
                ...product,
                price: product.price.toString(),
                mrp: product.mrp.toString(),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/products/:id', async (req, res, next) => {
    try {
        await prisma_1.prisma.product.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });
        res.json({ success: true, message: 'Product deactivated' });
    }
    catch (error) {
        next(error);
    }
});
router.patch('/products/:id/toggle', async (req, res, next) => {
    try {
        const product = await prisma_1.prisma.product.findUnique({
            where: { id: req.params.id },
            select: { isActive: true },
        });
        if (!product) {
            throw (0, error_middleware_1.createError)(404, 'Product not found', 'PRODUCT_NOT_FOUND');
        }
        const updated = await prisma_1.prisma.product.update({
            where: { id: req.params.id },
            data: { isActive: !product.isActive },
        });
        res.json({
            success: true,
            data: { isActive: updated.isActive },
        });
    }
    catch (error) {
        next(error);
    }
});
// ==================== Categories ====================
router.get('/categories', async (_req, res, next) => {
    try {
        const categories = await prisma_1.prisma.category.findMany({
            include: {
                _count: { select: { products: true } },
            },
            orderBy: { name: 'asc' },
        });
        res.json({
            success: true,
            data: categories.map(c => ({
                ...c,
                productCount: c._count.products,
            })),
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/categories', async (req, res, next) => {
    try {
        const { name, description, imageUrl } = req.body;
        const category = await prisma_1.prisma.category.create({
            data: {
                name,
                slug: slugify(name),
                description,
                imageUrl,
            },
        });
        res.status(201).json({ success: true, data: category });
    }
    catch (error) {
        next(error);
    }
});
router.put('/categories/:id', async (req, res, next) => {
    try {
        const { name, description, imageUrl, isActive } = req.body;
        const category = await prisma_1.prisma.category.update({
            where: { id: req.params.id },
            data: {
                name,
                slug: name ? slugify(name) : undefined,
                description,
                imageUrl,
                isActive,
            },
        });
        res.json({ success: true, data: category });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/categories/:id', async (req, res, next) => {
    try {
        const productsCount = await prisma_1.prisma.product.count({
            where: { categoryId: req.params.id },
        });
        if (productsCount > 0) {
            throw (0, error_middleware_1.createError)(400, 'Cannot delete category with products', 'CATEGORY_HAS_PRODUCTS');
        }
        await prisma_1.prisma.category.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Category deleted' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== Orders ====================
router.get('/orders', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status;
        const fromDate = req.query.fromDate;
        const toDate = req.query.toDate;
        const search = req.query.search;
        const skip = (page - 1) * limit;
        const where = {};
        if (status) {
            where.status = status;
        }
        if (fromDate || toDate) {
            where.createdAt = {};
            if (fromDate) {
                where.createdAt.gte = new Date(fromDate);
            }
            if (toDate) {
                where.createdAt.lte = new Date(toDate + 'T23:59:59');
            }
        }
        if (search) {
            where.OR = [
                { orderNumber: { contains: search } },
                { user: { name: { contains: search } } },
                { user: { email: { contains: search } } },
            ];
        }
        const [orders, total] = await Promise.all([
            prisma_1.prisma.order.findMany({
                where,
                skip,
                take: limit,
                include: {
                    user: { select: { id: true, name: true, email: true, phone: true } },
                    items: {
                        include: {
                            product: {
                                select: { id: true, name: true, images: { take: 1 } },
                            },
                        },
                    },
                    shipping: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma_1.prisma.order.count({ where }),
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
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/orders/:id', async (req, res, next) => {
    try {
        const order = await prisma_1.prisma.order.findUnique({
            where: { id: req.params.id },
            include: {
                user: true,
                address: true,
                items: {
                    include: {
                        product: {
                            include: { images: true },
                        },
                    },
                },
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
router.patch('/orders/:id/status', async (req, res, next) => {
    try {
        const { status } = req.body;
        const order = await prisma_1.prisma.order.update({
            where: { id: req.params.id },
            data: { status },
            include: {
                user: { select: { name: true, email: true } },
                shipping: true,
            },
        });
        // Send shipping update email when order status changes to SHIPPED or DELIVERED
        if (order.user && order.shipping && ['SHIPPED', 'DELIVERED'].includes(status)) {
            const shipmentStatus = status === 'SHIPPED' ? 'DISPATCHED' : 'DELIVERED';
            if (status === 'DELIVERED') {
                await prisma_1.prisma.shipment.update({
                    where: { orderId: order.id },
                    data: { status: 'DELIVERED', deliveredAt: new Date() },
                });
            }
            (0, email_service_1.sendShippingUpdateEmail)({ id: order.id, orderNumber: order.orderNumber, user: order.user }, {
                status: shipmentStatus,
                courierPartner: order.shipping.courierPartner,
                awbNumber: order.shipping.awbNumber,
                trackingUrl: order.shipping.trackingUrl,
                expectedBy: order.shipping.expectedBy,
            }).catch(err => console.error('Failed to send shipping update email:', err));
        }
        res.json({
            success: true,
            data: { status: order.status },
        });
    }
    catch (error) {
        next(error);
    }
});
// ==================== Shipments ====================
router.get('/shipments', async (req, res, next) => {
    try {
        const status = req.query.status;
        const courier = req.query.courier;
        const where = {};
        if (status) {
            where.status = status;
        }
        if (courier) {
            where.courierPartner = courier;
        }
        const shipments = await prisma_1.prisma.shipment.findMany({
            where,
            include: {
                order: {
                    include: {
                        user: { select: { id: true, name: true, email: true, phone: true } },
                        items: {
                            include: {
                                product: { select: { id: true, name: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json({
            success: true,
            data: shipments.map(s => ({
                ...s,
                trackingUrl: s.awbNumber ? (0, config_1.getTrackingUrl)(s.courierPartner, s.awbNumber) : null,
            })),
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/shipments', async (req, res, next) => {
    try {
        const { orderId, courierPartner } = req.body;
        const config = (0, config_1.getStoreConfig)();
        const shipment = await prisma_1.prisma.shipment.create({
            data: {
                orderId,
                courierPartner: courierPartner || config.courier.defaultPartner,
            },
        });
        res.status(201).json({ success: true, data: shipment });
    }
    catch (error) {
        next(error);
    }
});
router.put('/shipments/:id', async (req, res, next) => {
    try {
        const { courierPartner, awbNumber, status, notes } = req.body;
        const oldShipment = await prisma_1.prisma.shipment.findUnique({
            where: { id: req.params.id },
        });
        const shipment = await prisma_1.prisma.shipment.update({
            where: { id: req.params.id },
            data: {
                courierPartner,
                awbNumber,
                status,
                notes,
                trackingUrl: awbNumber ? (0, config_1.getTrackingUrl)(courierPartner, awbNumber) : undefined,
                ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
            },
            include: {
                order: {
                    include: {
                        user: { select: { name: true, email: true } },
                    },
                },
            },
        });
        // Update order status if shipment delivered
        if (status === 'DELIVERED') {
            await prisma_1.prisma.order.update({
                where: { id: shipment.orderId },
                data: { status: 'DELIVERED' },
            });
        }
        // Send email if status changed
        if (status && oldShipment && status !== oldShipment.status && shipment.order.user) {
            (0, email_service_1.sendShippingUpdateEmail)({ id: shipment.order.id, orderNumber: shipment.order.orderNumber, user: shipment.order.user }, {
                status,
                courierPartner: shipment.courierPartner,
                awbNumber: shipment.awbNumber,
                trackingUrl: shipment.trackingUrl,
                expectedBy: shipment.expectedBy,
            }).catch(err => console.error('Failed to send shipping update email:', err));
        }
        res.json({ success: true, data: shipment });
    }
    catch (error) {
        next(error);
    }
});
router.post('/shipments/:id/mark-dispatched', async (req, res, next) => {
    try {
        const { awbNumber, courierPartner } = req.body;
        const shipment = await prisma_1.prisma.shipment.update({
            where: { id: req.params.id },
            data: {
                status: 'DISPATCHED',
                awbNumber,
                courierPartner,
                dispatchedAt: new Date(),
                trackingUrl: (0, config_1.getTrackingUrl)(courierPartner, awbNumber),
            },
        });
        // Update order status
        const order = await prisma_1.prisma.order.update({
            where: { id: shipment.orderId },
            data: { status: 'SHIPPED' },
            include: {
                user: { select: { name: true, email: true } },
            },
        });
        // Send dispatch notification email
        if (order.user) {
            (0, email_service_1.sendShippingUpdateEmail)({ id: order.id, orderNumber: order.orderNumber, user: order.user }, {
                status: 'DISPATCHED',
                courierPartner,
                awbNumber,
                trackingUrl: (0, config_1.getTrackingUrl)(courierPartner, awbNumber),
            }).catch(err => console.error('Failed to send dispatch email:', err));
        }
        res.json({ success: true, data: shipment });
    }
    catch (error) {
        next(error);
    }
});
// ==================== Users ====================
router.get('/users', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search;
        const skip = (page - 1) * limit;
        const where = { role: 'CUSTOMER' };
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
            ];
        }
        const [users, total] = await Promise.all([
            prisma_1.prisma.user.findMany({
                where,
                skip,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    createdAt: true,
                    _count: { select: { orders: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma_1.prisma.user.count({ where }),
        ]);
        res.json({
            success: true,
            data: users.map(u => ({
                ...u,
                orderCount: u._count.orders,
            })),
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        next(error);
    }
});
router.get('/users/:id', async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true,
                addresses: true,
                orders: {
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        items: {
                            include: {
                                product: { select: { id: true, name: true, images: { take: 1 } } },
                            },
                        },
                    },
                },
                _count: { select: { orders: true } },
            },
        });
        if (!user) {
            throw (0, error_middleware_1.createError)(404, 'User not found', 'USER_NOT_FOUND');
        }
        res.json({
            success: true,
            data: {
                ...user,
                orders: user.orders.map(o => ({
                    ...o,
                    total: o.total.toString(),
                })),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// ==================== Coupons ====================
router.get('/coupons', async (_req, res, next) => {
    try {
        const coupons = await prisma_1.prisma.coupon.findMany();
        res.json({
            success: true,
            data: coupons.map(c => ({
                ...c,
                discountValue: c.discountValue.toString(),
                minOrderValue: c.minOrderValue?.toString() || null,
            })),
        });
    }
    catch (error) {
        next(error);
    }
});
router.post('/coupons', async (req, res, next) => {
    try {
        const { code, discountType, discountValue, minOrderValue, maxUsage, expiresAt } = req.body;
        const coupon = await prisma_1.prisma.coupon.create({
            data: {
                code: code.toUpperCase(),
                discountType,
                discountValue: parseFloat(discountValue),
                minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
                maxUsage,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
            },
        });
        res.status(201).json({
            success: true,
            data: {
                ...coupon,
                discountValue: coupon.discountValue.toString(),
                minOrderValue: coupon.minOrderValue?.toString() || null,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.put('/coupons/:id', async (req, res, next) => {
    try {
        const { code, discountType, discountValue, minOrderValue, maxUsage, expiresAt, isActive } = req.body;
        const coupon = await prisma_1.prisma.coupon.update({
            where: { id: req.params.id },
            data: {
                code: code?.toUpperCase(),
                discountType,
                discountValue: discountValue ? parseFloat(discountValue) : undefined,
                minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
                maxUsage,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                isActive,
            },
        });
        res.json({
            success: true,
            data: {
                ...coupon,
                discountValue: coupon.discountValue.toString(),
                minOrderValue: coupon.minOrderValue?.toString() || null,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/coupons/:id', async (req, res, next) => {
    try {
        await prisma_1.prisma.coupon.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: 'Coupon deleted' });
    }
    catch (error) {
        next(error);
    }
});
// ==================== Storage Diagnostics ====================
router.get('/storage/status', async (_req, res) => {
    const provider = (0, storage_service_1.getActiveProvider)();
    res.json({
        success: true,
        data: {
            activeProvider: provider,
            providers: {
                r2: { enabled: r2_service_1.isR2Enabled, label: 'Cloudflare R2' },
                cloudinary: { enabled: cloudinary_service_1.isCloudinaryEnabled, label: 'Cloudinary' },
                local: { enabled: true, label: 'Local Disk (always available)' },
            },
        },
    });
});
// Helper functions
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return String(Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)).padStart(2, '0');
}
exports.default = router;
//# sourceMappingURL=admin.routes.js.map