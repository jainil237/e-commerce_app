'use client'

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from 'react'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

const ToastContext = createContext<{
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}>({
  showToast: () => {},
})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  // showToast must be identity-stable: it sits in the dependency arrays of
  // cart's addItem and updateQuantity, so an unstable reference rebuilds those
  // on every toast render, which is what makes the checkout refetch loop cheap
  // to retrigger. Uses the setState updater form so it needs no dependencies.
  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    setToasts(prev => [...prev, { id, type, message }])
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
    timers.current.add(timer)
  }, [])

  // W-17: pending removal timers outlived the provider.
  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        Two live regions rather than one: errors interrupt (assertive), everything
        else waits for a pause (polite). Both are rendered unconditionally because
        a live region has to exist in the DOM before content lands in it for
        assistive tech to announce the change reliably.
      */}
      {/*
        z-70 matches $z-toast in _variables.scss. It was z-50, the same level as
        the swipe deck's lifted card, so a toast could be painted over by the
        very card whose action it was confirming.
      */}
      <div className="fixed top-4 right-4 z-[70] space-y-2">
        {(['assertive', 'polite'] as const).map(politeness => (
          <div
            key={politeness}
            role={politeness === 'assertive' ? 'alert' : 'status'}
            aria-live={politeness}
            aria-atomic="true"
            className="space-y-2"
          >
            {toasts
              .filter(t => (politeness === 'assertive' ? t.type === 'error' : t.type !== 'error'))
              .map(toast => (
                <div
                  key={toast.id}
                  className={`px-4 py-3 rounded-xl shadow-2xl animate-slide-in backdrop-blur-md border ${
                    toast.type === 'success' ? 'bg-[var(--surface-0)] text-[var(--success)] border-emerald-500/20' :
                    toast.type === 'error' ? 'bg-[var(--surface-0)] text-[var(--error)] border-red-500/20' :
                    'bg-[var(--surface-0)] text-[var(--info)] border-blue-500/20'
                  }`}
                >
                  {toast.message}
                </div>
              ))}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
