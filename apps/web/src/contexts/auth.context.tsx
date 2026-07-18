'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import useSWR from 'swr'

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: 'CUSTOMER' | 'ADMIN'
}

const AuthContext = createContext<{
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { name: string; email: string; phone: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}>({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
})

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.message || 'An error occurred')
  }
  return res.json()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const { data, error, mutate } = useSWR('/api/v1/auth/me', fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  useEffect(() => {
    if (data?.data) {
      setUser(data.data)
    } else {
      setUser(null)
    }
    setIsLoading(false)
  }, [data, error])

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.message || 'Login failed')
    setUser(result.data.user)
    mutate()
  }

  const register = async (data: { name: string; email: string; phone: string; password: string }) => {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.message || 'Registration failed')
    setUser(result.data.user)
    mutate()
  }

  const logout = async () => {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    setUser(null)
    mutate(undefined, false)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
