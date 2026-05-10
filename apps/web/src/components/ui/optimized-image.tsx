'use client'

import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'
import { getFirstLetter } from '@/utils/initials'
import { isCloudinaryUrl, cloudinaryUrl, cloudinarySrcSet } from '@/utils/cloudinary'

type OptimizedImageProps = Omit<ImageProps, 'src' | 'alt'> & {
  src?: string | null
  alt: string
  /** If set, generate responsive Cloudinary transformations at these widths */
  responsiveWidths?: number[]
  /** Override Cloudinary transformation options */
  cloudinaryWidth?: number
  cloudinaryHeight?: number
  cloudinaryCrop?: 'fill' | 'fit' | 'thumb' | 'scale' | 'limit'
}

/**
 * Drop-in replacement for FallbackImage that adds automatic Cloudinary
 * optimisation when the image URL is a Cloudinary URL.
 *
 * - Non-Cloudinary URLs (R2, local) pass through untouched.
 * - Cloudinary URLs get `f_auto`, `q_auto`, and optional size transforms.
 * - Falls back to an initial-letter placeholder on error or missing src.
 */
export function OptimizedImage({
  src,
  alt,
  className,
  responsiveWidths,
  cloudinaryWidth,
  cloudinaryHeight,
  cloudinaryCrop = 'fill',
  ...props
}: OptimizedImageProps) {
  const [hasError, setHasError] = useState(false)
  const shouldShowFallback = hasError || !src

  if (shouldShowFallback) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 ${className || ''}`}>
        <span className="font-bold text-slate-500" style={{ fontSize: 'inherit' }}>
          {getFirstLetter(alt)}
        </span>
      </div>
    )
  }

  // Apply Cloudinary transforms if applicable
  const isCloudinary = isCloudinaryUrl(src)
  const optimisedSrc = isCloudinary
    ? cloudinaryUrl(src, {
        width: cloudinaryWidth,
        height: cloudinaryHeight,
        crop: cloudinaryCrop,
        quality: 'auto',
        format: 'auto',
      })
    : src

  // Build extra props for Cloudinary responsive images
  const extraProps: Record<string, string> = {}
  if (isCloudinary && responsiveWidths && responsiveWidths.length > 0) {
    extraProps['srcSet'] = cloudinarySrcSet(src, responsiveWidths)
  }

  return (
    <Image
      {...props}
      src={optimisedSrc}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      unoptimized={isCloudinary} // Cloudinary already optimises — skip Next.js Image Optimization to avoid double-processing
    />
  )
}
