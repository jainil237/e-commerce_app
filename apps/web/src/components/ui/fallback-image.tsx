'use client'

import Image, { type ImageProps } from 'next/image'
import { useState, useEffect } from 'react'
import { getFirstLetter } from '@/utils/initials'

type FallbackImageProps = Omit<ImageProps, 'src' | 'alt'> & {
  src?: string | null
  alt: string
}

/**
 * Resolve an image URL that may be:
 *  1. A full URL already (https://res.cloudinary.com/... or http://localhost:4000/...) — pass through
 *  2. A legacy relative path (/uploads/...) stored before the server returned absolute URLs — prefix with API server base
 *  3. Null / undefined — return null so the fallback renders
 */
function resolveImageUrl(src: string | null | undefined): string | null {
  if (!src) return null

  // Already an absolute URL
  if (src.startsWith('http://') || src.startsWith('https://')) return src

  // Legacy relative path — prefix with the Express server origin
  if (src.startsWith('/uploads/')) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'
    // Strip the /api/v1 suffix to get the bare server origin
    const serverOrigin = apiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '')
    return `${serverOrigin}${src}`
  }

  return src
}

export function FallbackImage({ src, alt, className, ...props }: FallbackImageProps) {
  const resolvedSrc = resolveImageUrl(src)
  const [hasError, setHasError] = useState(false)

  // Reset error state whenever the resolved src changes so a new URL always gets a fresh attempt
  useEffect(() => {
    setHasError(false)
  }, [resolvedSrc])

  const shouldShowFallback = hasError || !resolvedSrc

  if (shouldShowFallback) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 ${className || ''}`}>
        <span className="font-bold text-slate-500" style={{ fontSize: 'inherit' }}>
          {getFirstLetter(alt)}
        </span>
      </div>
    )
  }

  return (
    <Image
      {...props}
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[FallbackImage] Failed to load image: ${resolvedSrc}`)
        }
        setHasError(true)
      }}
    />
  )
}
