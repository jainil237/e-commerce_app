'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User, Mail, Phone, Lock, Loader2 } from 'lucide-react'
import { useAuth, useToast } from '@/components/providers'
import { Button } from '@/components/atoms/Button/Button'
import { Input } from '@/components/atoms/Input/Input'

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

    if (formData.password.length < 8) {
      showToast('error', 'Password must be at least 8 characters')
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
    <div className="min-h-screen bg-[var(--surface-1)] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Create Account</h1>
          <p className="text-[var(--text-secondary)] mt-2">Join us today</p>
        </div>

        <div className="bg-[var(--surface-0)] p-8 rounded-2xl shadow-sm border border-[var(--border-subtle)]">
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <Input
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              leftIcon={<Lock className="w-5 h-5 text-[var(--text-tertiary)]" />}
              required
              minLength={8}
            />

            <Input
              label="Confirm Password"
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="••••••••"
              leftIcon={<Lock className="w-5 h-5 text-[var(--text-tertiary)]" />}
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-6"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-8 text-center text-sm">
            <span className="text-[var(--text-secondary)]">Already have an account?</span>{' '}
            <Link href="/account/login" className="text-[var(--brand-primary)] font-semibold hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
