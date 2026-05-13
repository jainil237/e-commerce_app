import fs from 'fs/promises'
import path from 'path'
import { isR2Enabled, uploadBufferToR2 } from './r2.service'
import { isCloudinaryEnabled, uploadBufferToCloudinary } from './cloudinary.service'

// ---------------------------------------------------------------------------
// Storage provider priority:  R2  →  Cloudinary  →  Local disk
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
 *
 * @returns The public URL (or local file path for the local fallback).
 */
export async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  folder: StorageFolder = 'products'
): Promise<string> {
  // 1. Cloudflare R2 — production priority
  if (isR2Enabled) {
    try {
      return await uploadBufferToR2(buffer, filename, mimetype, folder)
    } catch (err) {
      console.error('[Storage] R2 upload failed, falling back:', err)
      // fall through
    }
  }

  // 2. Cloudinary — secondary / demo cloud storage
  if (isCloudinaryEnabled) {
    try {
      return await uploadBufferToCloudinary(buffer, filename, mimetype, folder)
    } catch (err) {
      console.error('[Storage] Cloudinary upload failed, falling back to local:', err)
      // fall through
    }
  }

  // 3. Local filesystem — dev fallback
  return uploadToLocal(buffer, filename, folder)
}

// ---------------------------------------------------------------------------
// Local helper (mirrors old logic from image-upload.service.ts)
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

  // Return a fully-qualified URL so the frontend can load it from any origin.
  // FRONTEND_URL is not used here — we need the *server's* own base URL.
  const serverBase = (process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, '')
  return `${serverBase}/uploads/${folder}/${finalName}`
}
