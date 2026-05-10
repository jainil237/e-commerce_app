"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../utils/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// All wishlist routes require authentication
router.use(auth_middleware_1.authenticate);
// Get user's wishlist
router.get('/', async (req, res, next) => {
    try {
        const wishlistItems = await prisma_1.prisma.wishlist.findMany({
            where: { userId: req.user.id },
            include: {
                product: {
                    include: {
                        category: { select: { id: true, name: true, slug: true } },
                        images: { orderBy: { sortOrder: 'asc' } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({
            success: true,
            data: wishlistItems
                .filter(item => item.product.isActive)
                .map(item => ({
                ...item.product,
                price: item.product.price.toString(),
                mrp: item.product.mrp.toString(),
                discount: Math.round((1 - Number(item.product.price) / Number(item.product.mrp)) * 100),
                addedAt: item.createdAt,
            })),
        });
    }
    catch (error) {
        next(error);
    }
});
// Add product to wishlist
const addToWishlistSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
});
router.post('/', async (req, res, next) => {
    try {
        const { productId } = addToWishlistSchema.parse(req.body);
        // Verify product exists and is active
        const product = await prisma_1.prisma.product.findFirst({
            where: { id: productId, isActive: true },
        });
        if (!product) {
            res.status(404).json({
                success: false,
                message: 'Product not found',
                code: 'PRODUCT_NOT_FOUND',
            });
            return;
        }
        // Upsert — idempotent add
        await prisma_1.prisma.wishlist.upsert({
            where: {
                userId_productId: {
                    userId: req.user.id,
                    productId,
                },
            },
            create: {
                userId: req.user.id,
                productId,
            },
            update: {}, // Already exists, no-op
        });
        res.status(201).json({
            success: true,
            message: 'Added to wishlist',
        });
    }
    catch (error) {
        next(error);
    }
});
// Remove product from wishlist
router.delete('/:productId', async (req, res, next) => {
    try {
        const { productId } = req.params;
        await prisma_1.prisma.wishlist.deleteMany({
            where: {
                userId: req.user.id,
                productId,
            },
        });
        res.json({
            success: true,
            message: 'Removed from wishlist',
        });
    }
    catch (error) {
        next(error);
    }
});
// Check if product is in wishlist
router.get('/check/:productId', async (req, res, next) => {
    try {
        const { productId } = req.params;
        const exists = await prisma_1.prisma.wishlist.findUnique({
            where: {
                userId_productId: {
                    userId: req.user.id,
                    productId,
                },
            },
        });
        res.json({
            success: true,
            data: { inWishlist: !!exists },
        });
    }
    catch (error) {
        next(error);
    }
});
// Check multiple products (batch check for product cards)
router.post('/check-batch', async (req, res, next) => {
    try {
        const { productIds } = req.body;
        if (!Array.isArray(productIds) || productIds.length === 0) {
            res.json({ success: true, data: {} });
            return;
        }
        const items = await prisma_1.prisma.wishlist.findMany({
            where: {
                userId: req.user.id,
                productId: { in: productIds },
            },
            select: { productId: true },
        });
        const map = {};
        for (const id of productIds) {
            map[id] = items.some(i => i.productId === id);
        }
        res.json({
            success: true,
            data: map,
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=wishlist.routes.js.map