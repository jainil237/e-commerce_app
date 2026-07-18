'use client'
import './button.scss'
import React, { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'primary-brand' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  full?: boolean
  icon?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      full = false,
      icon = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const rootClass = [
      'ms-btn',
      `ms-btn--${variant}`,
      `ms-btn--${size}`,
      full ? 'ms-btn--full' : '',
      icon ? 'ms-btn--icon' : '',
      className,
    ].filter(Boolean).join(' ')

    return (
      <button
        ref={ref}
        className={rootClass}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="ms-btn__spinner" aria-hidden="true" />}
        {!isLoading && leftIcon}
        {children}
        {!isLoading && rightIcon}
      </button>
    )
  }
)

Button.displayName = 'Button'
