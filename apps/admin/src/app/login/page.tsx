'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Loader2, Store, KeyRound, ArrowLeft, Info } from 'lucide-react'
import { useAuth, useToast } from '@/components/providers'

export default function LoginPage() {
  const router = useRouter()
  const { login, user, isLoading: authLoading } = useAuth()
  const { showToast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [view, setView] = useState<'login' | 'forgot' | 'reset'>('login')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [emailServiceEnabled, setEmailServiceEnabled] = useState(false)

  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/')
    }
  }, [authLoading, user, router])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (user) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await login(email, password)
      router.push('/')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Login failed')
    }

    setIsLoading(false)
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const res = await fetch(`/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to request password reset')

      setEmailServiceEnabled(data.emailServiceEnabled ?? false)
      showToast('success', data.message)
      setView('reset')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Error requesting password reset')
    }
    setIsLoading(false)
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const res = await fetch(`/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, otp, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to reset password')
      showToast('success', 'Password reset successfully. Please sign in.')
      setView('login')
      setPassword('')
      setOtp('')
      setNewPassword('')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Error resetting password')
    }
    setIsLoading(false)
  }

  const goBackToLogin = () => {
    setView('login')
    setOtp('')
    setNewPassword('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-1)] py-12 px-4 transition-colors">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-600/20">
              <Store className="w-8 h-8 text-white" />
            </div>
            <span className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">Admin Panel</span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--text-secondary)]">
            {view === 'login' && 'Sign in to your account'}
            {view === 'forgot' && 'Reset your password'}
            {view === 'reset' && 'Enter OTP & new password'}
          </h1>
        </div>

        <div className="card p-6">
          {/* ─── LOGIN VIEW ─── */}
          {view === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold mb-1.5 text-[var(--text-primary)]">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@store.com"
                    className="input pl-10"
                    required
                  />
                </div>
              </div>
 
              <div>
                <label htmlFor="password" className="block text-sm font-semibold mb-1.5 text-[var(--text-primary)]">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input pl-10"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setView('forgot')}
                  className="text-sm text-blue-600 hover:text-blue-500 transition-colors"
                >
                  Forgot your password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary btn-md w-full"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          )}

          {/* ─── FORGOT PASSWORD VIEW ─── */}
          {view === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-xl text-amber-800 dark:text-amber-400 text-sm">
                <Info className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold uppercase tracking-wider text-[10px]">Email service status</p>
                  <p className="mt-1 font-medium leading-relaxed">
                    OTP will be printed to the server console. Enable email delivery by setting{' '}
                    <code className="bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded font-mono text-[11px]">features.emailService: true</code>
                  </p>
                </div>
              </div>
 
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-semibold mb-1.5 text-[var(--text-primary)]">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@store.com"
                    className="input pl-10"
                    required
                  />
                </div>
              </div>
 
              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary btn-md w-full"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Send OTP'
                )}
              </button>
 
              <button
                type="button"
                onClick={goBackToLogin}
                className="flex items-center justify-center gap-2 w-full text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </button>
            </form>
          )}

          {/* ─── RESET PASSWORD VIEW ─── */}
          {view === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {!emailServiceEnabled && (
                <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/30 rounded-xl text-blue-800 dark:text-blue-400 text-sm">
                  <Info className="w-5 h-5 mt-0.5 shrink-0" />
                  <p className="font-medium leading-relaxed">
                    Check your <strong>server terminal / console</strong> for the 6-digit OTP.
                  </p>
                </div>
              )}
 
              <div>
                <label htmlFor="otp" className="block text-sm font-semibold mb-1.5 text-[var(--text-primary)]">OTP Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                  <input
                    id="otp"
                    name="otp"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="input pl-10 tracking-[0.3em] font-mono"
                    required
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                  />
                </div>
              </div>
 
              <div>
                <label htmlFor="new-password" className="block text-sm font-semibold mb-1.5 text-[var(--text-primary)]">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]" />
                  <input
                    id="new-password"
                    name="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input pl-10"
                    required
                  />
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5 font-medium uppercase tracking-wider">
                  Min 8 chars • uppercase • lowercase • number • special
                </p>
              </div>
 
              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary btn-md w-full"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Reset Password'
                )}
              </button>
 
              <button
                type="button"
                onClick={goBackToLogin}
                className="flex items-center justify-center gap-2 w-full text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
