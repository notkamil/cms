import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth, ApiError } from '../context/AuthContext'
import { get, patch, post, put } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import { formatAmount } from '../utils/formatPrice'
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

/** Backend TransactionResponse */
interface TransactionItem {
  transactionDate: string
  amountChange: number
  description: string
}

type Theme = 'light' | 'dark'

/** Member profile: balance, deposit, edit profile, change password. */
export default function CabinetPage() {
  const navigate = useNavigate()
  const { user, token, updateUser } = useAuth()
  const outletContext = useOutletContext<{ theme?: Theme }>()
  const theme = outletContext?.theme ?? 'light'
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingStartRef = useRef<number | null>(null)
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
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositError, setDepositError] = useState<string | null>(null)
  const [depositLoading, setDepositLoading] = useState(false)
  const [transactions, setTransactions] = useState<TransactionItem[]>([])

  useEffect(() => {
    if (!token) {
      navigate('/', { replace: true })
      return
    }
    loadingStartRef.current = Date.now()
    setLoadingElapsed(0)
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
    if (!token || !me) return
    let cancelled = false
    get<TransactionItem[]>('/api/me/transactions')
      .then((data) => { if (!cancelled) setTransactions(data) })
      .catch(() => { if (!cancelled) setTransactions([]) })
    return () => { cancelled = true }
  }, [token, me])

  useEffect(() => {
    if (!loading) return
    const start = loadingStartRef.current ?? Date.now()
    const id = setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [loading])

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

  const openDepositModal = () => {
    setDepositAmount('')
    setDepositError(null)
    setDepositModalOpen(true)
  }

  const closeDepositModal = () => {
    setDepositModalOpen(false)
    setDepositError(null)
  }

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = depositAmount.trim()
    if (!trimmed) {
      setDepositError('Укажите сумму')
      return
    }
    if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(trimmed)) {
      setDepositError('Сумма должна быть положительным числом: только цифры 0–9 и точка, не более двух знаков после запятой')
      return
    }
    const num = parseFloat(trimmed)
    if (num < 0.01) {
      setDepositError('Минимальная сумма пополнения — 0.01')
      return
    }
    setDepositError(null)
    setDepositLoading(true)
    try {
      const updated = await post<Me>('/api/me/balance/deposit', { amount: trimmed })
      setMe(updated)
      updateUser(updated)
      const list = await get<TransactionItem[]>('/api/me/transactions')
      setTransactions(list)
      closeDepositModal()
    } catch (err) {
      setDepositError(err instanceof ApiError ? err.message : 'Не удалось пополнить баланс')
    } finally {
      setDepositLoading(false)
    }
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

  return (
    <div className="cabinet-content">
        {loading ? (
          loadingElapsed >= 1 ? (
            <div className="cabinet-loading-block">
              <LoadingLogo theme={theme} size={64} variant="smooth" />
            </div>
          ) : null
        ) : me ? (
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

            <section className="cabinet-balance-section">
              <div className="cabinet-balance-row">
                <div>
                  <p className="cabinet-balance-label">Баланс</p>
                  <p className="cabinet-balance-value">{formatAmount(me.balance)} ₽</p>
                </div>
                <button type="button" className="cabinet-deposit-btn" onClick={openDepositModal}>
                  Пополнить баланс
                </button>
              </div>
            </section>

            <section className="cabinet-history-section">
              <h2 className="cabinet-history-title">История транзакций</h2>
              {transactions.length === 0 ? (
                <p className="cabinet-history-empty">Пока нет операций</p>
              ) : (
                <table className="cabinet-table cabinet-history-table cabinet-transactions-table">
                  <thead>
                    <tr>
                      <th scope="col">Время</th>
                      <th scope="col">Сумма</th>
                      <th scope="col">Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={i}>
                        <td>{tx.transactionDate}</td>
                        <td className={tx.amountChange >= 0 ? 'cabinet-amount-in' : 'cabinet-amount-out'}>
                          {tx.amountChange >= 0 ? '+' : ''}{formatAmount(tx.amountChange)} ₽
                        </td>
                        <td>{tx.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        ) : (
          <p className="cabinet-error">Не удалось загрузить данные. Проверьте авторизацию</p>
        )}

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
              {passwordError && <p className="cabinet-modal-error" role="alert">{passwordError}</p>}
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

      {depositModalOpen && (
        <div
          className="cabinet-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeDepositModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cabinet-deposit-modal-title"
        >
          <div className="cabinet-modal">
            <h2 id="cabinet-deposit-modal-title" className="cabinet-modal-title">Пополнить баланс</h2>
            <form className="cabinet-modal-form" onSubmit={handleDepositSubmit}>
              {depositError && <p className="cabinet-modal-error" role="alert">{depositError}</p>}
              <label className="cabinet-modal-label" htmlFor="deposit-amount">Сумма (₽)</label>
              <input
                id="deposit-amount"
                type="text"
                inputMode="decimal"
                className="cabinet-modal-input"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                autoComplete="off"
              />
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeDepositModal}>
                  Отмена
                </button>
                <button type="submit" className="cabinet-modal-submit cabinet-deposit-submit" disabled={depositLoading}>
                  {depositLoading ? '...' : 'Пополнить'}
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
              {editError && <p className="cabinet-modal-error" role="alert">{editError}</p>}
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
