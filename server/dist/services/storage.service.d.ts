export type StorageFolder = 'products' | 'invoices';
export type StorageProvider = 'r2' | 'cloudinary' | 'local';
/**
 * Returns the currently active storage provider name.
 * Useful for startup logging and diagnostics.
 */
export declare function getActiveProvider(): StorageProvider;
/**
 * Upload a buffer to the best available storage backend.
 *
 * @returns The public URL (or local file path for the local fallback).
 */
export declare function uploadBuffer(buffer: Buffer, filename: string, mimetype: string, folder?: StorageFolder): Promise<string>;
//# sourceMappingURL=storage.service.d.ts.map