import { useState } from 'react'
import { useStaffAuth, StaffApiError } from '../context/StaffAuthContext'
import './StaffLoginPage.css'

export default function StaffLoginPage() {
  const { staffLogin } = useStaffAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await staffLogin(email, password)
    } catch (err) {
      setError(err instanceof StaffApiError ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="staff-login-wrap">
      <div className="staff-login">
        <h2 className="staff-login-title">Вход для сотрудников</h2>
        <form className="cabinet-modal-form staff-login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="cabinet-modal-error staff-login-error" role="alert">
              {error}
            </div>
          )}
          <label className="cabinet-modal-label staff-login-label">
            Email
            <input
              type="email"
              className="cabinet-modal-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </label>
          <label className="cabinet-modal-label staff-login-label">
            Пароль
            <input
              type="password"
              className="cabinet-modal-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </label>
          <button type="submit" className="cabinet-modal-submit cabinet-deposit-submit" disabled={loading}>
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
