package ru.itmo.cms.repository

import org.postgresql.util.PGobject

enum class BookingStatus {
    confirmed,
    cancelled,
    completed
}

class PGBookingStatus(value: BookingStatus?) : PGobject() {
    init {
        type = "booking_status"
        this.value = value?.name
    }
}
