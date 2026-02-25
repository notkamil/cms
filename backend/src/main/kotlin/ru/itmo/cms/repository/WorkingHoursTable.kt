package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object WorkingHoursTable : Table("workinghours") {
    val dayOfWeek = integer("dayofweek")
    val openingTime = varchar("openingtime", 5)
    val closingTime = varchar("closingtime", 5)

    override val primaryKey = PrimaryKey(dayOfWeek)
}
