package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.datetime
import org.postgresql.util.PGobject
import ru.itmo.cms.util.staffRoleFromDb

object StaffAuditTable : Table("staffaudit") {
    val auditId = integer("auditid").autoIncrement()
    val staffId = integer("staffid").references(StaffTable.staffId)
    val changedAt = datetime("changedat")
    val changedByStaffId = integer("changedbystaffid").references(StaffTable.staffId)
    val oldName = varchar("oldname", 64).default("")
    val newName = varchar("newname", 64).default("")
    val oldEmail = varchar("oldemail", 64).default("")
    val newEmail = varchar("newemail", 64).default("")
    val oldPhone = varchar("oldphone", 20).default("")
    val newPhone = varchar("newphone", 20).default("")
    val oldRole: Column<StaffRole> = customEnumeration(
        name = "oldrole",
        sql = "staff_role",
        fromDb = { staffRoleFromDb(it) },
        toDb = { PGStaffRole(it) }
    )
    val newRole: Column<StaffRole> = customEnumeration(
        name = "newrole",
        sql = "staff_role",
        fromDb = { staffRoleFromDb(it) },
        toDb = { PGStaffRole(it) }
    )
    val oldPosition = varchar("oldposition", 128).default("")
    val newPosition = varchar("newposition", 128).default("")
    val oldPasswordHash = varchar("oldpasswordhash", 255).default("")
    val newPasswordHash = varchar("newpasswordhash", 255).default("")

    override val primaryKey = PrimaryKey(auditId)
}
