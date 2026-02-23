package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.datetime

object MembersTable : Table("members") {
    val memberId = integer("memberid").autoIncrement()
    val name = varchar("name", 64)
    val email = varchar("email", 64).uniqueIndex()
    val phone = varchar("phone", 20).uniqueIndex()
    val balance = decimal("balance", 10, 2).default(java.math.BigDecimal.ZERO)
    val registeredAt = datetime("registeredat")
    val passwordHash = varchar("passwordhash", 255)

    override val primaryKey = PrimaryKey(memberId)
}
