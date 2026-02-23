package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object SpaceTypesTable : Table("spacetypes") {
    val spaceTypeId = integer("spacetypeid").autoIncrement()
    val name = varchar("name", 24).uniqueIndex()
    val description = text("description").default("")

    override val primaryKey = PrimaryKey(spaceTypeId)
}
