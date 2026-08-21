import fs from 'fs/promises'
import path from 'path'
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

  // No cloud provider configured. index.ts's startup guard already refuses to
  // boot in production in this state, so reaching here only happens in dev —
  // fall back to local disk rather than breaking every dev workflow that
  // touches uploads (product images, invoice generation).
  if (process.env.NODE_ENV === 'production') {
    throw new Error('No cloud storage provider configured (R2_* or CLOUDINARY_* env vars required)')
  }
  return uploadToLocal(buffer, filename, folder)
}

// ---------------------------------------------------------------------------
// Local dev fallback only — never reached in production (see guard above).
// ---------------------------------------------------------------------------
async function uploadToLocal(
  buffer: Buffer,
  filename: string,
  folder: StorageFolder
): Promise<string> {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
  const safeName = filename.replace(/\s+/g, '-')
  const ext = path.extname(safeName)
  const finalName = `${uniqueSuffix}${ext}`
  const uploadDir = path.join(process.cwd(), 'uploads', folder)

  await fs.mkdir(uploadDir, { recursive: true }).catch(() => {})

  const filePath = path.join(uploadDir, finalName)
  await fs.writeFile(filePath, buffer)

  const serverBase = (process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, '')
  return `${serverBase}/uploads/${folder}/${finalName}`
}
