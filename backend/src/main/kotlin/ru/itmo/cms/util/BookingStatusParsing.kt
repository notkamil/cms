package ru.itmo.cms.util

import org.postgresql.util.PGobject
import ru.itmo.cms.repository.BookingStatus

fun bookingStatusFromDb(value: Any): BookingStatus = when (value) {
    is PGobject -> BookingStatus.valueOf(value.value!!)
    is String -> BookingStatus.valueOf(value)
    else -> BookingStatus.valueOf(value.toString())
}
