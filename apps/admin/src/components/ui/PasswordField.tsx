'use client'

import { useId, useState } from 'react'
import { Lock, Eye, EyeOff, Check, X } from 'lucide-react'
import { PASSWORD_RULES, checkPassword } from '@shared/utils'

interface PasswordFieldProps {
  id: string
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  autoComplete?: string
  /**
   * Show the live rule checklist. Only where a password is being *set* — at
   * sign-in an existing password must keep working whatever its age, and
   * grading it there tells an attacker more than it tells the account owner.
   */
  showRequirements?: boolean
}

/**
 * Admin password input with a reveal toggle.
 *
 * Tailwind rather than BEM because this page has not been migrated, and mixing
 * the two in one component is what scripts/verify-no-tailwind-with-scss.mjs
 * exists to prevent.
 *
 * The rules come from @shared/utils, which mirrors the Zod schema the API
 * enforces on reset — so the checklist cannot promise something the server then
 * rejects.
 */
export function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  placeholder = '••••••••',
  required,
  autoComplete,
  showRequirements = false,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false)
  const listId = useId()
  const showList = showRequirements && value.length > 0
  const { score } = checkPassword(value)

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-semibold mb-1.5 text-[var(--text-primary)]"
      >
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
        <input
          id={id}
          name={name}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input pl-10 pr-10"
          required={required}
          autoComplete={autoComplete}
          aria-describedby={showList ? listId : undefined}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-pressed={revealed}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          {revealed ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>

      {showList && (
        <>
          <ul id={listId} className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1" aria-live="polite">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(value)
              return (
                <li
                  key={rule.id}
                  className={`flex items-center gap-1.5 text-[11px] ${
                    met ? 'text-[var(--success,#16a34a)]' : 'text-[var(--text-tertiary)]'
                  }`}
                >
                  {met ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  <span>{rule.label}</span>
                </li>
              )
            })}
          </ul>
          <div
            className="mt-2 h-1 rounded-full bg-[var(--surface-3)] overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={PASSWORD_RULES.length}
            aria-valuenow={score}
            aria-label="Password strength"
          >
            <span
              className="block h-full rounded-full transition-all"
              style={{
                width: `${(score / PASSWORD_RULES.length) * 100}%`,
                background:
                  score === PASSWORD_RULES.length
                    ? 'var(--success, #16a34a)'
                    : score >= 3
                      ? '#f59e0b'
                      : 'var(--error, #dc2626)',
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
