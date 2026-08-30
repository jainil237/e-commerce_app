'use client'

import './password-input.scss'
import React, { useId, useState } from 'react'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { Input } from '@/components/atoms/Input/Input'
import { PASSWORD_RULES, checkPassword } from '@shared/utils'

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  /** Passed through to the Input atom; the right slot holds the reveal toggle. */
  leftIcon?: React.ReactNode
  /** Show the live rule checklist. Sign-up and reset flows only. */
  showRequirements?: boolean
}

/**
 * Password field with a reveal toggle.
 *
 * The toggle is a real button so it is reachable by keyboard, and it is excluded
 * from the tab order between the field and the submit button only insofar as it
 * sits naturally after the input. aria-pressed carries its state.
 */
export function PasswordInput({
  label,
  error,
  leftIcon,
  showRequirements = false,
  value,
  className,
  ...props
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false)
  const listId = useId()

  const text = typeof value === 'string' ? value : ''
  const check = checkPassword(text)
  // Only nag once they have started typing.
  const showList = showRequirements && text.length > 0

  return (
    <div className={`ms-password${className ? ` ${className}` : ''}`}>
      <Input
        {...props}
        value={value}
        type={revealed ? 'text' : 'password'}
        label={label}
        error={error}
        leftIcon={leftIcon}
        aria-describedby={showList ? listId : undefined}
        rightIcon={
          <button
            type="button"
            className="ms-password__toggle"
            onClick={() => setRevealed(r => !r)}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            // Never submit the form this field lives in.
            tabIndex={0}
          >
            {revealed ? <EyeOff width={18} height={18} /> : <Eye width={18} height={18} />}
          </button>
        }
      />

      {showList && (
        <ul id={listId} className="ms-password__rules" aria-live="polite">
          {PASSWORD_RULES.map(rule => {
            const met = rule.test(text)
            return (
              <li
                key={rule.id}
                className={`ms-password__rule${met ? ' ms-password__rule--met' : ''}`}
              >
                {met ? <Check width={14} height={14} /> : <X width={14} height={14} />}
                <span>{rule.label}</span>
              </li>
            )
          })}
        </ul>
      )}

      {showList && (
        <div
          className="ms-password__meter"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={PASSWORD_RULES.length}
          aria-valuenow={check.score}
          aria-label="Password strength"
        >
          <span
            className={`ms-password__meter-fill ms-password__meter-fill--${check.score}`}
            style={{ width: `${(check.score / PASSWORD_RULES.length) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
