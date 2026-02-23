package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object SpaceAmenitiesTable : Table("spaceamenities") {
    val spaceId = integer("spaceid").references(SpacesTable.spaceId)
    val amenityId = integer("amenityid").references(AmenitiesTable.amenityId)

    override val primaryKey = PrimaryKey(spaceId, amenityId)
}
