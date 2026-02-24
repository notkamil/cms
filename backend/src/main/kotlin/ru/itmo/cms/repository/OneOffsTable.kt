package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object OneOffsTable : Table("oneoffs") {
    val oneOffId = integer("oneoffid").autoIncrement()
    val bookingId = integer("bookingid").references(BookingsTable.bookingId)
    val memberId = integer("memberid").references(MembersTable.memberId)
    val tariffId = integer("tariffid").references(TariffsTable.tariffId)
    val quantity = integer("quantity")

    override val primaryKey = PrimaryKey(oneOffId)
}
