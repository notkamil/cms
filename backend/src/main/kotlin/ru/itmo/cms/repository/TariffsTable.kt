package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.Table
import ru.itmo.cms.util.tariffTypeFromDb

object TariffsTable : Table("tariffs") {
    val tariffId = integer("tariffid").autoIncrement()
    val name = varchar("name", 64).uniqueIndex()
    val type: Column<TariffType> = customEnumeration(
        name = "type",
        sql = "tariff_type",
        fromDb = { tariffTypeFromDb(it) },
        toDb = { PGTariffType(it) }
    )
    val durationDays = integer("durationdays").default(0)
    val includedHours = integer("includedhours").default(0)
    val price = decimal("price", 10, 2)
    val isActive = bool("isactive").default(true)

    override val primaryKey = PrimaryKey(tariffId)
}
