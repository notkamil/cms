package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.datetime

object MemberProfileAuditTable : Table("memberprofileaudit") {
    val auditId = integer("auditid").autoIncrement()
    val memberId = integer("memberid").references(MembersTable.memberId)
    val changedAt = datetime("changedat")
    val oldName = varchar("oldname", 64)
    val newName = varchar("newname", 64)
    val oldEmail = varchar("oldemail", 64)
    val newEmail = varchar("newemail", 64)
    val oldPhone = varchar("oldphone", 20)
    val newPhone = varchar("newphone", 20)
    val oldPasswordHash = varchar("oldpasswordhash", 255)
    val newPasswordHash = varchar("newpasswordhash", 255)

    override val primaryKey = PrimaryKey(auditId)
}
