'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

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

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/*
        Two live regions rather than one: errors interrupt (assertive), everything
        else waits for a pause (polite). Both are rendered unconditionally because
        a live region has to exist in the DOM before content lands in it for
        assistive tech to announce the change reliably.
      */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
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
