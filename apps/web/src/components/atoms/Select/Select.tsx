import '@/styles/input.scss'
import React, { SelectHTMLAttributes, forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helperText?: string
  options: { label: string; value: string | number }[]
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, helperText, options, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className={`ms-select-field${className ? ` ${className}` : ''}`}>
        {label && (
          <label htmlFor={selectId} className="ms-field__label">
            {label}
          </label>
        )}
        <div style={{ position: 'relative' }}>
          <select
            id={selectId}
            ref={ref}
            className={`ms-select${error ? ' ms-select--error' : ''}`}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="ms-select-field__chevron" width={16} height={16} />
        </div>
        {error && <span className="ms-field__help ms-field__help--error">{error}</span>}
        {helperText && !error && <span className="ms-field__help">{helperText}</span>}
      </div>
    )
  }
)

Select.displayName = 'Select'
