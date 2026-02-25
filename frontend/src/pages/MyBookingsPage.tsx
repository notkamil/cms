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

interface SpaceRef {
  id: number
  name: string
  typeName: string
  floor: number
  capacity: number
  description: string
  amenities?: string[]
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

const DEFAULT_CANCEL_BEFORE_HOURS = 2

export default function MyBookingsPage() {
  const [cancelBeforeHours, setCancelBeforeHours] = useState(DEFAULT_CANCEL_BEFORE_HOURS)
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
  const [spaceInfoModal, setSpaceInfoModal] = useState<SpaceRef | null>(null)
  const [spaceInfoLoading, setSpaceInfoLoading] = useState(false)

  const loadList = useCallback(() => {
    return get<MyBookingsListResponse>('/api/me/bookings/list')
  }, [])
  const loadSettings = useCallback(() => get<{ cancelBeforeHours: number }>('/api/me/settings'), [])

  const openSpaceInfo = useCallback((spaceId: number) => {
    setSpaceInfoLoading(true)
    setSpaceInfoModal(null)
    get<SpaceRef>(`/api/me/spaces/${spaceId}`)
      .then(setSpaceInfoModal)
      .catch(() => setSpaceInfoModal(null))
      .finally(() => setSpaceInfoLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    loadSettings()
      .then((s) => { if (!cancelled) setCancelBeforeHours(s.cancelBeforeHours ?? DEFAULT_CANCEL_BEFORE_HOURS) })
      .catch(() => { /* keep default */ })
    return () => { cancelled = true }
  }, [loadSettings])

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

  /** Отмена доступна: активное, владелец, ещё не началось и не менее чем за cancelBeforeHours до начала. */
  const canCancel = (b: BookingItem) => {
    if (b.status !== 'confirmed' || !b.isCreator) return false
    const now = Date.now()
    const start = new Date(b.startTime).getTime()
    const end = new Date(b.endTime).getTime()
    if (end <= now) return false
    if (start <= now) return false
    return (start - now) >= cancelBeforeHours * 60 * 60 * 1000
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
              <td>
                <button
                  type="button"
                  className="cabinet-link"
                  onClick={() => openSpaceInfo(b.spaceId)}
                >
                  {b.spaceName}
                </button>
              </td>
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
              <p>
                <button
                  type="button"
                  className="cabinet-link"
                  onClick={() => openSpaceInfo(editBooking.spaceId)}
                >
                  <strong>{editBooking.spaceName}</strong>
                </button>
                , {formatISODateTime(editBooking.startTime)}
              </p>
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
              <p className="cabinet-muted">Выбранные участники: {editParticipantIds.length}. Изменение заменит текущий список участников</p>
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

      {(spaceInfoModal || spaceInfoLoading) && (
        <div
          className="cabinet-modal-overlay"
          onClick={() => { if (!spaceInfoLoading) setSpaceInfoModal(null) }}
          onKeyDown={(e) => e.key === 'Escape' && !spaceInfoLoading && setSpaceInfoModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="space-info-title"
        >
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="space-info-title" className="cabinet-modal-title">Пространство</h3>
            <div className="cabinet-modal-form">
              {spaceInfoLoading ? (
                <p className="cabinet-muted">Загрузка…</p>
              ) : spaceInfoModal ? (
                <table className="cabinet-table cabinet-subscription-modal-table">
                  <tbody>
                    <tr><th scope="row">Название</th><td>{spaceInfoModal.name}</td></tr>
                    <tr><th scope="row">Тип</th><td>{spaceInfoModal.typeName}</td></tr>
                    <tr><th scope="row">Этаж</th><td>{spaceInfoModal.floor}</td></tr>
                    <tr><th scope="row">Вместимость</th><td>{spaceInfoModal.capacity}</td></tr>
                    <tr><th scope="row">Описание</th><td>{spaceInfoModal.description || '—'}</td></tr>
                    <tr><th scope="row">Удобства</th><td>{spaceInfoModal.amenities?.length ? spaceInfoModal.amenities.join(', ') : '—'}</td></tr>
                  </tbody>
                </table>
              ) : null}
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={() => setSpaceInfoModal(null)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
