import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTripleClick } from '../hooks/useTripleClick'
import '../pages/CabinetPage.css'

type Theme = 'light' | 'dark'
const THEME_STORAGE_KEY = 'theme'

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

function SunIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export default function CabinetLayout() {
  const navigate = useNavigate()
  const { token, logout } = useAuth()
  const [theme, setTheme] = useState<Theme>(readStoredTheme)
  const onLogoTripleClick = useTripleClick(() => navigate('/cms'))

  useEffect(() => {
    if (!token) {
      navigate('/', { replace: true })
      return
    }
  }, [token, navigate])

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = theme === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg'
  }, [theme])

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light'
      localStorage.setItem(THEME_STORAGE_KEY, next)
      return next
    })
  }

  if (!token) {
    return null
  }

  return (
    <div className="cabinet" data-theme={theme}>
      <header className="cabinet-header">
        <div className="cabinet-header-left">
          <div className="cabinet-header-brand">
            <div className="cabinet-logo-row cabinet-logo-row--clickable" onClick={onLogoTripleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onLogoTripleClick(e as unknown as React.MouseEvent)} aria-label="Тройной клик — загрузка">
              <img src={theme === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg'} alt="" className="cabinet-logo-img" width={32} height={32} />
              <h1 className="cabinet-logo">CMS</h1>
            </div>
          </div>
          <nav className="cabinet-header-nav">
            <NavLink to="/" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`} end>Главная</NavLink>
            <NavLink to="/cabinet" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`} end>Личный кабинет</NavLink>
            <NavLink to="/subscriptions" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Подписки</NavLink>
            <NavLink to="/bookings" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`} end>Бронирования</NavLink>
            <NavLink to="/bookings/list" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`} end>Мои брони</NavLink>
          </nav>
        </div>
        <div className="cabinet-header-right">
          <button
            type="button"
            className="cabinet-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
            aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
          >
            {theme === 'light' ? <MoonIcon size={22} /> : <SunIcon size={22} />}
          </button>
          <button type="button" className="cabinet-header-logout" onClick={logout}>
            Выход
          </button>
        </div>
      </header>
      <main className="cabinet-main">
        <Outlet context={{ theme }} />
      </main>
    </div>
  )
}
