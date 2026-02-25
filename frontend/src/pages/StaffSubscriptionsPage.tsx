import { useCallback, useEffect, useRef, useState } from 'react'
import { get, post, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import { formatAmount } from '../utils/formatPrice'
import '../pages/CabinetPage.css'
import '../pages/StaffCabinetPage.css'

const TARIFF_TYPE_LABELS: Record<string, string> = {
  fixed: 'Фикс',
  hourly: 'Почасовой',
  package: 'Пакет',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  expired: 'Истекла',
  cancelled: 'Отменена',
}

interface StaffSubscription {
  id: number
  tariffName: string
  memberEmail: string
  type: string
  startDate: string
  endDate: string
  remainingMinutes: number
  status: string
  paymentAmount?: number | null
}

/** ISO yyyy-MM-dd -> dd.MM.yyyy */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}.${m}.${y}` : iso
}

/** Остаток подписки: 0 → «Безлимит», иначе «Ч:ММ» */
function formatRemainingMinutes(minutes: number): string {
  if (minutes === 0) return 'Безлимит'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export default function StaffSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<StaffSubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingStartRef = useRef<number | null>(null)
  const [cancelTarget, setCancelTarget] = useState<StaffSubscription | null>(null)
  const [refundChecked, setRefundChecked] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  const loadAll = useCallback(() => {
    loadingStartRef.current = Date.now()
    setLoadingElapsed(0)
    setLoading(true)
    get<StaffSubscription[]>('/api/staff/subscriptions', true)
      .then(setSubscriptions)
      .catch(() => setSubscriptions([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!loading) return
    const start = loadingStartRef.current ?? Date.now()
    const id = setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [loading])

  const openCancel = (sub: StaffSubscription) => {
    setCancelTarget(sub)
    setRefundChecked(false)
    setRefundAmount(sub.paymentAmount != null ? String(sub.paymentAmount) : '')
    setCancelError(null)
  }

  const closeCancel = () => {
    setCancelTarget(null)
    setCancelError(null)
  }

  const submitCancel = async () => {
    if (!cancelTarget) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      const body: { refundAmount?: number } = {}
      if (refundChecked && refundAmount.trim() !== '') {
        const num = parseFloat(refundAmount.trim().replace(',', '.'))
        if (!Number.isFinite(num) || num < 0) {
          setCancelError('Укажите неотрицательную сумму возврата')
          setCancelLoading(false)
          return
        }
        const maxRefund = cancelTarget.paymentAmount ?? 0
        if (num > maxRefund) {
          setCancelError(`Сумма возврата не может превышать сумму оплаты (${formatAmount(maxRefund)} ₽)`)
          setCancelLoading(false)
          return
        }
        body.refundAmount = num
      }
      await post(`/api/staff/subscriptions/${cancelTarget.id}/cancel`, body, true)
      loadAll()
      closeCancel()
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Не удалось отменить подписку')
    } finally {
      setCancelLoading(false)
    }
  }

  if (loading) {
    return loadingElapsed >= 1 ? (
      <div className="cabinet-loading-block">
        <LoadingLogo theme="light" variant="smooth" />
      </div>
    ) : null
  }

  return (
    <div className="cabinet-content cabinet-content--wider">
      <h2 className="cabinet-history-title">Подписки</h2>
      <p className="cabinet-history-empty" style={{ marginBottom: '1rem', color: 'var(--cabinet-text-muted)', fontSize: '0.9rem' }}>
        Все подписки пользователей коворкинга
      </p>
      {subscriptions.length === 0 ? (
        <p className="cabinet-history-empty">Нет подписок</p>
      ) : (
        <table className="cabinet-table cabinet-history-table" aria-label="Подписки">
          <thead>
            <tr>
              <th scope="col">Название подписки</th>
              <th scope="col">Почта оформившего</th>
              <th scope="col">Тип</th>
              <th scope="col">Дата начала</th>
              <th scope="col">Дата окончания</th>
              <th scope="col">Остаток</th>
              <th scope="col">Статус</th>
              <th scope="col">Действия</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((sub) => (
              <tr key={sub.id}>
                <td>{sub.tariffName}</td>
                <td>{sub.memberEmail}</td>
                <td>{TARIFF_TYPE_LABELS[sub.type] ?? sub.type}</td>
                <td>{formatDate(sub.startDate)}</td>
                <td>{formatDate(sub.endDate)}</td>
                <td>{formatRemainingMinutes(sub.remainingMinutes)}</td>
                <td>{STATUS_LABELS[sub.status] ?? sub.status}</td>
                <td>
                  {sub.status === 'active' && (
                    <button
                      type="button"
                      className="cabinet-password-btn"
                      onClick={() => openCancel(sub)}
                    >
                      Отменить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cancelTarget && (
        <div className="cabinet-modal-overlay" onClick={closeCancel}>
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Отменить подписку</h3>
            <div className="cabinet-modal-form">
              <p>
                Отменить подписку «{cancelTarget.tariffName}» (оформил {cancelTarget.memberEmail})?
              </p>
              {cancelTarget.paymentAmount != null && cancelTarget.paymentAmount > 0 && (
                <>
                  <div className="cabinet-modal-field" style={{ marginTop: '1rem' }}>
                    <label className="cabinet-modal-label">
                      <input
                        type="checkbox"
                        checked={refundChecked}
                        onChange={(e) => setRefundChecked(e.target.checked)}
                      />
                      {' '}Выполнить возврат
                    </label>
                  </div>
                  {refundChecked && (
                    <div className="cabinet-modal-field">
                      <label className="cabinet-modal-label" htmlFor="staff-refund-amount">
                        Сумма возврата (₽), от 0 до {formatAmount(cancelTarget.paymentAmount)}
                      </label>
                      <input
                        id="staff-refund-amount"
                        type="number"
                        min={0}
                        max={cancelTarget.paymentAmount}
                        step={0.01}
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="cabinet-modal-input"
                        placeholder="0"
                      />
                    </div>
                  )}
                </>
              )}
              {cancelError && <p className="cabinet-modal-error" role="alert">{cancelError}</p>}
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeCancel}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="cabinet-modal-submit"
                  disabled={cancelLoading}
                  onClick={submitCancel}
                >
                  {cancelLoading ? 'Подтверждение…' : 'Подтвердить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
