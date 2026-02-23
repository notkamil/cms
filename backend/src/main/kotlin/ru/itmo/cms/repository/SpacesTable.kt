package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.Table
import ru.itmo.cms.util.spaceStatusFromDb

object SpacesTable : Table("spaces") {
    val spaceId = integer("spaceid").autoIncrement()
    val spaceTypeId = integer("spacetypeid").references(SpaceTypesTable.spaceTypeId)
    val name = varchar("name", 64)
    val floor = integer("floor")
    val capacity = integer("capacity")
    val status: Column<SpaceStatus> = customEnumeration(
        name = "status",
        sql = "space_status",
        fromDb = { spaceStatusFromDb(it) },
        toDb = { PGSpaceStatus(it) }
    )
    val description = text("description").default("")

    override val primaryKey = PrimaryKey(spaceId)
}
