"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../utils/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const error_middleware_1 = require("../middleware/error.middleware");
const router = (0, express_1.Router)();
const addressSchema = zod_1.z.object({
    label: zod_1.z.string().default('Home'),
    line1: zod_1.z.string().min(5, 'Address line 1 is required'),
    line2: zod_1.z.string().optional(),
    city: zod_1.z.string().min(2, 'City is required'),
    state: zod_1.z.string().min(2, 'State is required'),
    pincode: zod_1.z.string().regex(/^[1-9][0-9]{5}$/, 'Invalid pincode'),
    isDefault: zod_1.z.boolean().optional(),
});
// Get all addresses
router.get('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const addresses = await prisma_1.prisma.address.findMany({
            where: { userId: req.user.id },
            orderBy: { isDefault: 'desc' },
        });
        res.json({
            success: true,
            data: addresses,
        });
    }
    catch (error) {
        next(error);
    }
});
// Create address
router.post('/', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const validatedData = addressSchema.parse(req.body);
        // If setting as default, unset other defaults
        if (validatedData.isDefault) {
            await prisma_1.prisma.address.updateMany({
                where: { userId: req.user.id, isDefault: true },
                data: { isDefault: false },
            });
        }
        const address = await prisma_1.prisma.address.create({
            data: {
                userId: req.user.id,
                label: validatedData.label,
                line1: validatedData.line1,
                line2: validatedData.line2,
                city: validatedData.city,
                state: validatedData.state,
                pincode: validatedData.pincode,
                isDefault: validatedData.isDefault ?? false,
            },
        });
        res.status(201).json({
            success: true,
            data: address,
        });
    }
    catch (error) {
        next(error);
    }
});
// Update address
router.put('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const validatedData = addressSchema.partial().parse(req.body);
        // Verify ownership
        const existingAddress = await prisma_1.prisma.address.findFirst({
            where: { id, userId: req.user.id },
        });
        if (!existingAddress) {
            throw (0, error_middleware_1.createError)(404, 'Address not found', 'ADDRESS_NOT_FOUND');
        }
        // If setting as default, unset other defaults
        if (validatedData.isDefault) {
            await prisma_1.prisma.address.updateMany({
                where: { userId: req.user.id, isDefault: true },
                data: { isDefault: false },
            });
        }
        const address = await prisma_1.prisma.address.update({
            where: { id },
            data: validatedData,
        });
        res.json({
            success: true,
            data: address,
        });
    }
    catch (error) {
        next(error);
    }
});
// Delete address
router.delete('/:id', auth_middleware_1.authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        // Verify ownership
        const address = await prisma_1.prisma.address.findFirst({
            where: { id, userId: req.user.id },
        });
        if (!address) {
            throw (0, error_middleware_1.createError)(404, 'Address not found', 'ADDRESS_NOT_FOUND');
        }
        await prisma_1.prisma.address.delete({ where: { id } });
        res.json({
            success: true,
            message: 'Address deleted successfully',
        });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
//# sourceMappingURL=address.routes.js.map