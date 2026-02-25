package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greater
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import java.time.LocalTime
import java.time.ZoneId

/** Keys in SystemSettings table. */
object SettingsKeys {
    const val WORKING_HOURS_24_7 = "WorkingHours24_7"
    const val TIMEZONE = "Timezone"
    const val SLOT_MINUTES = "SlotMinutes"
    const val MAX_BOOKING_DAYS_AHEAD = "MaxBookingDaysAhead"
    const val MIN_BOOKING_MINUTES = "MinBookingMinutes"
    const val CANCEL_BEFORE_HOURS = "CancelBeforeHours"
}

/** Default values. */
object SettingsDefaults {
    const val WORKING_HOURS_24_7 = "false"
    const val TIMEZONE = "+03:00"
    const val SLOT_MINUTES = "15"
    const val MAX_BOOKING_DAYS_AHEAD = "60"
    const val MIN_BOOKING_MINUTES = "60"
    const val CANCEL_BEFORE_HOURS = "2"
    const val OPENING_TIME = "09:00"
    const val CLOSING_TIME = "21:00"
}

/** App settings for bookings and display. */
data class AppSettings(
    val workingHours24_7: Boolean,
    val timezone: String,
    val zoneId: ZoneId,
    val slotMinutes: Int,
    val maxBookingDaysAhead: Int,
    val minBookingMinutes: Int,
    val cancelBeforeHours: Int,
    /** Day 1–7 (ISO: 1=Mon, 7=Sun) -> (opening, closing). */
    val workingHoursByDay: Map<Int, Pair<LocalTime, LocalTime>>
)

/** Single working-hours row. */
data class WorkingHoursRow(
    val dayOfWeek: Int,
    val openingTime: LocalTime,
    val closingTime: LocalTime
)

private fun parseTime(s: String): LocalTime {
    val parts = s.split(":")
    if (parts.size != 2) return LocalTime.of(9, 0)
    val h = parts[0].toIntOrNull()?.coerceIn(0, 23) ?: 9
    val m = parts[1].toIntOrNull()?.coerceIn(0, 59) ?: 0
    return LocalTime.of(h, m)
}

private fun formatTime(t: LocalTime): String =
    "${t.hour.toString().padStart(2, '0')}:${t.minute.toString().padStart(2, '0')}"

/** System and working-hours settings used for booking rules and UI. */
object SettingsRepository {

    /** Raw setting value by key, or null. */
    fun get(key: String): String? = transaction {
        SystemSettingsTable.selectAll().where { SystemSettingsTable.key eq key }.firstOrNull()?.get(SystemSettingsTable.value)
    }

    /** Insert or overwrite a single key-value setting. */
    fun set(key: String, value: String) = transaction {
        SystemSettingsTable.insert {
            it[SystemSettingsTable.key] = key
            it[SystemSettingsTable.value] = value
        }
    }

    /** Set value for key; insert if missing, update if present. */
    fun setOrUpdate(key: String, value: String) = transaction {
        val existing = SystemSettingsTable.selectAll().where { SystemSettingsTable.key eq key }.firstOrNull()
        if (existing != null) {
            SystemSettingsTable.update(where = { SystemSettingsTable.key eq key }) {
                it[SystemSettingsTable.value] = value
            }
        } else {
            SystemSettingsTable.insert {
                it[SystemSettingsTable.key] = key
                it[SystemSettingsTable.value] = value
            }
        }
    }

    /** All key-value pairs from system_settings table. */
    fun getAllSettings(): Map<String, String> = transaction {
        SystemSettingsTable.selectAll().associate { it[SystemSettingsTable.key] to it[SystemSettingsTable.value] }
    }

    /** Parsed app settings (timezone, slot, limits, working hours by day) for booking logic and UI. */
    fun getAppSettings(): AppSettings = transaction {
        val map = getAllSettings()
        val workingHours24_7 = (map[SettingsKeys.WORKING_HOURS_24_7] ?: SettingsDefaults.WORKING_HOURS_24_7).lowercase() == "true"
        val timezone = map[SettingsKeys.TIMEZONE] ?: SettingsDefaults.TIMEZONE
        val zoneId = try {
            ZoneId.of(timezone)
        } catch (_: Exception) {
            ZoneId.of(SettingsDefaults.TIMEZONE)
        }
        val slotMinutes = (map[SettingsKeys.SLOT_MINUTES] ?: SettingsDefaults.SLOT_MINUTES).toIntOrNull()?.coerceIn(5, 120) ?: 15
        val maxBookingDaysAhead = (map[SettingsKeys.MAX_BOOKING_DAYS_AHEAD] ?: SettingsDefaults.MAX_BOOKING_DAYS_AHEAD).toIntOrNull()?.coerceIn(1, 365) ?: 60
        val minBookingMinutes = (map[SettingsKeys.MIN_BOOKING_MINUTES] ?: SettingsDefaults.MIN_BOOKING_MINUTES).toIntOrNull()?.coerceIn(1, 1440) ?: 60
        val cancelBeforeHours = (map[SettingsKeys.CANCEL_BEFORE_HOURS] ?: SettingsDefaults.CANCEL_BEFORE_HOURS).toIntOrNull()?.coerceIn(0, 168) ?: 2

        val whRows = WorkingHoursTable.selectAll().toList()
        val workingHoursByDay = (1..7).associate { day ->
            val row = whRows.find { it[WorkingHoursTable.dayOfWeek] == day }
            val openStr = row?.get(WorkingHoursTable.openingTime) ?: SettingsDefaults.OPENING_TIME
            val closeStr = row?.get(WorkingHoursTable.closingTime) ?: SettingsDefaults.CLOSING_TIME
            day to (parseTime(openStr) to parseTime(closeStr))
        }

        AppSettings(
            workingHours24_7 = workingHours24_7,
            timezone = timezone,
            zoneId = zoneId,
            slotMinutes = slotMinutes,
            maxBookingDaysAhead = maxBookingDaysAhead,
            minBookingMinutes = minBookingMinutes,
            cancelBeforeHours = cancelBeforeHours,
            workingHoursByDay = workingHoursByDay
        )
    }

    /** Working hours rows for days 1–7 (for staff settings UI). */
    fun listWorkingHours(): List<WorkingHoursRow> = transaction {
        WorkingHoursTable.selectAll().map { row ->
            WorkingHoursRow(
                dayOfWeek = row[WorkingHoursTable.dayOfWeek],
                openingTime = parseTime(row[WorkingHoursTable.openingTime]),
                closingTime = parseTime(row[WorkingHoursTable.closingTime])
            )
        }.sortedBy { it.dayOfWeek }
    }

    /** Replace all working hours with the given rows (day 1–7). */
    fun saveWorkingHours(rows: List<WorkingHoursRow>) = transaction {
        WorkingHoursTable.deleteWhere { WorkingHoursTable.dayOfWeek greater 0 }
        rows.forEach { r ->
            WorkingHoursTable.insert {
                it[WorkingHoursTable.dayOfWeek] = r.dayOfWeek
                it[WorkingHoursTable.openingTime] = formatTime(r.openingTime)
                it[WorkingHoursTable.closingTime] = formatTime(r.closingTime)
            }
        }
    }

    /** Insert default settings when tables are empty. */
    fun ensureDefaults() = transaction {
        val existing = SystemSettingsTable.selectAll().limit(1).firstOrNull()
        if (existing == null) {
            listOf(
                SettingsKeys.WORKING_HOURS_24_7 to SettingsDefaults.WORKING_HOURS_24_7,
                SettingsKeys.TIMEZONE to SettingsDefaults.TIMEZONE,
                SettingsKeys.SLOT_MINUTES to SettingsDefaults.SLOT_MINUTES,
                SettingsKeys.MAX_BOOKING_DAYS_AHEAD to SettingsDefaults.MAX_BOOKING_DAYS_AHEAD,
                SettingsKeys.MIN_BOOKING_MINUTES to SettingsDefaults.MIN_BOOKING_MINUTES,
                SettingsKeys.CANCEL_BEFORE_HOURS to SettingsDefaults.CANCEL_BEFORE_HOURS
            ).forEach { (k, v) -> set(k, v) }
        }

        val whExisting = WorkingHoursTable.selectAll().limit(1).firstOrNull()
        if (whExisting == null) {
            (1..7).forEach { day ->
                WorkingHoursTable.insert {
                    it[WorkingHoursTable.dayOfWeek] = day
                    it[WorkingHoursTable.openingTime] = SettingsDefaults.OPENING_TIME
                    it[WorkingHoursTable.closingTime] = SettingsDefaults.CLOSING_TIME
                }
            }
        }
    }
}
