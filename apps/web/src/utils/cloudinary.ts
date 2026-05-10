/**
 * Cloudinary URL helper for the frontend.
 *
 * When images are served from Cloudinary, this utility generates on-the-fly
 * transformation URLs for responsive images, thumbnails, and optimised
 * delivery — without needing the Cloudinary JS SDK on the client.
 *
 * For non-Cloudinary URLs (R2 or local), the original URL is returned as-is.
 */

interface CloudinaryTransformOptions {
  /** Target width in pixels */
  width?: number
  /** Target height in pixels */
  height?: number
  /** Crop mode */
  crop?: 'fill' | 'fit' | 'thumb' | 'scale' | 'limit' | 'pad'
  /** Image quality — 'auto' lets Cloudinary decide optimally */
  quality?: 'auto' | 'auto:low' | 'auto:eco' | 'auto:good' | 'auto:best' | number
  /** Output format — 'auto' serves WebP/AVIF based on browser support */
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png'
  /** Gravity for crop (where to focus) */
  gravity?: 'auto' | 'face' | 'center' | 'north' | 'south' | 'east' | 'west'
  /** Device pixel ratio */
  dpr?: 'auto' | number
  /** Aspect ratio (e.g. "16:9", "1:1") */
  aspectRatio?: string
}

/**
 * Checks whether a URL points to a Cloudinary-hosted asset.
 */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.includes('res.cloudinary.com')
}

/**
 * Build an optimised Cloudinary delivery URL with transformations.
 *
 * @example
 * ```ts
 * // Basic responsive image
 * cloudinaryUrl(product.images[0].url, { width: 600, quality: 'auto', format: 'auto' })
 *
 * // Thumbnail
 * cloudinaryUrl(url, { width: 100, height: 100, crop: 'thumb', gravity: 'auto' })
 * ```
 */
export function cloudinaryUrl(
  url: string | null | undefined,
  options: CloudinaryTransformOptions = {}
): string {
  if (!url) return ''

  // Only transform Cloudinary URLs
  if (!isCloudinaryUrl(url)) return url

  const {
    width,
    height,
    crop = 'fill',
    quality = 'auto',
    format = 'auto',
    gravity,
    dpr,
    aspectRatio,
  } = options

  const parts: string[] = []

  // Quality and format always applied for best performance
  parts.push(`q_${quality}`)
  parts.push(`f_${format}`)

  if (width) parts.push(`w_${width}`)
  if (height) parts.push(`h_${height}`)
  if (width || height) parts.push(`c_${crop}`)
  if (gravity) parts.push(`g_${gravity}`)
  if (dpr) parts.push(`dpr_${dpr}`)
  if (aspectRatio) parts.push(`ar_${aspectRatio}`)

  const transformStr = parts.join(',')

  // Insert transforms into the URL:
  // .../image/upload/v1234/folder/file → .../image/upload/transforms/v1234/folder/file
  return url.replace(
    /\/(image|raw)\/upload\//,
    `/$1/upload/${transformStr}/`
  )
}

/**
 * Generate srcSet string for responsive Cloudinary images.
 *
 * @example
 * ```tsx
 * <img
 *   src={cloudinaryUrl(url, { width: 800 })}
 *   srcSet={cloudinarySrcSet(url, [400, 800, 1200])}
 *   sizes="(max-width: 768px) 100vw, 50vw"
 * />
 * ```
 */
export function cloudinarySrcSet(
  url: string | null | undefined,
  widths: number[] = [400, 800, 1200, 1600],
  options: Omit<CloudinaryTransformOptions, 'width'> = {}
): string {
  if (!url || !isCloudinaryUrl(url)) return ''

  return widths
    .map((w) => `${cloudinaryUrl(url, { ...options, width: w })} ${w}w`)
    .join(', ')
}

/**
 * Convenience: get a blurred placeholder URL (for LQIP / blur-up loading).
 * Returns a tiny 20px-wide blurred image perfect for Next.js `blurDataURL`.
 */
export function cloudinaryBlurPlaceholder(url: string | null | undefined): string {
  if (!url || !isCloudinaryUrl(url)) return ''

  return cloudinaryUrl(url, {
    width: 20,
    quality: 'auto:low',
    format: 'webp',
    crop: 'scale',
  })
}
