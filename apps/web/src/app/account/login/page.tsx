'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Loader2 } from 'lucide-react'
import { useAuth, useToast } from '@/components/providers'
import { Button } from '@/components/atoms/Button/Button'
import { Input } from '@/components/atoms/Input/Input'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, user } = useAuth()
  const { showToast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const redirect = searchParams.get('redirect') || '/account'

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
    <div className="min-h-screen bg-[var(--surface-1)] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Welcome Back</h1>
          <p className="text-[var(--text-secondary)] mt-2">Sign in to your account</p>
        </div>

        <div className="bg-[var(--surface-0)] p-8 rounded-2xl shadow-sm border border-[var(--border-subtle)]">
          <form onSubmit={handleSubmit} className="space-y-5">
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

            <div className="flex items-center justify-between text-sm pt-2">
              <label className="flex items-center gap-2 text-[var(--text-primary)] cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-[var(--border-base)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] bg-[var(--surface-0)]" />
                Remember me
              </label>
              <Link href="/account/forgot-password" className="text-[var(--brand-primary)] font-medium hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-4"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-8 text-center text-sm">
            <span className="text-[var(--text-secondary)]">Don't have an account?</span>{' '}
            <Link href="/account/register" className="text-[var(--brand-primary)] font-semibold hover:underline">
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
    <Suspense fallback={<div className="min-h-screen bg-[var(--surface-1)] flex items-center justify-center py-12 px-4"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]" /></div>}>
      <LoginContent />
    </Suspense>
  )
}
