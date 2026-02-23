package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object AmenitiesTable : Table("amenities") {
    val amenityId = integer("amenityid").autoIncrement()
    val name = varchar("name", 24).uniqueIndex()
    val description = text("description").default("")

    override val primaryKey = PrimaryKey(amenityId)
}
