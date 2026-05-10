const [view, setView] = useState<'login' | 'forgot' | 'reset'>('login')
const [otp, setOtp] = useState('')
const [newPassword, setNewPassword] = useState('')

const handleForgotPassword = async (e: React.FormEvent) => {
  e.preventDefault()
  setIsLoading(true)
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Failed to request password reset')
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
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
