import './badge.scss'
import React, { HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'neutral' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md'
}

export const Badge: React.FC<BadgeProps> = ({
  className = '',
  variant = 'secondary',
  size = 'md',
  children,
  ...props
}) => {
  const rootClass = [
    'ms-badge',
    `ms-badge--${variant}`,
    `ms-badge--${size}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={rootClass} {...props}>
      {children}
    </span>
  )
}
