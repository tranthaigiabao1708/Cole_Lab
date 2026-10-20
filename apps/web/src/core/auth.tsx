import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type User } from './api'

interface AuthState {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api
      .get<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.post<User>('/auth/login', { email, password })
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }, [])

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
