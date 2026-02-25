import { useCallback, useEffect, useRef, useState } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import { ru } from 'date-fns/locale/ru'
import { get, post, patch, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import 'react-datepicker/dist/react-datepicker.css'
import './CabinetPage.css'
import './BookingsPage.css'

registerLocale('ru', { ...ru, options: { weekStartsOn: 1 } })

const PX_PER_MINUTE = 2
const TICK_PADDING = 12

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date)
    const part = parts.find((p) => p.type === 'timeZoneName' && p.value)
    if (!part?.value) return 0
    const m = part.value.match(/([+-])(\d{1,2}):?(\d{2})?/)
    if (!m) return 0
    const sign = m[1] === '+' ? 1 : -1
    const h = parseInt(m[2], 10) || 0
    const min = parseInt(m[3], 10) || 0
    return sign * (h * 60 + min) * 60 * 1000
  } catch {
    return 0
  }
}

function dayBoundsMs(selectedDate: string, timeZone: string): { start: number; end: number } {
  const noonUtc = new Date(selectedDate + 'T12:00:00.000Z').getTime()
  const offsetMs = getTimezoneOffsetMs(new Date(noonUtc), timeZone)
  const start = noonUtc - 12 * 60 * 60 * 1000 - offsetMs
  const end = start + 24 * 60 * 60 * 1000
  return { start, end }
}

function getDayOfWeek(isoDate: string): number {
  const d = new Date(isoDate + 'T12:00:00')
  const day = d.getDay()
  return day === 0 ? 7 : day
}

function parseTimeToMinutesFromMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return (h ?? 0) * 60 + (m ?? 0)
}

function bookingSegmentOnDay(
  startTime: string,
  endTime: string,
  selectedDate: string,
  timeZone: string,
  dayStartMinutes: number,
  dayEndMinutes: number
): { leftPx: number; widthPx: number; startM: number; endM: number } | null {
  const { start: dayStartMs, end: dayEndMs } = dayBoundsMs(selectedDate, timeZone)
  const startMs = new Date(startTime).getTime()
  const endMs = new Date(endTime).getTime()
  const clipStartMs = Math.max(startMs, dayStartMs)
  const clipEndMs = Math.min(endMs, dayEndMs)
  if (clipStartMs >= clipEndMs) return null
  const startM = (clipStartMs - dayStartMs) / 60000
  const endM = (clipEndMs - dayStartMs) / 60000
  if (startM >= dayEndMinutes || endM <= dayStartMinutes) return null
  const visibleStart = Math.max(startM, dayStartMinutes)
  const visibleEnd = Math.min(endM, dayEndMinutes)
  const leftPx = TICK_PADDING + (visibleStart - dayStartMinutes) * PX_PER_MINUTE
  const widthPx = Math.max(2, (visibleEnd - visibleStart) * PX_PER_MINUTE)
  return { leftPx, widthPx, startM: visibleStart, endM: visibleEnd }
}

interface Space {
  id: number
  name: string
  floor: number
}

/** Полные данные пространства для модалки (админ — со статусом) */
interface SpaceFull {
  id: number
  name: string
  typeId: number
  typeName: string
  floor: number
  capacity: number
  status: string
  description: string
  amenities?: string[]
}

interface BookingListItem {
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

interface StaffBookingDetail extends BookingListItem {
  subscriptionId?: number | null
  tariffType?: string | null
}

interface WorkingHoursDay {
  dayOfWeek: number
  openingTime: string
  closingTime: string
}

interface StaffSettings {
  timezone: string
  workingHours24_7: boolean
  workingHours: WorkingHoursDay[]
}

function parseISOMinutes(iso: string | undefined): number {
  if (!iso || typeof iso !== 'string') return 0
  const m = iso.match(/T(\d{2}):(\d{2})/)
  if (!m) return 0
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

function formatTime(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60)
  const m = minutesFromMidnight % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatISODate(iso: string | undefined): string {
  if (!iso || typeof iso !== 'string') return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}.${m}.${y}` : iso
}

function getBookingColor(b: BookingListItem): string {
  if (b.status === 'cancelled') return 'var(--booking-cancelled, #c62828)'
  const end = new Date(b.endTime)
  if (end < new Date()) return 'var(--booking-past, #f9a825)'
  return 'var(--booking-other, #757575)'
}

const DEFAULT_SETTINGS: StaffSettings = {
  timezone: 'Europe/Moscow',
  workingHours24_7: true,
  workingHours: [],
}

export default function StaffBookingsPage() {
  const [settings, setSettings] = useState<StaffSettings>(DEFAULT_SETTINGS)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [bookings, setBookings] = useState<BookingListItem[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [loading, setLoading] = useState(true)
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingStartRef = useRef<number | null>(null)
  const [now, setNow] = useState<Date>(() => new Date())
  const [viewBooking, setViewBooking] = useState<StaffBookingDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelFixedRefundChecked, setCancelFixedRefundChecked] = useState(false)
  const [cancelFixedRefundAmount, setCancelFixedRefundAmount] = useState('0')
  const [cancelReturnMinutes, setCancelReturnMinutes] = useState(true)
  const [cancelReturnMoney, setCancelReturnMoney] = useState(true)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [editParticipantsBooking, setEditParticipantsBooking] = useState<StaffBookingDetail | null>(null)
  const [editParticipantIds, setEditParticipantIds] = useState<number[]>([])
  const [participantQuery, setParticipantQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; email: string }[]>([])
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [spaceInfoModal, setSpaceInfoModal] = useState<SpaceFull | null>(null)
  const [spaceInfoLoading, setSpaceInfoLoading] = useState(false)

  const dayOfWeek = getDayOfWeek(selectedDate)
  const dayWh = settings.workingHours.find((w) => w.dayOfWeek === dayOfWeek)
  const hoursStart = settings.workingHours24_7 ? 0 : (dayWh ? parseTimeToMinutesFromMidnight(dayWh.openingTime) : 9 * 60)
  const hoursEnd = settings.workingHours24_7 ? 24 * 60 : (dayWh ? parseTimeToMinutesFromMidnight(dayWh.closingTime) : 21 * 60)
  const trackMinutes = hoursEnd - hoursStart
  const trackTotalWidth = trackMinutes * PX_PER_MINUTE + 2 * TICK_PADDING
  const isToday = selectedDate === new Date().toISOString().slice(0, 10)
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() - hoursStart : null

  const loadSpaces = useCallback(() => get<Space[]>('/api/staff/spaces', true), [])
  const loadSettings = useCallback(() => get<StaffSettings>('/api/staff/settings', true), [])

  const openSpaceInfo = useCallback((spaceId: number) => {
    setSpaceInfoLoading(true)
    setSpaceInfoModal(null)
    get<SpaceFull>(`/api/staff/spaces/${spaceId}`, true)
      .then(setSpaceInfoModal)
      .catch(() => setSpaceInfoModal(null))
      .finally(() => setSpaceInfoLoading(false))
  }, [])
  const loadBookings = useCallback((date: string) => {
    return get<BookingListItem[]>(`/api/staff/bookings?date=${encodeURIComponent(date)}`, true)
  }, [])

  useEffect(() => {
    let cancelled = false
    loadSettings()
      .then((s) => { if (!cancelled) setSettings(s ?? DEFAULT_SETTINGS) })
      .catch(() => { /* keep default */ })
    return () => { cancelled = true }
  }, [loadSettings])

  useEffect(() => {
    let cancelled = false
    loadingStartRef.current = Date.now()
    setLoadingElapsed(0)
    setLoading(true)
    Promise.all([loadSpaces(), loadBookings(selectedDate)])
      .then(([spacesList, bookingsList]) => {
        if (!cancelled) {
          setSpaces(spacesList)
          setBookings(bookingsList)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSpaces([])
          setBookings([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedDate, loadSpaces, loadBookings])

  useEffect(() => {
    if (!loading) return
    const start = loadingStartRef.current ?? Date.now()
    const id = setInterval(() => {
      setLoadingElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (!isToday) return
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [isToday])

  useEffect(() => {
    if (!viewBooking) return
    setDetailLoading(true)
    get<StaffBookingDetail>(`/api/staff/bookings/${viewBooking.id}`, true)
      .then((detail) => setViewBooking(detail))
      .catch(() => setViewBooking(null))
      .finally(() => setDetailLoading(false))
  }, [viewBooking?.id])

  useEffect(() => {
    if (!participantQuery.trim()) {
      setSearchResults([])
      return
    }
    let cancelled = false
    get<{ id: number; name: string; email: string }[]>(
      `/api/staff/members/search?q=${encodeURIComponent(participantQuery)}`,
      true
    )
      .then((list) => { if (!cancelled) setSearchResults(list) })
      .catch(() => { if (!cancelled) setSearchResults([]) })
    return () => { cancelled = true }
  }, [participantQuery])

  const refreshBookings = useCallback(() => {
    loadBookings(selectedDate).then(setBookings)
  }, [selectedDate, loadBookings])

  const openViewBooking = (b: BookingListItem) => {
    setCancelError(null)
    setShowCancelConfirm(false)
    setViewBooking({ ...b, subscriptionId: null, tariffType: null })
  }

  const handleCancelClick = () => {
    if (!viewBooking) return
    if (viewBooking.status !== 'confirmed') return
    const end = new Date(viewBooking.endTime).getTime()
    if (end <= Date.now()) return
    setCancelError(null)
    setCancelFixedRefundChecked(false)
    setCancelFixedRefundAmount('0')
    setShowCancelConfirm(true)
  }

  const handleCancelConfirm = async () => {
    if (!viewBooking) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      const isFixed = viewBooking.tariffType === 'fixed' && viewBooking.subscriptionId != null
      const refundAmount =
        isFixed && cancelFixedRefundChecked
          ? (parseFloat(cancelFixedRefundAmount) || 0)
          : null
      if (isFixed && cancelFixedRefundChecked && (Number.isNaN(parseFloat(cancelFixedRefundAmount)) || (refundAmount ?? 0) < 0)) {
        setCancelError('Укажите неотрицательную сумму возврата')
        setCancelLoading(false)
        return
      }
      await post(
        `/api/staff/bookings/${viewBooking.id}/cancel`,
        isFixed
          ? { refundAmount }
          : { returnMinutes: cancelReturnMinutes, returnMoney: cancelReturnMoney },
        true
      )
      setShowCancelConfirm(false)
      setViewBooking(null)
      refreshBookings()
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Не удалось отменить')
    } finally {
      setCancelLoading(false)
    }
  }

  const openEditParticipants = () => {
    if (!viewBooking) return
    setEditParticipantsBooking(viewBooking)
    setEditParticipantIds(viewBooking.participantMemberIds ?? [])
    setParticipantQuery('')
    setSearchResults([])
    setEditError(null)
  }

  const handleSaveParticipants = async () => {
    if (!editParticipantsBooking) return
    setEditError(null)
    setEditLoading(true)
    try {
      await patch(
        `/api/staff/bookings/${editParticipantsBooking.id}`,
        { participantMemberIds: editParticipantIds },
        true
      )
      setEditParticipantsBooking(null)
      refreshBookings()
      if (viewBooking?.id === editParticipantsBooking.id) {
        setViewBooking((prev) =>
          prev ? { ...prev, participantMemberIds: editParticipantIds } : null
        )
      }
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Не удалось сохранить')
    } finally {
      setEditLoading(false)
    }
  }

  const canCancel = (b: StaffBookingDetail) =>
    b.status === 'confirmed' && new Date(b.endTime).getTime() > Date.now()

  const isFixedBooking = viewBooking?.tariffType === 'fixed' && viewBooking?.subscriptionId != null
  const isPackageSubscription =
    viewBooking?.type === 'subscription' && viewBooking?.tariffType === 'package'

  const summaryCount = bookings.filter((b) => b.status === 'confirmed').length

  if (loading) {
    return loadingElapsed >= 1 ? (
      <div className="cabinet-loading-block">
        <LoadingLogo theme="light" variant="smooth" />
      </div>
    ) : null
  }

  return (
    <div className="cabinet-content cabinet-content--wider">
      <h2 className="cabinet-history-title">Бронирования</h2>
      <div className="bookings-header">
        <div className="bookings-day">
          <label htmlFor="staff-bookings-date">Дата:</label>
          <DatePicker
            id="staff-bookings-date"
            selected={selectedDate ? new Date(selectedDate + 'T12:00:00') : null}
            onChange={(d: Date | null) =>
              setSelectedDate(d ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))
            }
            locale="ru"
            dateFormat="dd.MM.yyyy"
            className="cabinet-modal-input"
            placeholderText="дд.мм.гггг"
            aria-label="Дата бронирований"
          />
        </div>
        <p className="bookings-summary">
          {selectedDate === new Date().toISOString().slice(0, 10)
            ? `Бронирования сегодня: ${summaryCount}`
            : `Бронирования на выбранный день: ${summaryCount}`}
        </p>
      </div>

      <div
        className="bookings-timeline-wrap"
        style={{ ['--track-total-width' as string]: `${trackTotalWidth}px` }}
      >
        <div className="bookings-time-row">
          <div className="bookings-time-corner" aria-hidden />
          <div className="bookings-time-axis" style={{ width: trackTotalWidth, minWidth: trackTotalWidth }}>
            {Array.from({ length: Math.floor(trackMinutes / 60) + 1 }, (_, i) => (
              <div
                key={`line-${i}`}
                className="bookings-hour-line"
                style={{ left: TICK_PADDING + i * 60 * PX_PER_MINUTE }}
                aria-hidden
              />
            ))}
            {Array.from({ length: Math.floor(trackMinutes / 60) + 1 }, (_, i) => Math.floor(hoursStart / 60) + i).map((h) => (
              <div
                key={h}
                className="bookings-time-tick"
                style={{ left: TICK_PADDING + (h * 60 - hoursStart) * PX_PER_MINUTE }}
              >
                {h}:00
              </div>
            ))}
          </div>
        </div>
        <div className="bookings-rows">
          {spaces.map((space) => {
            const { start: dayStartMs, end: dayEndMs } = dayBoundsMs(selectedDate, settings.timezone)
            const spaceBookings = bookings.filter(
              (b) =>
                b.spaceId === space.id &&
                b.status !== 'cancelled' &&
                new Date(b.startTime).getTime() < dayEndMs &&
                new Date(b.endTime).getTime() > dayStartMs
            )
            return (
              <div key={space.id} className="bookings-row">
                <div className="bookings-space-name">
                  <button
                    type="button"
                    className="bookings-space-name-link"
                    onClick={(e) => { e.stopPropagation(); openSpaceInfo(space.id) }}
                  >
                    {space.name}
                  </button>
                </div>
                <div
                  className="bookings-track"
                  style={{ width: trackTotalWidth, minWidth: trackTotalWidth }}
                  onClick={(e) => {
                    const target = e.target as HTMLElement
                    if (target.closest('.booking-block')) return
                  }}
                >
                  {Array.from({ length: Math.floor(trackMinutes / 60) + 1 }, (_, i) => (
                    <div
                      key={i}
                      className="bookings-hour-line"
                      style={{ left: TICK_PADDING + i * 60 * PX_PER_MINUTE }}
                      aria-hidden
                    />
                  ))}
                  {spaceBookings.map((b) => {
                    const seg = bookingSegmentOnDay(b.startTime, b.endTime, selectedDate, settings.timezone, hoursStart, hoursEnd)
                    if (!seg) return null
                    const { leftPx, widthPx, startM, endM } = seg
                    const isShort = widthPx < 70
                    return (
                      <div
                        key={b.id}
                        className={`booking-block booking-block--clickable ${b.status === 'cancelled' ? 'booking-block--cancelled' : ''}`}
                        style={{
                          left: leftPx,
                          width: widthPx,
                          backgroundColor: getBookingColor(b),
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          openViewBooking(b)
                        }}
                        title={b.spaceName}
                      >
                        {isShort ? (
                          <span className="booking-block-time booking-block-time--vertical">
                            <span>{formatTime(startM)}</span>
                            <span className="booking-block-time-sep">–</span>
                            <span>{formatTime(endM)}</span>
                          </span>
                        ) : (
                          <span className="booking-block-time">
                            {formatTime(startM)}–{formatTime(endM)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {isToday && nowMinutes != null && nowMinutes >= 0 && nowMinutes < trackMinutes && (
                    <div
                      className="bookings-now-line"
                      style={{ left: TICK_PADDING + nowMinutes * PX_PER_MINUTE }}
                      aria-hidden
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {viewBooking && (
        <div
          className="cabinet-modal-overlay"
          onClick={() => {
            if (!showCancelConfirm) {
              setViewBooking(null)
              setCancelError(null)
            }
          }}
          onKeyDown={(e) =>
            e.key === 'Escape' && !showCancelConfirm && (setViewBooking(null), setCancelError(null))
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-view-booking-title"
        >
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="staff-view-booking-title" className="cabinet-modal-title">
              Бронирование
            </h3>
            <div className="cabinet-modal-form">
              {detailLoading ? (
                <p className="cabinet-modal-muted">Загрузка…</p>
              ) : (
                <>
                  {cancelError && (
                    <p className="cabinet-modal-error" role="alert">
                      {cancelError}
                    </p>
                  )}
                  {!showCancelConfirm && (
                    <>
                      <dl className="bookings-view-datetime">
                        <dt>Пространство</dt>
                        <dd>
                          <button
                            type="button"
                            className="cabinet-link"
                            onClick={() => openSpaceInfo(viewBooking.spaceId)}
                          >
                            {viewBooking.spaceName ?? '—'}
                          </button>
                        </dd>
                        <dt>Тип</dt>
                        <dd>
                          {viewBooking.type === 'subscription'
                            ? viewBooking.tariffType === 'fixed'
                              ? 'Фикс-подписка'
                              : 'Пакетная подписка'
                            : 'Разовая оплата'}
                        </dd>
                        <dt>Время начала</dt>
                        <dd>
                          {formatISODate(viewBooking.startTime)}{' '}
                          {formatTime(parseISOMinutes(viewBooking.startTime))}
                        </dd>
                        <dt>Время окончания</dt>
                        <dd>
                          {formatISODate(viewBooking.endTime)}{' '}
                          {formatTime(parseISOMinutes(viewBooking.endTime))}
                        </dd>
                        <dt>Создатель</dt>
                        <dd>{viewBooking.creatorEmail ?? '—'}</dd>
                        <dt>Участники</dt>
                        <dd>
                          {(() => {
                            const participants = (viewBooking.participantEmails ?? []).filter(
                              (e) => e !== viewBooking.creatorEmail
                            )
                            return participants.length > 0 ? participants.join(', ') : '—'
                          })()}
                        </dd>
                        <dt>Статус</dt>
                        <dd>
                          {viewBooking.status === 'confirmed'
                            ? 'Активно'
                            : viewBooking.status === 'cancelled'
                              ? 'Отменено'
                              : 'Завершено'}
                        </dd>
                      </dl>
                      <div className="cabinet-modal-actions">
                        <button
                          type="button"
                          className="cabinet-modal-cancel"
                          onClick={() => {
                            setViewBooking(null)
                            setCancelError(null)
                          }}
                        >
                          Закрыть
                        </button>
                        {viewBooking.status === 'confirmed' &&
                          new Date(viewBooking.startTime) > new Date() && (
                            <button
                              type="button"
                              className="cabinet-edit-btn"
                              onClick={openEditParticipants}
                            >
                              Изменить участников
                            </button>
                          )}
                        {canCancel(viewBooking) && (
                          <button
                            type="button"
                            className="cabinet-password-btn"
                            onClick={handleCancelClick}
                          >
                            Отменить бронирование
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  {showCancelConfirm && (
                    <>
                      <p className={isFixedBooking ? undefined : 'cabinet-modal-muted'}>
                        {isFixedBooking
                          ? 'Это бронирование по фикс-подписке. Вместе с ним будет отменена соответствующая подписка'
                          : isPackageSubscription
                            ? 'Вернуть минуты на подписку?'
                            : 'Подтвердите отмену бронирования'}
                      </p>
                      {isFixedBooking && (
                        <>
                          <div className="cabinet-modal-field" style={{ marginTop: '1rem' }}>
                            <label className="cabinet-modal-label">
                              <input
                                type="checkbox"
                                checked={cancelFixedRefundChecked}
                                onChange={(e) => setCancelFixedRefundChecked(e.target.checked)}
                              />
                              {' '}Сделать возврат
                            </label>
                          </div>
                          {cancelFixedRefundChecked && (
                            <div className="cabinet-modal-field">
                              <label className="cabinet-modal-label" htmlFor="staff-booking-refund-amount">
                                Сумма возврата (₽)
                              </label>
                              <input
                                id="staff-booking-refund-amount"
                                type="number"
                                min={0}
                                step={0.01}
                                value={cancelFixedRefundAmount}
                                onChange={(e) => setCancelFixedRefundAmount(e.target.value)}
                                className="cabinet-modal-input"
                                placeholder="0"
                              />
                            </div>
                          )}
                        </>
                      )}
                      {!isFixedBooking && isPackageSubscription && (
                        <div className="cabinet-modal-field">
                          <label className="cabinet-modal-label">
                            <input
                              type="checkbox"
                              checked={cancelReturnMinutes}
                              onChange={(e) => setCancelReturnMinutes(e.target.checked)}
                            />
                            {' '}Вернуть минуты на подписку
                          </label>
                        </div>
                      )}
                      {!isFixedBooking && viewBooking?.type === 'one_time' && (
                        <div className="cabinet-modal-field">
                          <label className="cabinet-modal-label">
                            <input
                              type="checkbox"
                              checked={cancelReturnMoney}
                              onChange={(e) => setCancelReturnMoney(e.target.checked)}
                            />
                            {' '}Вернуть деньги за бронирование
                          </label>
                        </div>
                      )}
                      <div className="cabinet-modal-actions">
                        <button
                          type="button"
                          className="cabinet-modal-cancel"
                          onClick={() => {
                            setShowCancelConfirm(false)
                            setCancelError(null)
                          }}
                        >
                          Назад
                        </button>
                        <button
                          type="button"
                          className="cabinet-password-btn"
                          disabled={cancelLoading}
                          onClick={handleCancelConfirm}
                        >
                          {cancelLoading ? 'Отмена…' : 'Подтвердить отмену'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {editParticipantsBooking && (
        <div
          className="cabinet-modal-overlay"
          onClick={() => {
            setEditParticipantsBooking(null)
            setEditError(null)
          }}
        >
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Изменить участников</h3>
            <div className="cabinet-modal-form">
              {editError && (
                <p className="cabinet-modal-error" role="alert">
                  {editError}
                </p>
              )}
              <p>
                <strong>{editParticipantsBooking.spaceName}</strong>,{' '}
                {formatISODate(editParticipantsBooking.startTime)}{' '}
                {formatTime(parseISOMinutes(editParticipantsBooking.startTime))}–
                {formatTime(parseISOMinutes(editParticipantsBooking.endTime))}
              </p>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">Поиск по email или телефону</label>
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
              <p className="cabinet-modal-muted">
                Выбрано участников: {editParticipantIds.length} (создатель в список не входит)
              </p>
              <div className="cabinet-modal-actions">
                <button
                  type="button"
                  className="cabinet-modal-cancel"
                  onClick={() => {
                    setEditParticipantsBooking(null)
                    setEditError(null)
                  }}
                >
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
          aria-labelledby="staff-space-info-title"
        >
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="staff-space-info-title" className="cabinet-modal-title">Пространство</h3>
            <div className="cabinet-modal-form">
              {spaceInfoLoading ? (
                <p className="cabinet-modal-muted">Загрузка…</p>
              ) : spaceInfoModal ? (
                <table className="cabinet-table cabinet-subscription-modal-table">
                  <tbody>
                    <tr><th scope="row">Название</th><td>{spaceInfoModal.name}</td></tr>
                    <tr><th scope="row">Тип</th><td>{spaceInfoModal.typeName}</td></tr>
                    <tr><th scope="row">Этаж</th><td>{spaceInfoModal.floor}</td></tr>
                    <tr><th scope="row">Вместимость</th><td>{spaceInfoModal.capacity}</td></tr>
                    <tr><th scope="row">Статус</th><td>{spaceInfoModal.status === 'available' ? 'Свободно' : spaceInfoModal.status === 'occupied' ? 'Занято' : spaceInfoModal.status === 'maintenance' ? 'Ремонт' : spaceInfoModal.status === 'disabled' ? 'Архивное' : spaceInfoModal.status}</td></tr>
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
