package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.datetime
import ru.itmo.cms.util.bookingStatusFromDb
import ru.itmo.cms.util.bookingTypeFromDb

object BookingsTable : Table("bookings") {
    val bookingId = integer("bookingid").autoIncrement()
    val spaceId = integer("spaceid").references(SpacesTable.spaceId)
    val createdBy = integer("createdby").references(MembersTable.memberId)
    val bookingType: Column<BookingType> = customEnumeration(
        name = "bookingtype",
        sql = "booking_type",
        fromDb = { bookingTypeFromDb(it) },
        toDb = { PGBookingType(it) }
    )
    val startTime = datetime("starttime")
    val endTime = datetime("endtime")
    val status: Column<BookingStatus> = customEnumeration(
        name = "status",
        sql = "booking_status",
        fromDb = { bookingStatusFromDb(it) },
        toDb = { PGBookingStatus(it) }
    )

    override val primaryKey = PrimaryKey(bookingId)
}
