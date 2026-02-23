import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth, ApiError } from '../context/AuthContext'
import { get, patch, put } from '../api/client'
import './CabinetPage.css'

/** Backend MemberResponse */
interface Me {
  id: number
  name: string
  email: string
  phone: string
  balance: number
  registeredAt: string
}

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

export default function CabinetPage() {
  const navigate = useNavigate()
  const { user, token, logout, updateUser } = useAuth()
  const [theme, setTheme] = useState<Theme>(readStoredTheme)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editCurrentPassword, setEditCurrentPassword] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [passwordCurrent, setPasswordCurrent] = useState('')
  const [passwordNew, setPasswordNew] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      navigate('/', { replace: true })
      return
    }
    let cancelled = false
    get<Me>('/api/me')
      .then((data) => {
        if (!cancelled) {
          setMe(data)
        }
      })
      .catch(() => {
        if (!cancelled) setMe(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
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

  const openModal = () => {
    if (me) {
      setEditName(me.name)
      setEditEmail(me.email)
      setEditPhone(me.phone)
      setEditCurrentPassword('')
      setEditError(null)
      setModalOpen(true)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditError(null)
  }

  const openPasswordModal = () => {
    setPasswordCurrent('')
    setPasswordNew('')
    setPasswordConfirm('')
    setPasswordError(null)
    setPasswordModalOpen(true)
  }

  const closePasswordModal = () => {
    setPasswordModalOpen(false)
    setPasswordError(null)
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordNew !== passwordConfirm) {
      setPasswordError('Новый пароль и подтверждение не совпадают')
      return
    }
    if (passwordNew.length < 1) {
      setPasswordError('Введите новый пароль')
      return
    }
    setPasswordError(null)
    setPasswordLoading(true)
    try {
      await put('/api/me/password', {
        currentPassword: passwordCurrent,
        newPassword: passwordNew,
      })
      closePasswordModal()
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Произошла ошибка')
    } finally {
      setPasswordLoading(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!me) return
    setEditError(null)
    setEditLoading(true)
    try {
      const updated = await patch<Me>('/api/me', {
        name: editName.trim() || me.name,
        email: editEmail.trim() || me.email,
        phone: editPhone.trim() || me.phone,
        currentPassword: editCurrentPassword,
      })
      updateUser(updated)
      setMe(updated)
      closeModal()
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Произошла ошибка')
    } finally {
      setEditLoading(false)
    }
  }

  if (!user) {
    return null
  }

  if (loading) {
    return (
      <div className="cabinet" data-theme={theme}>
        <p className="cabinet-loading">Загрузка…</p>
      </div>
    )
  }

  return (
    <div className="cabinet" data-theme={theme}>
      <header className="cabinet-header">
        <div className="cabinet-header-left">
          <div className="cabinet-header-brand">
            <div className="cabinet-logo-row">
              <img src={theme === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg'} alt="" className="cabinet-logo-img" width={32} height={32} />
              <h1 className="cabinet-logo">CMS</h1>
            </div>
          </div>
          <nav className="cabinet-header-nav">
            <NavLink to="/" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`} end>Главная</NavLink>
            <NavLink to="/cabinet" className={({ isActive }) => `cabinet-header-link${isActive ? ' cabinet-header-link--active' : ''}`}>Личный кабинет</NavLink>
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
        {me ? (
          <>
            <table className="cabinet-table">
              <caption className="cabinet-table-caption">Данные профиля</caption>
              <tbody>
                <tr>
                  <th scope="row">Имя</th>
                  <td>{me.name}</td>
                </tr>
                <tr>
                  <th scope="row">Email</th>
                  <td>{me.email}</td>
                </tr>
                <tr>
                  <th scope="row">Телефон</th>
                  <td>{me.phone}</td>
                </tr>
                <tr>
                  <th scope="row">Баланс</th>
                  <td>{me.balance} ₽</td>
                </tr>
                <tr>
                  <th scope="row">Дата регистрации</th>
                  <td>{me.registeredAt}</td>
                </tr>
              </tbody>
            </table>
            <div className="cabinet-actions">
              <button type="button" className="cabinet-edit-btn" onClick={openModal}>
                Изменить данные
              </button>
              <button type="button" className="cabinet-password-btn" onClick={openPasswordModal}>
                Изменить пароль
              </button>
            </div>
          </>
        ) : (
          <p className="cabinet-error">Не удалось загрузить данные. Проверьте авторизацию.</p>
        )}
      </main>

      {passwordModalOpen && (
        <div
          className="cabinet-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closePasswordModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cabinet-password-modal-title"
        >
          <div className="cabinet-modal">
            <h2 id="cabinet-password-modal-title" className="cabinet-modal-title">Изменить пароль</h2>
            <form className="cabinet-modal-form" onSubmit={handlePasswordSubmit}>
              {passwordError && <p className="cabinet-modal-error">{passwordError}</p>}
              <label className="cabinet-modal-label" htmlFor="password-current">Текущий пароль</label>
              <input
                id="password-current"
                type="password"
                className="cabinet-modal-input"
                value={passwordCurrent}
                onChange={(e) => setPasswordCurrent(e.target.value)}
                required
                autoComplete="current-password"
              />
              <label className="cabinet-modal-label" htmlFor="password-new">Новый пароль</label>
              <input
                id="password-new"
                type="password"
                className="cabinet-modal-input"
                value={passwordNew}
                onChange={(e) => setPasswordNew(e.target.value)}
                required
                autoComplete="new-password"
              />
              <label className="cabinet-modal-label" htmlFor="password-confirm">Подтвердите новый пароль</label>
              <input
                id="password-confirm"
                type="password"
                className="cabinet-modal-input"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closePasswordModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={passwordLoading}>
                  {passwordLoading ? '...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className="cabinet-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cabinet-modal-title"
        >
          <div className="cabinet-modal">
            <h2 id="cabinet-modal-title" className="cabinet-modal-title">Изменить данные</h2>
            <form className="cabinet-modal-form" onSubmit={handleEditSubmit}>
              {editError && <p className="cabinet-modal-error">{editError}</p>}
              <label className="cabinet-modal-label" htmlFor="edit-name">Имя</label>
              <input
                id="edit-name"
                type="text"
                className="cabinet-modal-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoComplete="name"
              />
              <label className="cabinet-modal-label" htmlFor="edit-email">Email</label>
              <input
                id="edit-email"
                type="email"
                className="cabinet-modal-input"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                autoComplete="email"
              />
              <label className="cabinet-modal-label" htmlFor="edit-phone">Телефон</label>
              <input
                id="edit-phone"
                type="tel"
                className="cabinet-modal-input"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+79001234567"
                autoComplete="tel"
              />
              <label className="cabinet-modal-label" htmlFor="edit-current-password">Текущий пароль</label>
              <input
                id="edit-current-password"
                type="password"
                className="cabinet-modal-input"
                value={editCurrentPassword}
                onChange={(e) => setEditCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit" disabled={editLoading}>
                  {editLoading ? '...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
