package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object SpacesTable : Table("spaces") {
    val spaceId = integer("spaceid").autoIncrement()
    val spaceTypeId = integer("spacetypeid").references(SpaceTypesTable.spaceTypeId)
    val name = varchar("name", 64)
    val floor = integer("floor")
    val capacity = integer("capacity")
    val status = varchar("status", 24).default("available")
    val description = text("description").default("")

    override val primaryKey = PrimaryKey(spaceId)
}
