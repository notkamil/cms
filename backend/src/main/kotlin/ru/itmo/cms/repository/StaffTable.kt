package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.Table
import org.postgresql.util.PGobject
import ru.itmo.cms.util.staffRoleFromDb

object StaffTable : Table("staff") {
    val staffId = integer("staffid").autoIncrement()
    val name = varchar("name", 64)
    val email = varchar("email", 64).uniqueIndex()
    val phone = varchar("phone", 20).uniqueIndex()
    val role: Column<StaffRole> = customEnumeration(
        name = "role",
        sql = "staff_role",
        fromDb = { staffRoleFromDb(it) },
        toDb = { PGStaffRole(it) }
    )
    val position = varchar("position", 128).default("")
    val passwordHash = varchar("passwordhash", 255)

    override val primaryKey = PrimaryKey(staffId)
}
