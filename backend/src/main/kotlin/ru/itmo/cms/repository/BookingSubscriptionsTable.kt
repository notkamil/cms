package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object BookingSubscriptionsTable : Table("bookingsubscriptions") {
    val bookingId = integer("bookingid").references(BookingsTable.bookingId)
    val subscriptionId = integer("subscriptionid").references(SubscriptionsTable.subscriptionId)

    override val primaryKey = PrimaryKey(bookingId)
}
