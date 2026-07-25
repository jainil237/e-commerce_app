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
    const errorId = `${inputId}-error`

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
            // Without this, aria-invalid announces *that* the field is wrong but
            // never *why* — the error text is not associated with the input.
            aria-describedby={error ? errorId : undefined}
            {...props}
          />
          {rightIcon && <div className="ms-field__icon--right">{rightIcon}</div>}
        </div>
        {error && <span id={errorId} className="ms-field__help ms-field__help--error">{error}</span>}
      </div>
    )
  }
)

Input.displayName = 'Input'
