'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth.context'
import { useToast } from '@/contexts/toast.context'
import { Button } from '@/components/atoms/Button/Button'
import { Input } from '@/components/atoms/Input/Input'
import { safeRedirect } from '@/lib/safe-redirect'
import '../auth.scss'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, user } = useAuth()
  const { showToast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const redirect = safeRedirect(searchParams.get('redirect'))

  if (user) {
    router.push(redirect)
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await login(email, password)
      router.push(redirect)
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Login failed')
    }

    setIsLoading(false)
  }

  return (
    <div className="ms-auth">
      <div className="ms-auth__wrapper">
        <div className="ms-auth__header">
          <h1 className="ms-auth__title">Welcome Back</h1>
          <p className="ms-auth__subtitle">Sign in to your account</p>
        </div>

        <div className="ms-auth-card">
          <form onSubmit={handleSubmit} className="ms-auth-card__form">
            <Input
              type="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              leftIcon={<Mail className="w-5 h-5 text-[var(--text-tertiary)]" />}
              required
            />

            <Input
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              leftIcon={<Lock className="w-5 h-5 text-[var(--text-tertiary)]" />}
              required
            />

            <div className="ms-auth-card__remember-row">
              <label className="ms-auth-card__remember-label">
                <input type="checkbox" className="ms-auth-card__checkbox" />
                Remember me
              </label>
              <Link href="/account/forgot-password" className="ms-auth-card__forgot-link">
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="ms-auth-card__submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="ms-auth-card__footer">
            <span className="ms-auth-card__footer-text">Don&apos;t have an account?</span>{' '}
            <Link href="/account/register" className="ms-auth-card__footer-link">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="ms-auth"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]" /></div>}>
      <LoginContent />
    </Suspense>
  )
}
