package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object TariffSpacesTable : Table("tariffspaces") {
    val tariffId = integer("tariffid").references(TariffsTable.tariffId)
    val spaceId = integer("spaceid").references(SpacesTable.spaceId)

    override val primaryKey = PrimaryKey(tariffId, spaceId)
}
