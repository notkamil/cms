import { useState } from 'react'
import { useAuth, ApiError } from '../context/AuthContext'
import './HomePage.css'

type AuthMode = 'login' | 'register'

export default function HomePage() {
  const { user, login, register, logout } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerPhone, setRegisterPhone] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(loginEmail, loginPassword)
      } else {
        await register(registerName, registerEmail, registerPassword, registerPhone)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  if (user) {
    return (
      <div className="home">
        <header className="home-header">
          <div className="home-header-left">
            <h1 className="home-logo">CMS</h1>
            <p className="home-subtitle">Coworking Management System</p>
          </div>
          <button type="button" className="home-header-logout" onClick={logout}>
            Выход
          </button>
        </header>
        <section className="home-content">
          <div className="auth-card auth-card--logged-in">
            <h2 className="auth-card-title">Вы вошли под учётной записью</h2>
            <p className="auth-card-name">{user.name}</p>
            <p className="auth-card-email">{user.email}</p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header-left">
          <h1 className="home-logo">CMS</h1>
          <p className="home-subtitle">Coworking Management System</p>
        </div>
      </header>
      <section className="home-content">
        <div className="auth-card">
          <div className="auth-switcher">
            <button
              type="button"
              className={`auth-switcher-tab ${mode === 'login' ? 'auth-switcher-tab--active' : ''}`}
              onClick={() => { setMode('login'); setError(null) }}
            >
              Войти
            </button>
            <div className="auth-switcher-divider" aria-hidden="true" />
            <button
              type="button"
              className={`auth-switcher-tab ${mode === 'register' ? 'auth-switcher-tab--active' : ''}`}
              onClick={() => { setMode('register'); setError(null) }}
            >
              Зарегистрироваться
            </button>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <p className="auth-error">{error}</p>}
            {mode === 'register' && (
              <>
                <label className="auth-label" htmlFor="register-name">Имя</label>
                <input
                  id="register-name"
                  type="text"
                  className="auth-input"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </>
            )}
            <label className="auth-label" htmlFor={mode === 'login' ? 'login-email' : 'register-email'}>
              Email
            </label>
            <input
              id={mode === 'login' ? 'login-email' : 'register-email'}
              type="email"
              className="auth-input"
              value={mode === 'login' ? loginEmail : registerEmail}
              onChange={(e) => (mode === 'login' ? setLoginEmail(e.target.value) : setRegisterEmail(e.target.value))}
              required
              autoComplete="email"
            />
            <label className="auth-label" htmlFor={mode === 'login' ? 'login-password' : 'register-password'}>
              Пароль
            </label>
            <input
              id={mode === 'login' ? 'login-password' : 'register-password'}
              type="password"
              className="auth-input"
              value={mode === 'login' ? loginPassword : registerPassword}
              onChange={(e) =>
                mode === 'login' ? setLoginPassword(e.target.value) : setRegisterPassword(e.target.value)
              }
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' && (
              <>
                <label className="auth-label" htmlFor="register-phone">Телефон</label>
                <input
                  id="register-phone"
                  type="tel"
                  className="auth-input"
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  required
                  autoComplete="tel"
                />
              </>
            )}
            <button
              type="submit"
              className={mode === 'login' ? 'auth-btn auth-btn--login' : 'auth-btn auth-btn--register'}
              disabled={loading}
            >
              {loading ? '...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}
