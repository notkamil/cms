import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import './HomePage.css'
import './NotFoundPage.css'

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

/** Блок «4»: 3×5, BSB / BSB / BBB / SSB / SSB. Цвет через класс. */
function Digit4({ colorClass }: { colorClass: string }) {
  const fill = [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1] // по рядам
  return (
    <div className="notfound-digit notfound-digit--4" aria-hidden="true">
      {fill.map((on, i) => (
        <div key={i} className={on ? `notfound-cell ${colorClass}` : 'notfound-cell notfound-cell--off'} />
      ))}
    </div>
  )
}

/** Блок «0»: 3×5. */
function Digit0({ colorClass }: { colorClass: string }) {
  const fill = [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1]
  return (
    <div className="notfound-digit notfound-digit--0" aria-hidden="true">
      {fill.map((on, i) => (
        <div key={i} className={on ? `notfound-cell ${colorClass}` : 'notfound-cell notfound-cell--off'} />
      ))}
    </div>
  )
}

export default function NotFoundPage() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

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

  return (
    <div className="home" data-theme={theme}>
      <header className="home-header">
        <div className="home-header-left">
          <NavLink to="/" className="home-header-brand home-header-brand--with-subtitle" style={{ textDecoration: 'none' }}>
            <div className="home-logo-tall-wrap">
              <img src={theme === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg'} alt="" className="home-logo-img home-logo-img--tall" />
            </div>
            <div className="home-brand-text">
              <h1 className="home-logo">CMS</h1>
              <p className="home-subtitle">Coworking Management System</p>
            </div>
          </NavLink>
        </div>
        <div className="home-header-right">
          <button
            type="button"
            className="home-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
            aria-label={theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему'}
          >
            {theme === 'light' ? <MoonIcon size={22} /> : <SunIcon size={22} />}
          </button>
        </div>
      </header>
      <main className="notfound-main">
        <div className="notfound-block" role="img" aria-label="404">
          <Digit4 colorClass="notfound-color-b" />
          <Digit0 colorClass="notfound-color-g" />
          <Digit4 colorClass="notfound-color-r" />
        </div>
      </main>
    </div>
  )
}
