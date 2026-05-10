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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Store className="w-10 h-10 text-blue-600" />
            <span className="text-2xl font-bold">Admin Panel</span>
          </div>
          <h1 className="text-xl font-semibold">
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
                <label className="block text-sm font-medium mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
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
                <label className="block text-sm font-medium mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
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
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                <Info className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Email service not yet configured</p>
                  <p className="text-xs mt-1 text-amber-700">
                    OTP will be printed to the server console. Enable email delivery by setting{' '}
                    <code className="bg-amber-100 px-1 rounded">features.emailService: true</code> in{' '}
                    <code className="bg-amber-100 px-1 rounded">store.config.json</code> after purchasing an SMTP plan.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
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
                className="flex items-center justify-center gap-1 w-full text-sm text-gray-600 hover:text-gray-900 transition-colors"
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
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
                  <Info className="w-5 h-5 mt-0.5 shrink-0" />
                  <p>
                    Check your <strong>server terminal / console</strong> for the 6-digit OTP.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">OTP Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
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
                <label className="block text-sm font-medium mb-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input pl-10"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Min 8 chars · uppercase · lowercase · number · special character
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
                className="flex items-center justify-center gap-1 w-full text-sm text-gray-600 hover:text-gray-900 transition-colors"
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
