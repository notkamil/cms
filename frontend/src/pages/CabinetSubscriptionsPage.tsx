import { useCallback, useEffect, useState } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import ru from 'date-fns/locale/ru'
import { get, post, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import 'react-datepicker/dist/react-datepicker.css'
import './CabinetPage.css'

registerLocale('ru', { ...ru, options: { weekStartsOn: 1 } })

interface Subscription {
  id: number
  tariffName: string
  startDate: string
  endDate: string
  remainingMinutes: number
  status: string
}

interface SubscriptionsData {
  current: Subscription[]
  archived: Subscription[]
}

interface AvailableTariff {
  id: number
  name: string
  type: string
  durationDays: number
  includedHours: number
  price: string
}

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

/** Остаток подписки: 0 → «Безлимит», иначе «Ч:ММ» */
function formatRemainingMinutes(minutes: number): string {
  if (minutes === 0) return 'Безлимит'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function formatIncludedHours(hours: number): string {
  return hours === 0 ? 'Безлимит' : String(hours)
}

/** ISO date YYYY-MM-DD -> DD.MM.YYYY */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}.${m}.${y}` : iso
}

/** Добавить дни к дате YYYY-MM-DD, вернуть YYYY-MM-DD */
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Цена: без копеек, если они нулевые (100.00 → 100, 99.50 → 99.50) */
function formatPrice(price: string): string {
  if (/\.00$/.test(price)) return price.replace(/\.00$/, '')
  return price
}

export default function CabinetSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionsData | null>(null)
  const [availableTariffs, setAvailableTariffs] = useState<AvailableTariff[]>([])
  const [loading, setLoading] = useState(true)
  const [subscribeTariffId, setSubscribeTariffId] = useState<number | null>(null)
  const [subscribeStartDate, setSubscribeStartDate] = useState<string>(todayISO())
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const [subscribeLoading, setSubscribeLoading] = useState(false)

  const loadAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      get<SubscriptionsData>('/api/me/subscriptions'),
      get<AvailableTariff[]>('/api/me/tariffs/available'),
    ])
      .then(([subs, tariffs]) => {
        setSubscriptions(subs)
        setAvailableTariffs(tariffs)
      })
      .catch(() => {
        setSubscriptions({ current: [], archived: [] })
        setAvailableTariffs([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const openSubscribe = (tariffId: number) => {
    setSubscribeTariffId(tariffId)
    setSubscribeStartDate(todayISO())
    setSubscribeError(null)
  }

  const closeSubscribe = () => {
    setSubscribeTariffId(null)
    setSubscribeError(null)
  }

  const confirmSubscribe = async () => {
    if (subscribeTariffId == null) return
    setSubscribeLoading(true)
    setSubscribeError(null)
    try {
      await post('/api/me/subscriptions', {
        tariffId: subscribeTariffId,
        startDate: subscribeStartDate,
      })
      loadAll()
      closeSubscribe()
    } catch (err) {
      setSubscribeError(err instanceof ApiError ? err.message : 'Не удалось оформить подписку')
    } finally {
      setSubscribeLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="cabinet-loading-block">
        <LoadingLogo />
        <p className="cabinet-loading">Загрузка подписок…</p>
      </div>
    )
  }

  const current = subscriptions?.current ?? []
  const archived = subscriptions?.archived ?? []
  const selectedTariff = subscribeTariffId != null ? availableTariffs.find((t) => t.id === subscribeTariffId) : null

  return (
    <div className="cabinet-content cabinet-content--wider">
      <h2 className="cabinet-history-title">Подписки</h2>

      {/* Текущие подписки */}
      <h3 className="cabinet-history-title" style={{ marginTop: '1.5rem', fontSize: '1rem' }}>
        Текущие подписки
      </h3>
      {current.length === 0 ? (
        <p className="cabinet-history-empty">Нет активных подписок</p>
      ) : (
        <table className="cabinet-table cabinet-history-table" aria-label="Текущие подписки">
          <thead>
            <tr>
              <th scope="col">Тариф</th>
              <th scope="col">Дата начала</th>
              <th scope="col">Дата окончания</th>
              <th scope="col">Оставшиеся часы</th>
              <th scope="col">Статус</th>
            </tr>
          </thead>
          <tbody>
            {current.map((sub) => (
              <tr key={sub.id}>
                <td>{sub.tariffName}</td>
                <td>{formatDate(sub.startDate)}</td>
                <td>{formatDate(sub.endDate)}</td>
                <td>{formatRemainingMinutes(sub.remainingMinutes)}</td>
                <td>{STATUS_LABELS[sub.status] ?? sub.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Архивные подписки */}
      <h3 className="cabinet-history-title" style={{ marginTop: '1.5rem', fontSize: '1rem' }}>
        Архивные подписки
      </h3>
      {archived.length === 0 ? (
        <p className="cabinet-history-empty">Нет архивных подписок</p>
      ) : (
        <table className="cabinet-table cabinet-history-table" aria-label="Архивные подписки">
          <thead>
            <tr>
              <th scope="col">Тариф</th>
              <th scope="col">Дата начала</th>
              <th scope="col">Дата окончания</th>
              <th scope="col">Оставшиеся часы</th>
              <th scope="col">Статус</th>
            </tr>
          </thead>
          <tbody>
            {archived.map((sub) => (
              <tr key={sub.id}>
                <td>{sub.tariffName}</td>
                <td>{formatDate(sub.startDate)}</td>
                <td>{formatDate(sub.endDate)}</td>
                <td>{formatRemainingMinutes(sub.remainingMinutes)}</td>
                <td>{STATUS_LABELS[sub.status] ?? sub.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Оформить подписку: только фикс и пакеты */}
      <h3 className="cabinet-history-title" style={{ marginTop: '1.5rem', fontSize: '1rem' }}>
        Оформить подписку
      </h3>
      <p className="cabinet-subscriptions-hint" style={{ marginBottom: '0.75rem', color: 'var(--cabinet-text-muted)', fontSize: '0.9rem' }}>
        Доступны только тарифы «Фикс» и «Пакет». Почасовой тариф оформляется при бронировании.
      </p>
      {availableTariffs.length === 0 ? (
        <p className="cabinet-history-empty">Нет доступных тарифов для оформления</p>
      ) : (
        <table className="cabinet-table cabinet-history-table cabinet-tariffs-available-table" aria-label="Доступные тарифы">
          <thead>
            <tr>
              <th scope="col">Название</th>
              <th scope="col">Тип</th>
              <th scope="col">Дней</th>
              <th scope="col">Часы</th>
              <th scope="col">Цена</th>
              <th scope="col">Действие</th>
            </tr>
          </thead>
          <tbody>
            {availableTariffs.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{TARIFF_TYPE_LABELS[t.type] ?? t.type}</td>
                <td>{t.durationDays}</td>
                <td>{formatIncludedHours(t.includedHours)}</td>
                <td>{formatPrice(t.price)} ₽</td>
                <td>
                  <button
                    type="button"
                    className="cabinet-edit-btn"
                    onClick={() => openSubscribe(t.id)}
                  >
                    Оформить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Модалка оформления подписки */}
      {subscribeTariffId != null && selectedTariff && (
        <div className="cabinet-modal-overlay" onClick={closeSubscribe}>
          <div className="cabinet-modal cabinet-modal--subscription" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Оформить подписку</h3>
            <div className="cabinet-modal-form">
              {subscribeError && <p className="cabinet-modal-error">{subscribeError}</p>}
              <table className="cabinet-subscription-modal-table" aria-label="Параметры тарифа">
                <tbody>
                  <tr>
                    <th scope="row">Название</th>
                    <td>{selectedTariff.name}</td>
                  </tr>
                  <tr>
                    <th scope="row">Длительность</th>
                    <td>{selectedTariff.durationDays} дн.</td>
                  </tr>
                  <tr>
                    <th scope="row">Включенные часы</th>
                    <td>{formatIncludedHours(selectedTariff.includedHours)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Дата начала</th>
                    <td>
                      <DatePicker
                        selected={subscribeStartDate ? new Date(subscribeStartDate + 'T12:00:00') : null}
                        onChange={(d) => setSubscribeStartDate(d ? d.toISOString().slice(0, 10) : todayISO())}
                        locale="ru"
                        dateFormat="dd.MM.yyyy"
                        minDate={new Date()}
                        className="cabinet-modal-input"
                        placeholderText="дд.мм.гггг"
                        aria-label="Дата начала подписки"
                      />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Дата окончания</th>
                    <td>{formatDate(addDays(subscribeStartDate, selectedTariff.durationDays))}</td>
                  </tr>
                  <tr>
                    <th scope="row">Стоимость</th>
                    <td>{formatPrice(selectedTariff.price)} ₽</td>
                  </tr>
                </tbody>
              </table>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={closeSubscribe}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="cabinet-modal-submit"
                  disabled={subscribeLoading}
                  onClick={confirmSubscribe}
                >
                  {subscribeLoading ? 'Оформление…' : 'Оформить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
