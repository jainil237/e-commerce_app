'use client'

import './switch.scss'
import React from 'react'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Visible text beside the control. Also names the switch for assistive tech. */
  label: string
  /** Extra context read out after the label. */
  description?: string
  disabled?: boolean
  id?: string
}

/**
 * iOS-style slider switch.
 *
 * A real <button role="switch"> rather than a styled checkbox: it gets keyboard
 * activation and aria-checked for free, and there is no hidden input to keep in
 * sync with the visual state.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  id,
}: SwitchProps) {
  const generatedId = React.useId()
  const switchId = id || generatedId
  const descriptionId = description ? `${switchId}-description` : undefined

  return (
    <div className="ms-switch-field">
      <span className="ms-switch-field__text">
        <label htmlFor={switchId} className="ms-switch-field__label">
          {label}
        </label>
        {description && (
          <span id={descriptionId} className="ms-switch-field__description">
            {description}
          </span>
        )}
      </span>

      <button
        type="button"
        id={switchId}
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={`ms-switch${checked ? ' ms-switch--on' : ''}`}
      >
        <span className="ms-switch__thumb" />
      </button>
    </div>
  )
}
