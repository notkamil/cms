package ru.itmo.cms.util

import org.postgresql.util.PGobject
import ru.itmo.cms.repository.BookingType

fun bookingTypeFromDb(value: Any): BookingType = when (value) {
    is PGobject -> BookingType.valueOf(value.value!!)
    is String -> BookingType.valueOf(value)
    else -> BookingType.valueOf(value.toString())
}
