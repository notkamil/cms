import { useCallback, useEffect, useState } from 'react'
import { get, patch, ApiError } from '../api/client'
import { LoadingLogo } from '../components/LoadingLogo'
import '../pages/CabinetPage.css'
import '../pages/StaffCabinetPage.css'
import '../pages/BookingsPage.css'

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const MINUTE_OPTIONS = [0, 15, 30, 45]

function parseHHmm(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10))
  return { h: Number.isNaN(h) ? 9 : Math.max(0, Math.min(23, h)), m: Number.isNaN(m) ? 0 : Math.max(0, Math.min(59, m)) }
}

function formatHHmm(h: number, m: number): string {
  const mm = MINUTE_OPTIONS.includes(m) ? m : MINUTE_OPTIONS.reduce((prev, curr) => (Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev))
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function nearestMinuteOption(m: number): number {
  return MINUTE_OPTIONS.reduce((prev, curr) => (Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev))
}

interface WorkingHoursDay {
  dayOfWeek: number
  openingTime: string
  closingTime: string
}

interface StaffSettings {
  workingHours24_7: boolean
  timezone: string
  slotMinutes: number
  maxBookingDaysAhead: number
  minBookingMinutes: number
  cancelBeforeHours: number
  workingHours: WorkingHoursDay[]
}

/** Timezone options: label and API value (ZoneId: UTC or +HH:00/-HH:00). */
const UTC_OFFSET_OPTIONS: { label: string; value: string }[] = [
  { label: 'UTC', value: 'UTC' },
  ...Array.from({ length: 12 }, (_, i) => ({ label: `UTC+${i + 1}`, value: `+${String(i + 1).padStart(2, '0')}:00` })),
  ...Array.from({ length: 12 }, (_, i) => ({ label: `UTC-${i + 1}`, value: `-${String(i + 1).padStart(2, '0')}:00` })),
]

/** Normalize backend value (IANA or offset) to one of our select values. */
function normalizeTimezoneForSelect(tz: string): string {
  if (!tz) return 'UTC'
  const normalized = tz.trim()
  const inList = UTC_OFFSET_OPTIONS.some((o) => o.value === normalized)
  if (inList) return normalized
  const known: Record<string, string> = {
    'Europe/Moscow': '+03:00',
    'Europe/Samara': '+04:00',
    'Asia/Yekaterinburg': '+05:00',
    'Asia/Novosibirsk': '+07:00',
    'Europe/Kaliningrad': '+02:00',
  }
  return known[normalized] ?? 'UTC'
}

/** Staff system settings: working hours, timezone, slot, booking limits. */
export default function StaffSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [workingHours24_7, setWorkingHours24_7] = useState(false)
  const [timezone, setTimezone] = useState('UTC')
  const [slotMinutes, setSlotMinutes] = useState(15)
  const [maxBookingDaysAhead, setMaxBookingDaysAhead] = useState(60)
  const [minBookingMinutes, setMinBookingMinutes] = useState(60)
  const [cancelBeforeHours, setCancelBeforeHours] = useState(2)
  const [workingHours, setWorkingHours] = useState<WorkingHoursDay[]>([])

  const loadSettings = useCallback(() => {
    setLoading(true)
    setError(null)
    get<StaffSettings>('/api/staff/settings', true)
      .then((data) => {
        setWorkingHours24_7(data.workingHours24_7)
        setTimezone(normalizeTimezoneForSelect(data.timezone))
        setSlotMinutes(data.slotMinutes)
        setMaxBookingDaysAhead(data.maxBookingDaysAhead)
        setMinBookingMinutes(data.minBookingMinutes)
        setCancelBeforeHours(data.cancelBeforeHours)
        const sorted = [...data.workingHours].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        setWorkingHours(
          sorted.length === 7
            ? sorted
            : Array.from({ length: 7 }, (_, i) => ({
                dayOfWeek: i + 1,
                openingTime: '09:00',
                closingTime: '21:00',
              }))
        )
      })
      .catch(() => setError('Не удалось загрузить настройки'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const updateWorkingHour = (dayOfWeek: number, field: 'openingTime' | 'closingTime', value: string) => {
    setWorkingHours((prev) =>
      prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d))
    )
  }

  const setWorkingHourTime = (dayOfWeek: number, field: 'openingTime' | 'closingTime', h: number, m: number) => {
    updateWorkingHour(dayOfWeek, field, formatHHmm(h, m))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const body: Record<string, unknown> = {
      workingHours24_7,
      timezone: timezone.trim() || 'UTC',
      slotMinutes: Math.min(120, Math.max(5, slotMinutes)),
      maxBookingDaysAhead: Math.min(365, Math.max(1, maxBookingDaysAhead)),
      minBookingMinutes: Math.min(1440, Math.max(1, minBookingMinutes)),
      cancelBeforeHours: Math.min(168, Math.max(0, cancelBeforeHours)),
    }
    if (!workingHours24_7 && workingHours.length === 7) {
      body.workingHours = workingHours
    }
    patch('/api/staff/settings', body, true)
      .then(() => loadSettings())
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Не удалось сохранить'))
      .finally(() => setSaving(false))
  }

  if (loading) {
    return (
      <div className="cabinet-loading-block">
        <LoadingLogo theme="light" variant="smooth" />
      </div>
    )
  }

  return (
    <div className="cabinet-content">
      <h2 className="cabinet-history-title">Общие настройки</h2>
      {error && (
        <p className="cabinet-error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="staff-settings-form">
        <div className="staff-settings-section">
          <h3 className="staff-settings-section-title">Рабочие часы</h3>
          <label className="staff-settings-checkbox-label">
            <input
              type="checkbox"
              checked={workingHours24_7}
              onChange={(e) => setWorkingHours24_7(e.target.checked)}
              aria-describedby="working-hours-desc"
            />
            Круглосуточно
          </label>
          <p id="working-hours-desc" className="staff-settings-hint">
            Если выключено, ниже задаётся время работы для каждого дня недели (без перехода через полночь).
          </p>
          {!workingHours24_7 && (
            <div className="staff-settings-working-hours">
              {workingHours.map((d) => {
                const open = parseHHmm(d.openingTime)
                const close = parseHHmm(d.closingTime)
                return (
                  <div key={d.dayOfWeek} className="staff-settings-day-row">
                    <span className="staff-settings-day-name">{DAY_NAMES[d.dayOfWeek - 1]}</span>
                    <div className="bookings-time-inputs">
                      <select
                        value={open.h}
                        onChange={(e) => setWorkingHourTime(d.dayOfWeek, 'openingTime', Number(e.target.value), open.m)}
                        className="cabinet-modal-input"
                        aria-label={`${DAY_NAMES[d.dayOfWeek - 1]} — час открытия`}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                        ))}
                      </select>
                      <span className="bookings-time-sep">:</span>
                      <select
                        value={nearestMinuteOption(open.m)}
                        onChange={(e) => setWorkingHourTime(d.dayOfWeek, 'openingTime', open.h, Number(e.target.value))}
                        className="cabinet-modal-input"
                        aria-label={`${DAY_NAMES[d.dayOfWeek - 1]} — минуты открытия`}
                      >
                        {MINUTE_OPTIONS.map((m) => (
                          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                        ))}
                      </select>
                    </div>
                    <span className="staff-settings-time-sep">—</span>
                    <div className="bookings-time-inputs">
                      <select
                        value={close.h}
                        onChange={(e) => setWorkingHourTime(d.dayOfWeek, 'closingTime', Number(e.target.value), close.m)}
                        className="cabinet-modal-input"
                        aria-label={`${DAY_NAMES[d.dayOfWeek - 1]} — час закрытия`}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                        ))}
                      </select>
                      <span className="bookings-time-sep">:</span>
                      <select
                        value={nearestMinuteOption(close.m)}
                        onChange={(e) => setWorkingHourTime(d.dayOfWeek, 'closingTime', close.h, Number(e.target.value))}
                        className="cabinet-modal-input"
                        aria-label={`${DAY_NAMES[d.dayOfWeek - 1]} — минуты закрытия`}
                      >
                        {MINUTE_OPTIONS.map((m) => (
                          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="staff-settings-section">
          <h3 className="staff-settings-section-title">Часовой пояс</h3>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="cabinet-modal-input staff-settings-select"
          >
            {UTC_OFFSET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="staff-settings-hint">Используется для отображения времени и проверки «сейчас» при бронировании и отмене.</p>
        </div>

        <div className="staff-settings-section">
          <h3 className="staff-settings-section-title">Бронирования</h3>
          <div className="staff-settings-grid">
            <label className="staff-settings-field">
              <span>Шаг слотов (минут)</span>
              <input
                type="number"
                min={5}
                max={120}
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(parseInt(e.target.value, 10) || 15)}
                className="cabinet-modal-input"
              />
            </label>
            <label className="staff-settings-field">
              <span>Макс. дней вперёд</span>
              <input
                type="number"
                min={1}
                max={365}
                value={maxBookingDaysAhead}
                onChange={(e) => setMaxBookingDaysAhead(parseInt(e.target.value, 10) || 60)}
                className="cabinet-modal-input"
              />
              <span className="staff-settings-hint-inline">Конец бронирования должен быть раньше, чем сейчас + это число дней.</span>
            </label>
            <label className="staff-settings-field">
              <span>Мин. длительность (минут)</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={minBookingMinutes}
                onChange={(e) => setMinBookingMinutes(parseInt(e.target.value, 10) || 60)}
                className="cabinet-modal-input"
              />
            </label>
            <label className="staff-settings-field">
              <span>Отмена не позднее чем за (часов)</span>
              <input
                type="number"
                min={0}
                max={168}
                value={cancelBeforeHours}
                onChange={(e) => setCancelBeforeHours(parseInt(e.target.value, 10) || 0)}
                className="cabinet-modal-input"
              />
              <span className="staff-settings-hint-inline">Пользователь может отменить бронирование только если до начала осталось не меньше этого числа часов.</span>
            </label>
          </div>
        </div>

        <div className="staff-settings-actions">
          <button type="submit" className="cabinet-table-btn" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  )
}
