import React, { ButtonHTMLAttributes, forwardRef } from 'react'
import styles from './Button.module.css'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'primary-brand' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
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
      children, 
      disabled, 
      ...props 
    }, 
    ref
  ) => {
    
    const rootClass = [
      styles.button,
      styles[variant],
      styles[`size-${size}`],
      isLoading ? styles.loading : '',
      className
    ].filter(Boolean).join(' ')

    return (
      <button
        ref={ref}
        className={rootClass}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className={styles.spinner} />}
        {!isLoading && leftIcon && leftIcon}
        {children}
        {!isLoading && rightIcon && rightIcon}
      </button>
    )
  }
)

Button.displayName = 'Button'
