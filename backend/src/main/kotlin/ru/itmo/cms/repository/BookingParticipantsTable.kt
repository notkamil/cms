package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object BookingParticipantsTable : Table("bookingparticipants") {
    val bookingId = integer("bookingid").references(BookingsTable.bookingId)
    val memberId = integer("memberid").references(MembersTable.memberId)

    override val primaryKey = PrimaryKey(bookingId, memberId)
}
