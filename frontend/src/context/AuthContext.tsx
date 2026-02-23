import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { post, ApiError, STORAGE_TOKEN_KEY } from '../api/client'

/** Matches backend MemberResponse */
export interface User {
  id: number
  name: string
  email: string
  phone: string
  balance: number
  registeredAt: string
}

interface AuthResponse {
  token: string
  member: User
}

const USER_STORAGE_KEY = 'user'

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

function readStoredToken(): string | null {
  return localStorage.getItem(STORAGE_TOKEN_KEY)
}

interface AuthContextValue {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, phone: string) => Promise<void>
  logout: () => void
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(readStoredUser)
  const [token, setToken] = useState<string | null>(readStoredToken)

  const login = useCallback(async (email: string, password: string) => {
    const data = await post<AuthResponse>('/api/auth/login', { email, password })
    setToken(data.token)
    setUser(data.member)
    localStorage.setItem(STORAGE_TOKEN_KEY, data.token)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.member))
  }, [])

  const register = useCallback(
    async (name: string, email: string, password: string, phone: string) => {
      const data = await post<AuthResponse>('/api/auth/register', {
        name,
        email,
        password,
        phone,
      })
      setToken(data.token)
      setUser(data.member)
      localStorage.setItem(STORAGE_TOKEN_KEY, data.token)
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.member))
    },
    []
  )

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem(STORAGE_TOKEN_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
  }, [])

  const updateUser = useCallback((next: User) => {
    setUser(next)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, login, register, logout, updateUser }),
    [user, token, login, register, logout, updateUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

export { ApiError }
