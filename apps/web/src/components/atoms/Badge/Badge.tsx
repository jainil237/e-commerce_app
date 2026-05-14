import React, { HTMLAttributes } from 'react'
import styles from './Badge.module.css'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'success' | 'warning' | 'error'
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
    styles.badge,
    styles[variant],
    styles[`size-${size}`],
    className
  ].filter(Boolean).join(' ')

  return (
    <span className={rootClass} {...props}>
      {children}
    </span>
  )
}
