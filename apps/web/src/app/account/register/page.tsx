'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User, Mail, Phone, Lock, Loader2 } from 'lucide-react'
import { useAuth, useToast } from '@/contexts'
import { Button } from '@/components/atoms/Button/Button'
import { Input } from '@/components/atoms/Input/Input'
import { PasswordInput } from '@/components/molecules/PasswordInput/PasswordInput'
import { checkPassword } from '@shared/utils'
import '../auth.scss'

export default function RegisterPage() {
  const router = useRouter()
  const { register, user } = useAuth()
  const { showToast } = useToast()

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  if (user) {
    router.push('/account')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      showToast('error', 'Passwords do not match')
      return
    }

    const passwordCheck = checkPassword(formData.password)
    if (!passwordCheck.valid) {
      // Name the first unmet rule rather than a generic "too weak".
      showToast('error', `Password needs: ${passwordCheck.failed.map(r => r.label.toLowerCase()).join(', ')}`)
      return
    }

    setIsLoading(true)

    try {
      await register({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      })
      router.push('/account')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Registration failed')
    }

    setIsLoading(false)
  }

  return (
    <div className="ms-auth">
      <div className="ms-auth__wrapper">
        <div className="ms-auth__header">
          <h1 className="ms-auth__title">Create Account</h1>
          <p className="ms-auth__subtitle">Join us today</p>
        </div>

        <div className="ms-auth-card">
          <form onSubmit={handleSubmit} className="ms-auth-card__form ms-auth-card__form--dense">
            <Input
              label="Full Name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              leftIcon={<User className="w-5 h-5 text-[var(--text-tertiary)]" />}
              required
            />

            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="you@example.com"
              leftIcon={<Mail className="w-5 h-5 text-[var(--text-tertiary)]" />}
              required
            />

            <Input
              label="Phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="9876543210"
              leftIcon={<Phone className="w-5 h-5 text-[var(--text-tertiary)]" />}
              required
            />

            <PasswordInput
              label="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              leftIcon={<Lock className="w-5 h-5 text-[var(--text-tertiary)]" />}
              required
              showRequirements
              autoComplete="new-password"
            />

            <PasswordInput
              label="Confirm Password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="••••••••"
              leftIcon={<Lock className="w-5 h-5 text-[var(--text-tertiary)]" />}
              required
              autoComplete="new-password"
              error={
                formData.confirmPassword && formData.confirmPassword !== formData.password
                  ? 'Passwords do not match'
                  : undefined
              }
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="ms-auth-card__submit ms-auth-card__submit--top-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <div className="ms-auth-card__footer">
            <span className="ms-auth-card__footer-text">Already have an account?</span>{' '}
            <Link href="/account/login" className="ms-auth-card__footer-link">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
