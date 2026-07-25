import { uploadBuffer } from './storage.service'
import { createError } from '../middleware/error.middleware'

export interface UploadedImage {
  url: string
}

/**
 * Multer's fileFilter can only see the client-declared MIME type, which is
 * attacker-controlled. This checks the actual leading bytes, so an HTML or SVG
 * payload sent as `image/png` is rejected before it reaches the storage
 * provider (and, on the local-disk path, before it is served back from /uploads).
 */
const hasImageMagicBytes = (buffer: Buffer): boolean => {
  if (buffer.length < 12) return false

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true

  // WebP: "RIFF" .... "WEBP"
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return true

  return false
}

export const uploadProductImages = async (files: Express.Multer.File[]): Promise<UploadedImage[]> => {
  if (!files || files.length === 0) {
    return []
  }

  for (const file of files) {
    if (!hasImageMagicBytes(file.buffer)) {
      throw createError(400, `${file.originalname} is not a valid JPEG, PNG, or WebP image`, 'INVALID_IMAGE')
    }
  }

  const urls = await Promise.all(
    files.map(async (file) => {
      const url = await uploadBuffer(file.buffer, file.originalname, file.mimetype, 'products')
      return url
    })
  )

  return urls.map(url => ({ url }))
}
