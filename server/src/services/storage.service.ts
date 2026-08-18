import { isR2Enabled, uploadBufferToR2 } from './r2.service'
import { isCloudinaryEnabled, uploadBufferToCloudinary } from './cloudinary.service'

// ---------------------------------------------------------------------------
// Storage provider priority:  R2  →  Cloudinary
// Production requires cloud storage; local fallback removed per RI1
// ---------------------------------------------------------------------------
export type StorageFolder = 'products' | 'invoices'

export type StorageProvider = 'r2' | 'cloudinary' | 'local'

/**
 * Returns the currently active storage provider name.
 * Useful for startup logging and diagnostics.
 */
export function getActiveProvider(): StorageProvider {
  if (isR2Enabled) return 'r2'
  if (isCloudinaryEnabled) return 'cloudinary'
  return 'local'
}

/**
 * Upload a buffer to the best available storage backend.
 * In production, at least one cloud provider must be configured.
 *
 * @returns The public URL
 * @throws If no cloud provider is configured
 */
export async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  folder: StorageFolder = 'products'
): Promise<string> {
  // 1. Cloudflare R2 — primary
  if (isR2Enabled) {
    try {
      return await uploadBufferToR2(buffer, filename, mimetype, folder)
    } catch (err) {
      console.error('[Storage] R2 upload failed:', err)
      throw err
    }
  }

  // 2. Cloudinary — secondary
  if (isCloudinaryEnabled) {
    try {
      return await uploadBufferToCloudinary(buffer, filename, mimetype, folder)
    } catch (err) {
      console.error('[Storage] Cloudinary upload failed:', err)
      throw err
    }
  }

  // No fallback to local storage — must have a cloud provider configured
  throw new Error('No cloud storage provider configured (R2_* or CLOUDINARY_* env vars required)')
}
