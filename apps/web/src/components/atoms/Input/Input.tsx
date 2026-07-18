'use client'
import '@/styles/input.scss'
import React, { InputHTMLAttributes, forwardRef, ReactNode } from 'react'

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
    const generatedId = React.useId()
    const inputId = id || generatedId

    const wrapperClass = [
      'ms-field',
      className,
    ].filter(Boolean).join(' ')

    const inputClass = [
      'ms-input',
      leftIcon ? 'ms-input--has-left' : '',
      rightIcon ? 'ms-input--has-right' : '',
      error ? 'ms-input--error' : '',
    ].filter(Boolean).join(' ')

    return (
      <div className={wrapperClass}>
        {label && (
          <label htmlFor={inputId} className="ms-field__label">
            {label}
          </label>
        )}
        <div style={{ position: 'relative' }}>
          {leftIcon && <div className="ms-field__icon--left">{leftIcon}</div>}
          <input
            id={inputId}
            ref={ref}
            className={inputClass}
            aria-invalid={!!error}
            {...props}
          />
          {rightIcon && <div className="ms-field__icon--right">{rightIcon}</div>}
        </div>
        {error && <span className="ms-field__help ms-field__help--error">{error}</span>}
      </div>
    )
  }
)

Input.displayName = 'Input'
