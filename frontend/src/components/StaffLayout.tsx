import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useStaffAuth } from '../context/StaffAuthContext'
import '../pages/CabinetPage.css'
import './StaffLayout.css'

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

interface StaffLayoutProps {
  children?: ReactNode
}

export function StaffLayout({ children }: StaffLayoutProps) {
  const { staffUser, staffLogout } = useStaffAuth()
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    document.title = 'CMS/Staff'
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = theme === 'dark' ? '/favicon-staff-dark.svg' : '/favicon-staff-light.svg'
    return () => {
      document.title = 'CMS'
      const iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (iconLink) iconLink.href = theme === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg'
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === 'light' ? 'dark' : 'light'
      localStorage.setItem(THEME_STORAGE_KEY, next)
      return next
    })
  }

  return (
    <div className="cabinet staff-layout" data-theme={theme}>
      <header className="cabinet-header">
        <div className="cabinet-header-left">
          <div className={`staff-header-brand${!staffUser ? ' staff-header-brand--full' : ''}`}>
            <img
              src={theme === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg'}
              alt=""
              className="cabinet-logo-img"
              width={staffUser ? 32 : 48}
              height={staffUser ? 32 : 48}
            />
            <div className="staff-header-brand-text">
              <h1 className="cabinet-logo staff-header-logo">
                <span>CMS</span>
                <span className="staff-brand-slash">/Staff</span>
              </h1>
              {!staffUser && (
                <p className="cabinet-subtitle">Coworking Management System</p>
              )}
            </div>
          </div>
          {staffUser && (
            <nav className="cabinet-header-nav">
              <NavLink to="/staff" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`} end>Главная</NavLink>
              <NavLink to="/staff/cabinet" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Личный кабинет</NavLink>
              {(staffUser.role === 'admin' || staffUser.role === 'superadmin') && (
                <NavLink to="/staff/staff" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Сотрудники</NavLink>
              )}
              <NavLink to="/staff/spaces" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Пространства</NavLink>
              <NavLink to="/staff/amenities" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Удобства</NavLink>
              <NavLink to="/staff/tariffs" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Тарифы</NavLink>
              <NavLink to="/staff/subscriptions" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Подписки</NavLink>
              <NavLink to="/staff/bookings" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Бронирования</NavLink>
              <NavLink to="/staff/settings" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Общие</NavLink>
            </nav>
          )}
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
          {staffUser && (
            <button type="button" className="cabinet-header-logout" onClick={staffLogout}>
              Выход
            </button>
          )}
        </div>
      </header>
      <main className="cabinet-main staff-main">
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
