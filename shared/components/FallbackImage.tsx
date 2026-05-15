'use client';

import React, { useState } from 'react';
import Image, { ImageProps } from 'next/image';
import { ImageOff } from 'lucide-react';

interface FallbackImageProps extends ImageProps {
  fallbackSrc?: string;
}

export const FallbackImage = ({
  src,
  alt,
  fallbackSrc = '/assets/placeholder.png',
  className = '',
  ...props
}: FallbackImageProps) => {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div 
        className={`flex items-center justify-center bg-[var(--surface-2)] text-[var(--text-tertiary)] ${className}`}
        style={{ position: 'relative', width: props.fill ? '100%' : props.width, height: props.fill ? '100%' : props.height }}
      >
        <ImageOff className="w-1/3 h-1/3 opacity-20" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      {...props}
    />
  );
};
