"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../utils/prisma");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const validateCouponSchema = zod_1.z.object({
    code: zod_1.z.string().min(1),
    orderValue: zod_1.z.number().positive(),
});
// Validate coupon
router.post('/validate', async (req, res, next) => {
    try {
        const validatedData = validateCouponSchema.parse(req.body);
        const coupon = await prisma_1.prisma.coupon.findUnique({
            where: { code: validatedData.code.toUpperCase() },
        });
        if (!coupon || !coupon.isActive) {
            throw (0, error_middleware_1.createError)(400, 'Invalid coupon code', 'INVALID_COUPON');
        }
        // Check expiry
        if (coupon.expiresAt && coupon.expiresAt < new Date()) {
            throw (0, error_middleware_1.createError)(400, 'Coupon has expired', 'COUPON_EXPIRED');
        }
        // Check usage limit
        if (coupon.maxUsage && coupon.usedCount >= coupon.maxUsage) {
            throw (0, error_middleware_1.createError)(400, 'Coupon usage limit reached', 'COUPON_LIMIT_REACHED');
        }
        // Check minimum order value
        if (coupon.minOrderValue && validatedData.orderValue < Number(coupon.minOrderValue)) {
            throw (0, error_middleware_1.createError)(400, `Minimum order value ₹${coupon.minOrderValue} required`, 'COUPON_MIN_ORDER');
        }
        // Calculate discount
        let discount;
        if (coupon.discountType === 'PERCENTAGE') {
            discount = validatedData.orderValue * (Number(coupon.discountValue) / 100);
        }
        else {
            discount = Number(coupon.discountValue);
        }
        res.json({
            success: true,
            data: {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue.toString(),
                calculatedDiscount: discount.toFixed(2),
                minOrderValue: coupon.minOrderValue?.toString() || null,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=coupon.routes.js.map