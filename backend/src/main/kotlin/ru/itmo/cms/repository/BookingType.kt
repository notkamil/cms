package ru.itmo.cms.repository

import org.postgresql.util.PGobject

enum class BookingType {
    one_time,
    subscription
}

class PGBookingType(value: BookingType?) : PGobject() {
    init {
        type = "booking_type"
        this.value = value?.name
    }
}
