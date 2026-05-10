import { v2 as cloudinary, UploadApiResponse } from 'cloudinary'

// ---------------------------------------------------------------------------
// Cloudinary configuration (lazy — only called when actually needed)
// ---------------------------------------------------------------------------
let configured = false

function ensureConfigured(): void {
  if (configured) return

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is not fully configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    )
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })

  configured = true
}

// ---------------------------------------------------------------------------
// Feature flag — mirrors isR2Enabled from r2.service.ts
// ---------------------------------------------------------------------------
export const isCloudinaryEnabled = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
)

// ---------------------------------------------------------------------------
// Upload a Buffer to Cloudinary
// ---------------------------------------------------------------------------
export const uploadBufferToCloudinary = async (
  buffer: Buffer,
  filename: string,
  mimetype: string,
  folder: 'products' | 'invoices' = 'products'
): Promise<string> => {
  ensureConfigured()

  // Cloudinary folder = "store/<folder>"  (keeps things tidy in the dashboard)
  const cloudFolder = `store/${folder}`

  // Strip extension for public_id — Cloudinary appends format automatically
  const baseName = filename.replace(/\.[^.]+$/, '').replace(/\s+/g, '-')
  const uniqueId = `${Date.now()}-${baseName}`

  const isPdf = mimetype === 'application/pdf'

  return new Promise<string>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: cloudFolder,
        public_id: uniqueId,
        resource_type: isPdf ? 'raw' : 'image',
        // For images: auto-format + auto-quality for best performance
        ...(isPdf
          ? {}
          : {
              transformation: [
                { quality: 'auto', fetch_format: 'auto' },
              ],
            }),
        overwrite: true,
      },
      (error, result?: UploadApiResponse) => {
        if (error) {
          console.error('[Cloudinary] Upload failed:', error.message)
          return reject(error)
        }
        if (!result) {
          return reject(new Error('[Cloudinary] Upload returned no result'))
        }
        // Return the secure URL (HTTPS)
        resolve(result.secure_url)
      }
    )

    uploadStream.end(buffer)
  })
}

// ---------------------------------------------------------------------------
// Cloudinary image URL transformations (server-side helper)
// These generate optimised derivative URLs without re-uploading.
// ---------------------------------------------------------------------------
export function getOptimisedUrl(
  publicUrl: string,
  options: {
    width?: number
    height?: number
    crop?: 'fill' | 'fit' | 'thumb' | 'scale'
    quality?: 'auto' | number
    format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png'
  } = {}
): string {
  // Only transform Cloudinary URLs
  if (!publicUrl.includes('res.cloudinary.com')) {
    return publicUrl
  }

  const { width, height, crop = 'fill', quality = 'auto', format = 'auto' } = options

  // Build transformation string
  const transforms: string[] = [`q_${quality}`, `f_${format}`]
  if (width) transforms.push(`w_${width}`)
  if (height) transforms.push(`h_${height}`)
  if (width || height) transforms.push(`c_${crop}`)

  const transformStr = transforms.join(',')

  // Insert transformation before the version/folder segment
  // Pattern: .../image/upload/v1234/folder/file.ext
  //       → .../image/upload/<transforms>/v1234/folder/file.ext
  return publicUrl.replace(
    /\/(image|raw)\/upload\//,
    `/$1/upload/${transformStr}/`
  )
}

// ---------------------------------------------------------------------------
// Delete an asset from Cloudinary (for cleanup / admin delete product image)
// ---------------------------------------------------------------------------
export async function deleteFromCloudinary(publicUrl: string): Promise<void> {
  ensureConfigured()

  // Extract public_id from the URL
  const match = publicUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/)
  if (!match) return

  const publicId = match[1]
  const isRaw = publicUrl.includes('/raw/upload/')

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: isRaw ? 'raw' : 'image',
    })
  } catch (error) {
    console.error('[Cloudinary] Delete failed:', error)
  }
}
