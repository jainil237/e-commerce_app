"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../utils/prisma");
const node_cache_1 = __importDefault(require("node-cache"));
const router = (0, express_1.Router)();
const cache = new node_cache_1.default({ stdTTL: 60, checkperiod: 120 });
// Get all categories
router.get('/', async (_req, res, next) => {
    try {
        const cacheKey = 'categories:all';
        const cached = cache.get(cacheKey);
        if (cached) {
            res.json(cached);
            return;
        }
        const categories = await prisma_1.prisma.category.findMany({
            where: { isActive: true },
            include: {
                _count: {
                    select: { products: { where: { isActive: true } } },
                },
            },
            orderBy: { name: 'asc' },
        });
        const response = {
            success: true,
            data: categories.map(c => ({
                ...c,
                productCount: c._count.products,
            })),
        };
        cache.set(cacheKey, response);
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});
// Get products by category slug
router.get('/:slug/products', async (req, res, next) => {
    try {
        const { slug } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        const category = await prisma_1.prisma.category.findUnique({
            where: { slug },
        });
        if (!category || !category.isActive) {
            res.status(404).json({
                success: false,
                message: 'Category not found',
                code: 'CATEGORY_NOT_FOUND',
            });
            return;
        }
        const [products, total] = await Promise.all([
            prisma_1.prisma.product.findMany({
                where: {
                    categoryId: category.id,
                    isActive: true,
                },
                skip,
                take: limit,
                include: {
                    category: { select: { id: true, name: true, slug: true } },
                    images: { orderBy: { sortOrder: 'asc' } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma_1.prisma.product.count({
                where: {
                    categoryId: category.id,
                    isActive: true,
                },
            }),
        ]);
        res.json({
            success: true,
            data: {
                category,
                products: products.map(p => ({
                    ...p,
                    price: p.price.toString(),
                    mrp: p.mrp.toString(),
                    discount: Math.round((1 - Number(p.price) / Number(p.mrp)) * 100),
                })),
            },
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
exports.default = router;
//# sourceMappingURL=category.routes.js.map