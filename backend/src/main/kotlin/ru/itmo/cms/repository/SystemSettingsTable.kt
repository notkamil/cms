package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object SystemSettingsTable : Table("systemsettings") {
    val key = varchar("key", 64)
    val value = text("value").default("")

    override val primaryKey = PrimaryKey(key)
}
