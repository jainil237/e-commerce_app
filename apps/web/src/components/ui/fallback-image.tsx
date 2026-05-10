'use client'

import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'
import { getFirstLetter } from '@/utils/initials'

type FallbackImageProps = Omit<ImageProps, 'src' | 'alt'> & {
  src?: string | null
  alt: string
}

export function FallbackImage({ src, alt, className, ...props }: FallbackImageProps) {
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

  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  )
}
