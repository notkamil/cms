import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { post, ApiError, STORAGE_STAFF_TOKEN_KEY } from '../api/client'

/** Matches backend StaffResponse */
export interface StaffUser {
  id: number
  name: string
  email: string
  phone: string
  role: string
  position: string
}

interface StaffAuthResponse {
  token: string
  staff: StaffUser
}

const STAFF_USER_STORAGE_KEY = 'staffUser'

function readStoredStaffUser(): StaffUser | null {
  try {
    const raw = localStorage.getItem(STAFF_USER_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StaffUser
  } catch {
    return null
  }
}

function readStoredStaffToken(): string | null {
  return localStorage.getItem(STORAGE_STAFF_TOKEN_KEY)
}

interface StaffAuthContextValue {
  staffUser: StaffUser | null
  staffToken: string | null
  staffLogin: (email: string, password: string) => Promise<void>
  staffLogout: () => void
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null)

interface StaffAuthProviderProps {
  children: ReactNode
}

export function StaffAuthProvider({ children }: StaffAuthProviderProps) {
  const [staffUser, setStaffUser] = useState<StaffUser | null>(readStoredStaffUser)
  const [staffToken, setStaffToken] = useState<string | null>(readStoredStaffToken)

  const staffLogin = useCallback(async (email: string, password: string) => {
    const data = await post<StaffAuthResponse>(
      '/api/staff/auth/login',
      { email, password },
      false
    )
    setStaffToken(data.token)
    setStaffUser(data.staff)
    localStorage.setItem(STORAGE_STAFF_TOKEN_KEY, data.token)
    localStorage.setItem(STAFF_USER_STORAGE_KEY, JSON.stringify(data.staff))
  }, [])

  const staffLogout = useCallback(() => {
    setStaffToken(null)
    setStaffUser(null)
    localStorage.removeItem(STORAGE_STAFF_TOKEN_KEY)
    localStorage.removeItem(STAFF_USER_STORAGE_KEY)
  }, [])

  const value = useMemo<StaffAuthContextValue>(
    () => ({ staffUser, staffToken, staffLogin, staffLogout }),
    [staffUser, staffToken, staffLogin, staffLogout]
  )

  return (
    <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>
  )
}

export function useStaffAuth(): StaffAuthContextValue {
  const ctx = useContext(StaffAuthContext)
  if (!ctx) {
    throw new Error('useStaffAuth must be used within StaffAuthProvider')
  }
  return ctx
}

export { ApiError as StaffApiError }
