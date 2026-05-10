"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveProvider = getActiveProvider;
exports.uploadBuffer = uploadBuffer;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const r2_service_1 = require("./r2.service");
const cloudinary_service_1 = require("./cloudinary.service");
/**
 * Returns the currently active storage provider name.
 * Useful for startup logging and diagnostics.
 */
function getActiveProvider() {
    if (r2_service_1.isR2Enabled)
        return 'r2';
    if (cloudinary_service_1.isCloudinaryEnabled)
        return 'cloudinary';
    return 'local';
}
/**
 * Upload a buffer to the best available storage backend.
 *
 * @returns The public URL (or local file path for the local fallback).
 */
async function uploadBuffer(buffer, filename, mimetype, folder = 'products') {
    // 1. Cloudflare R2 — production priority
    if (r2_service_1.isR2Enabled) {
        try {
            return await (0, r2_service_1.uploadBufferToR2)(buffer, filename, mimetype, folder);
        }
        catch (err) {
            console.error('[Storage] R2 upload failed, falling back:', err);
            // fall through
        }
    }
    // 2. Cloudinary — secondary / demo cloud storage
    if (cloudinary_service_1.isCloudinaryEnabled) {
        try {
            return await (0, cloudinary_service_1.uploadBufferToCloudinary)(buffer, filename, mimetype, folder);
        }
        catch (err) {
            console.error('[Storage] Cloudinary upload failed, falling back to local:', err);
            // fall through
        }
    }
    // 3. Local filesystem — dev fallback
    return uploadToLocal(buffer, filename, folder);
}
// ---------------------------------------------------------------------------
// Local helper (mirrors old logic from image-upload.service.ts)
// ---------------------------------------------------------------------------
async function uploadToLocal(buffer, filename, folder) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeName = filename.replace(/\s+/g, '-');
    const ext = path_1.default.extname(safeName);
    const finalName = `${uniqueSuffix}${ext}`;
    const uploadDir = path_1.default.join(process.cwd(), 'uploads', folder);
    await promises_1.default.mkdir(uploadDir, { recursive: true }).catch(() => { });
    const filePath = path_1.default.join(uploadDir, finalName);
    await promises_1.default.writeFile(filePath, buffer);
    return `/uploads/${folder}/${finalName}`;
}
//# sourceMappingURL=storage.service.js.map