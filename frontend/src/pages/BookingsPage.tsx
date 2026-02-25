import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import { ru } from 'date-fns/locale/ru'
import { get, post, patch, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import { formatPrice, formatAmount } from '../utils/formatPrice'
import 'react-datepicker/dist/react-datepicker.css'
import './CabinetPage.css'
import './BookingsPage.css'

registerLocale('ru', { ...ru, options: { weekStartsOn: 1 } })

const PX_PER_MINUTE = 2
const TICK_PADDING = 12

/** Timezone offset in ms at date (positive = TZ ahead of UTC). */
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

/** Selected day bounds in workspace TZ (ms). */
function dayBoundsMs(selectedDate: string, timeZone: string): { start: number; end: number } {
  const noonUtc = new Date(selectedDate + 'T12:00:00.000Z').getTime()
  const offsetMs = getTimezoneOffsetMs(new Date(noonUtc), timeZone)
  const start = noonUtc - 12 * 60 * 60 * 1000 - offsetMs
  const end = start + 24 * 60 * 60 * 1000
  return { start, end }
}

/** ISO day of week (1=Mon, 7=Sun) for YYYY-MM-DD. */
function getDayOfWeek(isoDate: string): number {
  const d = new Date(isoDate + 'T12:00:00')
  const day = d.getDay()
  return day === 0 ? 7 : day
}

/** Booking segment for selected day: left/width px, startM/endM minutes from day work start. */
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

/** Space data for modal (user view, no status). */
interface SpaceRef {
  id: number
  name: string
  typeName: string
  floor: number
  capacity: number
  description: string
  amenities?: string[]
}

interface Booking {
  id: number
  spaceId: number
  spaceName: string
  startTime: string
  endTime: string
  createdBy: number
  creatorEmail: string | null
  participantMemberIds?: number[]
  participantEmails: string[]
  type: string
  status: string
  isCreator: boolean
  isParticipant: boolean
}

interface Subscription {
  id: number
  tariffName: string
  remainingMinutes: number
  status: string
}

interface Tariff {
  id: number
  name: string
  type: string
  price: string
}

interface WorkingHoursDay {
  dayOfWeek: number
  openingTime: string
  closingTime: string
}

interface BookingSettings {
  timezone: string
  workingHours24_7: boolean
  workingHours: WorkingHoursDay[]
  slotMinutes: number
  maxBookingDaysAhead: number
  minBookingMinutes: number
  cancelBeforeHours: number
}

function parseTimeToMinutesFromMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10))
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Minutes from midnight from ISO time string (server uses workspace TZ). */
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

/** Format ISO date YYYY-MM-DD to DD.MM.YYYY */
function formatISODate(iso: string | undefined): string {
  if (!iso || typeof iso !== 'string') return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}.${m}.${y}` : iso
}

function getBookingColor(b: Booking): string {
  if (b.status === 'cancelled') return 'var(--booking-cancelled, #c62828)'
  const now = new Date()
  const end = new Date(b.endTime)
  if (end < now) return 'var(--booking-past, #f9a825)'
  if (b.isCreator) return 'var(--booking-mine, #2e7d32)'
  if (b.isParticipant) return 'var(--booking-participant, #1565c0)'
  return 'var(--booking-other, #757575)'
}

/** Cancel allowed: confirmed, owner, not started, at least cancelBeforeHours before start. */
function canCancelBooking(b: Booking, cancelBeforeHours: number): boolean {
  if (b.status !== 'confirmed' || !b.isCreator) return false
  const now = Date.now()
  const start = new Date(b.startTime).getTime()
  const end = new Date(b.endTime).getTime()
  if (end <= now) return false
  if (start <= now) return false
  return start - now >= cancelBeforeHours * 60 * 60 * 1000
}

const DEFAULT_SETTINGS: BookingSettings = {
  timezone: 'Europe/Moscow',
  workingHours24_7: false,
  workingHours: [],
  slotMinutes: 15,
  maxBookingDaysAhead: 60,
  minBookingMinutes: 60,
  cancelBeforeHours: 2,
}

export default function BookingsPage() {
  const [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [hourlyTariffs, setHourlyTariffs] = useState<Tariff[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [loading, setLoading] = useState(true)
  const [loadingElapsed, setLoadingElapsed] = useState(0)
  const loadingStartRef = useRef<number | null>(null)
  const [now, setNow] = useState<Date>(() => new Date())
  const [viewBooking, setViewBooking] = useState<Booking | null>(null)
  const [spaceInfoModal, setSpaceInfoModal] = useState<SpaceRef | null>(null)
  const [spaceInfoLoading, setSpaceInfoLoading] = useState(false)
  const [createSlot, setCreateSlot] = useState<{ spaceId: number; spaceName: string; startMinutes: number } | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createSource, setCreateSource] = useState<'subscription' | 'one_time' | 'none'>('subscription')
  const [createSubscriptionId, setCreateSubscriptionId] = useState<number | null>(null)
  const [createTariffId, setCreateTariffId] = useState<number | null>(null)
  const [createStartDate, setCreateStartDate] = useState<string>('')
  const [createEndDate, setCreateEndDate] = useState<string>('')
  const [createStartMinutes, setCreateStartMinutes] = useState<number>(0)
  const [createEndMinutes, setCreateEndMinutes] = useState<number>(60)
  const [createTimeError, setCreateTimeError] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [participantQuery, setParticipantQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; email: string }[]>([])
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<number[]>([])
  const [editParticipantsBooking, setEditParticipantsBooking] = useState<Booking | null>(null)
  const [editParticipantIds, setEditParticipantIds] = useState<number[]>([])
  const [editParticipantQuery, setEditParticipantQuery] = useState('')
  const [editSearchResults, setEditSearchResults] = useState<{ id: number; name: string; email: string }[]>([])
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const dayOfWeek = getDayOfWeek(selectedDate)
  const dayWh = settings.workingHours.find((w) => w.dayOfWeek === dayOfWeek)
  const hoursStart = settings.workingHours24_7 ? 0 : (dayWh ? parseTimeToMinutesFromMidnight(dayWh.openingTime) : 9 * 60)
  const hoursEnd = settings.workingHours24_7 ? 24 * 60 : (dayWh ? parseTimeToMinutesFromMidnight(dayWh.closingTime) : 21 * 60)
  const trackMinutes = hoursEnd - hoursStart
  const trackWidth = trackMinutes * PX_PER_MINUTE
  const trackTotalWidth = trackWidth + 2 * TICK_PADDING
  const isToday = selectedDate === new Date().toISOString().slice(0, 10)
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() - hoursStart : null

  const loadSpaces = useCallback(() => {
    return get<Space[]>('/api/me/spaces')
  }, [])
  const loadBookings = useCallback((date: string) => {
    return get<Booking[]>(`/api/me/bookings?date=${encodeURIComponent(date)}`)
  }, [])
  const loadSubscriptions = useCallback((spaceId?: number) => {
    const params = new URLSearchParams({ forBooking: '1' })
    if (spaceId != null) params.set('spaceId', String(spaceId))
    return get<{ current: Subscription[] }>(`/api/me/subscriptions?${params}`).then((r) => r.current)
  }, [])
  const loadHourlyTariffs = useCallback((spaceId?: number) => {
    const q = spaceId != null ? `?spaceId=${encodeURIComponent(spaceId)}` : ''
    return get<Tariff[]>(`/api/me/tariffs/hourly${q}`)
  }, [])

  const loadSettings = useCallback(() => get<BookingSettings>('/api/me/settings'), [])

  useEffect(() => {
    let cancelled = false
    loadingStartRef.current = Date.now()
    setLoadingElapsed(0)
    setLoading(true)
    Promise.all([
      loadSettings(),
      loadSpaces(),
      loadBookings(selectedDate),
      loadSubscriptions(),
      loadHourlyTariffs(),
    ])
      .then(([settingsData, spacesList, bookingsList, subs, tariffs]) => {
        if (!cancelled) {
          setSettings(settingsData ?? DEFAULT_SETTINGS)
          setSpaces(spacesList)
          setBookings(bookingsList)
          setSubscriptions(subs)
          setHourlyTariffs(tariffs)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSpaces([])
          setBookings([])
          setSubscriptions([])
          setHourlyTariffs([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedDate, loadSettings, loadSpaces, loadBookings, loadSubscriptions, loadHourlyTariffs])

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
    if (!createSlot) return
    Promise.all([
      loadSubscriptions(createSlot.spaceId),
      loadHourlyTariffs(createSlot.spaceId),
    ]).then(([subs, tariffs]) => {
      setSubscriptions(subs)
      setHourlyTariffs(tariffs)
      setCreateSubscriptionId(subs[0]?.id ?? null)
      setCreateTariffId(tariffs[0]?.id ?? null)
      if (subs.length > 0) setCreateSource('subscription')
      else if (tariffs.length > 0) setCreateSource('one_time')
      else setCreateSource('none')
    })
  }, [createSlot?.spaceId, loadSubscriptions, loadHourlyTariffs])

  const openSpaceInfo = useCallback((spaceId: number) => {
    setSpaceInfoLoading(true)
    setSpaceInfoModal(null)
    get<SpaceRef>(`/api/me/spaces/${spaceId}`)
      .then(setSpaceInfoModal)
      .catch(() => setSpaceInfoModal(null))
      .finally(() => setSpaceInfoLoading(false))
  }, [])

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>, spaceId: number, spaceName: string) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left - TICK_PADDING
    const slotSize = settings.slotMinutes
    const minutes = Math.floor(x / PX_PER_MINUTE) + hoursStart
    const slot = Math.floor(minutes / slotSize) * slotSize
    if (slot < hoursStart || slot >= hoursEnd) return
    const startFromMidnight = slot
    const defaultDurationMinutes = Math.max(settings.minBookingMinutes, slotSize)
    const rawEndMinutes = startFromMidnight + defaultDurationMinutes
    const endSpansNextDay = rawEndMinutes >= 24 * 60
    const endDate = endSpansNextDay
      ? (() => {
          const d = new Date(selectedDate + 'T12:00:00')
          d.setDate(d.getDate() + 1)
          return d.toISOString().slice(0, 10)
        })()
      : selectedDate
    const endMinutes = endSpansNextDay ? rawEndMinutes % (24 * 60) : rawEndMinutes
    setCreateSlot({ spaceId, spaceName, startMinutes: slot })
    setCreateStartDate(selectedDate)
    setCreateEndDate(endDate)
    setCreateStartMinutes(startFromMidnight)
    setCreateEndMinutes(endMinutes)
    setCreateTimeError(null)
    setCreateSource('subscription')
    setCreateSubscriptionId(subscriptions[0]?.id ?? null)
    setCreateTariffId(hourlyTariffs[0]?.id ?? null)
    setSelectedParticipantIds([])
  }

  const handleCancelBooking = async () => {
    if (!viewBooking) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      await post(`/api/me/bookings/${viewBooking.id}/cancel`, {})
      setViewBooking(null)
      loadBookings(selectedDate).then(setBookings)
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
    setEditParticipantQuery('')
    setEditError(null)
  }

  const handleSaveEditParticipants = async () => {
    if (!editParticipantsBooking) return
    setEditError(null)
    setEditLoading(true)
    try {
      await patch(
        `/api/me/bookings/${editParticipantsBooking.id}`,
        { participantMemberIds: editParticipantIds },
        false
      )
      setEditParticipantsBooking(null)
      loadBookings(selectedDate).then(setBookings)
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

  const validateCreateTime = (): boolean => {
    const slot = settings.slotMinutes
    if (createStartMinutes % slot !== 0 || createEndMinutes % slot !== 0) {
      setCreateTimeError(`Время начала и окончания должны быть кратны ${slot} минутам (например, 10:00, 10:${String(slot).padStart(2, '0')}).`)
      return false
    }
    const startStr = `${createStartDate}T${formatTime(createStartMinutes)}:00`
    const endStr = `${createEndDate}T${formatTime(createEndMinutes)}:00`
    if (startStr >= endStr) {
      setCreateTimeError('Дата и время окончания должны быть позже даты и времени начала.')
      return false
    }
    setCreateTimeError(null)
    return true
  }

  const handleCreateBooking = async () => {
    if (!createSlot) return
    if (!validateCreateTime()) return
    const startTime = `${createStartDate}T${formatTime(createStartMinutes)}:00`
    const endTime = `${createEndDate}T${formatTime(createEndMinutes)}:00`
    const body = {
      spaceId: createSlot.spaceId,
      startTime,
      endTime,
      bookingType: createSource,
      subscriptionId: createSource === 'subscription' ? createSubscriptionId : null,
      tariffId: createSource === 'one_time' ? createTariffId : null,
      participantMemberIds: selectedParticipantIds,
    }
    setCreateLoading(true)
    setCreateError(null)
    try {
      await post('/api/me/bookings', body)
      setCreateSlot(null)
      loadBookings(selectedDate).then(setBookings)
      loadSubscriptions().then(setSubscriptions)
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Не удалось создать бронирование')
    } finally {
      setCreateLoading(false)
    }
  }

  useEffect(() => {
    if (!participantQuery.trim()) {
      setSearchResults([])
      return
    }
    let cancelled = false
    get<{ id: number; name: string; email: string }[]>(`/api/me/members/search?q=${encodeURIComponent(participantQuery)}`)
      .then((list) => { if (!cancelled) setSearchResults(list) })
      .catch(() => { if (!cancelled) setSearchResults([]) })
    return () => { cancelled = true }
  }, [participantQuery])

  useEffect(() => {
    if (!editParticipantQuery.trim()) {
      setEditSearchResults([])
      return
    }
    let cancelled = false
    get<{ id: number; name: string; email: string }[]>(`/api/me/members/search?q=${encodeURIComponent(editParticipantQuery)}`)
      .then((list) => { if (!cancelled) setEditSearchResults(list) })
      .catch(() => { if (!cancelled) setEditSearchResults([]) })
    return () => { cancelled = true }
  }, [editParticipantQuery])

  const summaryCount = bookings.filter((b) => b.status === 'confirmed' && (b.isCreator || b.isParticipant)).length

  const createOneTimeAmount = useMemo(() => {
    if (createSource !== 'one_time' || !createStartDate || !createEndDate || !createTariffId) return null
    const tariff = hourlyTariffs.find((t) => t.id === createTariffId)
    if (!tariff) return null
    const startStr = `${createStartDate}T${formatTime(createStartMinutes)}:00`
    const endStr = `${createEndDate}T${formatTime(createEndMinutes)}:00`
    const startMs = new Date(startStr).getTime()
    const endMs = new Date(endStr).getTime()
    const durationMinutes = Math.max(0, (endMs - startMs) / 60000)
    const pricePerHour = parseFloat(tariff.price) || 0
    const amount = Math.round((durationMinutes * pricePerHour) / 60 * 100) / 100
    return { durationMinutes: Math.round(durationMinutes), amount }
  }, [createSource, createStartDate, createEndDate, createStartMinutes, createEndMinutes, createTariffId, hourlyTariffs])

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
          <label htmlFor="bookings-date">Дата:</label>
          <DatePicker
            id="bookings-date"
            selected={selectedDate ? new Date(selectedDate + 'T12:00:00') : null}
            onChange={(d: Date | null) => setSelectedDate(d ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10))}
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
              <div key={h} className="bookings-time-tick" style={{ left: TICK_PADDING + (h * 60 - hoursStart) * PX_PER_MINUTE }}>
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
                  ref={trackRef}
                  className="bookings-track"
                  style={{ width: trackTotalWidth, minWidth: trackTotalWidth }}
                  onClick={(e) => {
                    const target = e.target as HTMLElement
                    if (target.closest('.booking-block')) return
                    handleTrackClick(e, space.id, space.name)
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
                    const isClickable = b.isCreator || b.isParticipant || b.status !== 'confirmed'
                    const isOther = !b.isCreator && !b.isParticipant && b.status === 'confirmed'
                    return (
                      <div
                        key={b.id}
                        className={`booking-block ${isClickable ? 'booking-block--clickable' : 'booking-block--other'} ${b.status === 'cancelled' ? 'booking-block--cancelled' : ''}`}
                        style={{
                          left: leftPx,
                          width: widthPx,
                          backgroundColor: getBookingColor(b),
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isOther) return
                          setCancelError(null)
                          setViewBooking(b)
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
          onClick={() => { setViewBooking(null); setCancelError(null) }}
          onKeyDown={(e) => e.key === 'Escape' && (setViewBooking(null), setCancelError(null))}
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-booking-title"
        >
          <div className="cabinet-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="view-booking-title" className="cabinet-modal-title">Бронирование</h3>
            <div className="cabinet-modal-form">
              {cancelError && (
                <p className="cabinet-modal-error" role="alert">{cancelError}</p>
              )}
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
                <dd>{viewBooking.type === 'subscription' ? 'Подписка' : 'Разовая оплата'}</dd>
                <dt>Время начала</dt>
                <dd>{formatISODate(viewBooking.startTime)} {formatTime(parseISOMinutes(viewBooking.startTime))}</dd>
                <dt>Время окончания</dt>
                <dd>{formatISODate(viewBooking.endTime)} {formatTime(parseISOMinutes(viewBooking.endTime))}</dd>
                <dt>Способ оплаты</dt>
                <dd>{viewBooking.type === 'subscription' ? 'Подписка' : 'Разовая оплата'}</dd>
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
                <dd>{viewBooking.status === 'confirmed' ? 'Активно' : viewBooking.status === 'cancelled' ? 'Отменено' : 'Завершено'}</dd>
              </dl>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={() => { setViewBooking(null); setCancelError(null) }}>
                  Закрыть
                </button>
                {viewBooking.isCreator &&
                  viewBooking.status === 'confirmed' &&
                  new Date(viewBooking.startTime) > new Date() && (
                    <button
                      type="button"
                      className="cabinet-edit-btn"
                      onClick={openEditParticipants}
                    >
                      Изменить участников
                    </button>
                  )}
                {canCancelBooking(viewBooking, settings.cancelBeforeHours) && (
                  <button
                    type="button"
                    className="cabinet-password-btn"
                    disabled={cancelLoading}
                    onClick={handleCancelBooking}
                  >
                    {cancelLoading ? 'Отмена…' : 'Отменить бронирование'}
                  </button>
                )}
              </div>
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
                  value={editParticipantQuery}
                  onChange={(e) => setEditParticipantQuery(e.target.value)}
                  placeholder="Введите email или телефон"
                  className="cabinet-modal-input"
                />
                {editSearchResults.length > 0 && (
                  <ul className="bookings-search-results">
                    {editSearchResults.map((m) => (
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
                  onClick={handleSaveEditParticipants}
                >
                  {editLoading ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {createSlot && (
        <div className="cabinet-modal-overlay" onClick={() => { setCreateSlot(null); setCreateError(null) }}>
          <div className="cabinet-modal cabinet-modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="cabinet-modal-title">Новое бронирование</h3>
            <div className="cabinet-modal-form">
              {createError && (
                <p className="cabinet-modal-error" role="alert">{createError}</p>
              )}
              <p><strong>{createSlot.spaceName}</strong></p>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">Дата начала</label>
                <DatePicker
                  selected={createStartDate ? new Date(createStartDate + 'T12:00:00') : null}
                  onChange={(d: Date | null) => setCreateStartDate(d ? d.toISOString().slice(0, 10) : '')}
                  locale="ru"
                  dateFormat="dd.MM.yyyy"
                  className="cabinet-modal-input"
                  placeholderText="дд.мм.гггг"
                  aria-label="Дата начала"
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">Время начала</label>
                <div className="bookings-time-inputs">
                  <select
                    value={Math.floor(createStartMinutes / 60)}
                    onChange={(e) => {
                      const h = Number(e.target.value)
                      setCreateStartMinutes(h * 60 + (createStartMinutes % 60))
                      setCreateTimeError(null)
                    }}
                    className="cabinet-modal-input"
                    aria-label="Час начала"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="bookings-time-sep">:</span>
                  <select
                    value={createStartMinutes % 60}
                    onChange={(e) => {
                      const m = Number(e.target.value)
                      setCreateStartMinutes(Math.floor(createStartMinutes / 60) * 60 + m)
                      setCreateTimeError(null)
                    }}
                    className="cabinet-modal-input"
                    aria-label="Минуты начала"
                  >
                    {Array.from({ length: 60 / settings.slotMinutes }, (_, i) => i * settings.slotMinutes).map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">Дата окончания</label>
                <DatePicker
                  selected={createEndDate ? new Date(createEndDate + 'T12:00:00') : null}
                  onChange={(d: Date | null) => setCreateEndDate(d ? d.toISOString().slice(0, 10) : '')}
                  locale="ru"
                  dateFormat="dd.MM.yyyy"
                  className="cabinet-modal-input"
                  placeholderText="дд.мм.гггг"
                  aria-label="Дата окончания"
                />
              </div>
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">Время окончания</label>
                <div className="bookings-time-inputs">
                  <select
                    value={Math.floor(createEndMinutes / 60)}
                    onChange={(e) => {
                      const h = Number(e.target.value)
                      setCreateEndMinutes(h * 60 + (createEndMinutes % 60))
                      setCreateTimeError(null)
                    }}
                    className="cabinet-modal-input"
                    aria-label="Час окончания"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="bookings-time-sep">:</span>
                  <select
                    value={createEndMinutes % 60}
                    onChange={(e) => {
                      const m = Number(e.target.value)
                      setCreateEndMinutes(Math.floor(createEndMinutes / 60) * 60 + m)
                      setCreateTimeError(null)
                    }}
                    className="cabinet-modal-input"
                    aria-label="Минуты окончания"
                  >
                    {Array.from({ length: 60 / settings.slotMinutes }, (_, i) => i * settings.slotMinutes).map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>
              {createTimeError && (
                <p className="cabinet-modal-error" role="alert">
                  {createTimeError}
                </p>
              )}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">Источник</label>
                <select
                  value={createSource}
                  onChange={(e) => setCreateSource(e.target.value as 'subscription' | 'one_time' | 'none')}
                  className="cabinet-modal-input"
                >
                  {subscriptions.filter((s) => s.status === 'active').length > 0 && (
                    <option value="subscription">Подписка</option>
                  )}
                  {hourlyTariffs.length > 0 && <option value="one_time">Разовая оплата</option>}
                  {subscriptions.filter((s) => s.status === 'active').length === 0 && hourlyTariffs.length === 0 && (
                    <option value="none">Нет доступных источников для этого пространства</option>
                  )}
                </select>
              </div>
              {createSource === 'subscription' && (
                <div className="cabinet-modal-field">
                  <label className="cabinet-modal-label">Подписка</label>
                  <select
                    value={createSubscriptionId ?? ''}
                    onChange={(e) => setCreateSubscriptionId(e.target.value ? Number(e.target.value) : null)}
                    className="cabinet-modal-input"
                  >
                    {subscriptions.filter((s) => s.status === 'active').map((s) => (
                      <option key={s.id} value={s.id}>{s.tariffName} (остаток {s.remainingMinutes === 0 ? 'безлимит' : `${Math.floor(s.remainingMinutes / 60)}:${String(s.remainingMinutes % 60).padStart(2, '0')}`})</option>
                    ))}
                  </select>
                </div>
              )}
              {createSource === 'one_time' && (
                <>
                  <div className="cabinet-modal-field">
                    <label className="cabinet-modal-label">Тариф</label>
                    <select
                      value={createTariffId ?? ''}
                      onChange={(e) => setCreateTariffId(e.target.value ? Number(e.target.value) : null)}
                      className="cabinet-modal-input"
                    >
                      {hourlyTariffs.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} — {formatPrice(t.price)} ₽/ч</option>
                      ))}
                    </select>
                  </div>
                  {createOneTimeAmount != null && createOneTimeAmount.amount >= 0 && (
                    <p className="bookings-one-time-summary">
                      Сумма к оплате: <strong>{formatAmount(createOneTimeAmount.amount)} ₽</strong>
                      {' '}({createOneTimeAmount.durationMinutes} мин)
                    </p>
                  )}
                </>
              )}
              <div className="cabinet-modal-field">
                <label className="cabinet-modal-label">Участники (поиск по email/телефону)</label>
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
                            setSelectedParticipantIds((prev) =>
                              prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                            )
                          }}
                        >
                          {m.name} ({m.email}) {selectedParticipantIds.includes(m.id) ? '✓' : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="cabinet-modal-actions">
                <button type="button" className="cabinet-modal-cancel" onClick={() => setCreateSlot(null)}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="cabinet-modal-submit"
                  disabled={
                    createLoading ||
                    createSource === 'none' ||
                    !createStartDate ||
                    !createEndDate ||
                    (createSource === 'subscription' && !createSubscriptionId) ||
                    (createSource === 'one_time' && !createTariffId) ||
                    createStartMinutes % 15 !== 0 ||
                    createEndMinutes % 15 !== 0 ||
                    `${createStartDate}T${formatTime(createStartMinutes)}:00` >= `${createEndDate}T${formatTime(createEndMinutes)}:00`
                  }
                  onClick={handleCreateBooking}
                >
                  {createLoading
                    ? (createSource === 'one_time' ? 'Оплата…' : 'Создание…')
                    : createSource === 'one_time'
                      ? 'Оплатить'
                      : 'Создать'}
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
