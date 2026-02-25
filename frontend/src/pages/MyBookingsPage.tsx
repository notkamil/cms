import { useCallback, useEffect, useRef, useState } from 'react'
import { get, post, patch, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import './CabinetPage.css'
import './BookingsPage.css'

interface BookingItem {
  id: number
  spaceId: number
  spaceName: string
  startTime: string
  endTime: string
  createdBy: number
  creatorEmail: string | null
  participantMemberIds: number[]
  participantEmails: string[]
  type: string
  status: string
  isCreator: boolean
  isParticipant: boolean
}

interface MyBookingsListResponse {
  current: BookingItem[]
  archive: BookingItem[]
}

function formatISODate(iso: string): string {
  if (!iso || typeof iso !== 'string') return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}.${m}.${y}` : iso
}

function formatISODateTime(iso: string): string {
  if (!iso || typeof iso !== 'string') return '—'
  const datePart = formatISODate(iso)
  const m = iso.match(/T(\d{2}):(\d{2})/)
  const timePart = m ? `${m[1]}:${m[2]}` : ''
  return timePart ? `${datePart} ${timePart}` : datePart
}

function statusLabel(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'Активно'
    case 'cancelled':
      return 'Отменено'
    case 'completed':
      return 'Завершено'
    default:
      return status
  }
}

function paymentLabel(type: string): string {
  return type === 'subscription' ? 'Подписка' : 'Разовая оплата'
}

export default function MyBookingsPage() {
  const [loading, setLoading] = useState(true)
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingStartRef = useRef<number | null>(null)
  const [current, setCurrent] = useState<BookingItem[]>([])
  const [archive, setArchive] = useState<BookingItem[]>([])
  const [cancelLoading, setCancelLoading] = useState<number | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [editBooking, setEditBooking] = useState<BookingItem | null>(null)
  const [editParticipantIds, setEditParticipantIds] = useState<number[]>([])
  const [participantQuery, setParticipantQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; email: string }[]>([])
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const loadList = useCallback(() => {
    return get<MyBookingsListResponse>('/api/me/bookings/list')
  }, [])

  useEffect(() => {
    let cancelled = false
    loadingStartRef.current = Date.now()
    setLoadingElapsed(0)
    setLoading(true)
    loadList()
      .then((data) => {
        if (!cancelled) {
          setCurrent(data.current)
          setArchive(data.archive)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrent([])
          setArchive([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [loadList])

  useEffect(() => {
    if (!loading) return
    const start = loadingStartRef.current ?? Date.now()
    const id = setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (!participantQuery.trim()) {
      setSearchResults([])
      return
    }
    let cancelled = false
    get<{ id: number; name: string; email: string }[]>(
      `/api/me/members/search?q=${encodeURIComponent(participantQuery)}`
    )
      .then((list) => { if (!cancelled) setSearchResults(list) })
      .catch(() => { if (!cancelled) setSearchResults([]) })
    return () => { cancelled = true }
  }, [participantQuery])

  const handleCancel = async (booking: BookingItem) => {
    setCancelError(null)
    setCancelLoading(booking.id)
    try {
      await post(`/api/me/bookings/${booking.id}/cancel`, {})
      loadList().then((data) => {
        setCurrent(data.current)
        setArchive(data.archive)
      })
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Не удалось отменить')
    } finally {
      setCancelLoading(null)
    }
  }

  const openEditModal = (booking: BookingItem) => {
    setEditBooking(booking)
    setEditParticipantIds(booking.participantMemberIds ?? [])
    setParticipantQuery('')
    setSearchResults([])
    setEditError(null)
  }

  const handleSaveParticipants = async () => {
    if (!editBooking) return
    setEditError(null)
    setEditLoading(true)
    try {
      await patch(`/api/me/bookings/${editBooking.id}`, {
        participantMemberIds: editParticipantIds,
      })
      setEditBooking(null)
      loadList().then((data) => {
        setCurrent(data.current)
        setArchive(data.archive)
      })
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Не удалось сохранить')
    } finally {
      setEditLoading(false)
    }
  }

  /** Отмена доступна: активное бронирование, пользователь — владелец или участник, ещё не началось и не менее чем за 2 ч до начала. */
  const canCancel = (b: BookingItem) => {
    if (b.status !== 'confirmed' || !b.isCreator) return false
    const now = Date.now()
    const start = new Date(b.startTime).getTime()
    const end = new Date(b.endTime).getTime()
    if (end <= now) return false
    if (start <= now) return false
    return (start - now) >= 2 * 60 * 60 * 1000
  }

  const canEdit = (b: BookingItem) =>
    b.status === 'confirmed' && b.isCreator

  function renderTable(list: BookingItem[], showActions: boolean) {
    return (
      <table className="cabinet-table">
        <thead>
          <tr>
            <th>Пространство</th>
            <th>Начало</th>
            <th>Окончание</th>
            <th>Основание оплаты</th>
            <th>Владелец</th>
            <th>Статус</th>
            {showActions && <th>Действия</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((b) => (
            <tr key={b.id}>
              <td>{b.spaceName}</td>
              <td>{formatISODateTime(b.startTime)}</td>
              <td>{formatISODateTime(b.endTime)}</td>
              <td>{paymentLabel(b.type)}</td>
              <td>{b.isCreator ? '✓' : '—'}</td>
              <td>{statusLabel(b.status)}</td>
              {showActions && (
                <td>
                  <div className="cabinet-table-actions-cell">
                    {canEdit(b) && (
                      <button
                        type="button"
                        className="cabinet-table-btn"
                        onClick={() => openEditModal(b)}
                      >
                        Изменить
                      </button>
                    )}
                    {canCancel(b) && (
                      <button
                        type="button"
                        className="cabinet-password-btn"
                        disabled={cancelLoading === b.id}
                        onClick={() => handleCancel(b)}
                      >
                        {cancelLoading === b.id ? 'Отмена…' : 'Отменить'}
                      </button>
                    )}
                    {!canEdit(b) && !canCancel(b) && '—'}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    )
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
      <h2 className="cabinet-history-title">Мои брони</h2>
      {cancelError && (
        <p className="cabinet-modal-error" role="alert">{cancelError}</p>
      )}

      <section className="cabinet-section">
        <h3 className="cabinet-section-title">Текущие</h3>
        {current.length === 0 ? (
          <p className="cabinet-muted">Нет текущих бронирований</p>
        ) : (
          renderTable(current, current.some((b) => canEdit(b) || canCancel(b)))
        )}
      </section>

      <section className="cabinet-section">
        <h3 className="cabinet-section-title">Архив</h3>
        {archive.length === 0 ? (
          <p className="cabinet-muted">Нет бронирований в архиве</p>
        ) : (
          renderTable(archive, archive.some((b) => canEdit(b) || canCancel(b)))
        )}
      </section>

      {editBooking && (
        <div className="cabinet-modal-overlay" onClick={() => setEditBooking(null)}>
          <div className="cabinet-modal cabinet-modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Участники бронирования</h3>
            <div className="cabinet-modal-form">
              <p><strong>{editBooking.spaceName}</strong>, {formatISODateTime(editBooking.startTime)}</p>
              {editError && (
                <p className="cabinet-modal-error" role="alert">{editError}</p>
              )}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">Добавить участников (поиск по email/телефону)</label>
                <input
                  type="text"
                  value={participantQuery}
                  onChange={(e) => setParticipantQuery(e.target.value)}
                  placeholder="Введите email или телефон"
                  className="cabinet-modal-input"
                />
                {searchResults.length > 0 && (
                  <ul className="bookings-search-results">
                    {searchResults.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditParticipantIds((prev) =>
                              prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                            )
                          }}
                        >
                          {m.name} ({m.email}) {editParticipantIds.includes(m.id) ? '✓' : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="cabinet-muted">Выбранные участники: {editParticipantIds.length}. Изменение заменит текущий список участников.</p>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={() => setEditBooking(null)}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="cabinet-modal-submit"
                  disabled={editLoading}
                  onClick={handleSaveParticipants}
                >
                  {editLoading ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
