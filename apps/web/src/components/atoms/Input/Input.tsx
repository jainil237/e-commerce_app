import React, { InputHTMLAttributes, forwardRef, ReactNode } from 'react'
import styles from './Input.module.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { 
      className = '', 
      label, 
      error, 
      leftIcon, 
      rightIcon, 
      id, 
      ...props 
    }, 
    ref
  ) => {
    // Generate a unique ID if one isn't provided but we have a label
    const generatedId = React.useId()
    const inputId = id || generatedId

    const wrapperClass = [
      styles.wrapper,
      error ? styles.hasError : '',
      className
    ].filter(Boolean).join(' ')

    return (
      <div className={wrapperClass}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}
        <div className={styles.inputContainer}>
          {leftIcon && <div className={styles.iconLeft}>{leftIcon}</div>}
          <input
            id={inputId}
            ref={ref}
            className={`${styles.input} ${leftIcon ? styles.withLeftIcon : ''} ${rightIcon ? styles.withRightIcon : ''}`}
            aria-invalid={!!error}
            {...props}
          />
          {rightIcon && <div className={styles.iconRight}>{rightIcon}</div>}
        </div>
        {error && <span className={styles.errorMessage}>{error}</span>}
      </div>
    )
  }
)

Input.displayName = 'Input'
