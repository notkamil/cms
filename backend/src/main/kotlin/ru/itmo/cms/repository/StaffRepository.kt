package ru.itmo.cms.repository

import at.favre.lib.crypto.bcrypt.BCrypt
import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.transactions.transaction

data class StaffRow(
    val staffId: Int,
    val name: String,
    val email: String,
    val phone: String,
    val role: StaffRole,
    val position: String,
    val passwordHash: String
)

fun ResultRow.toStaffRow() = StaffRow(
    staffId = this[StaffTable.staffId],
    name = this[StaffTable.name],
    email = this[StaffTable.email],
    phone = this[StaffTable.phone],
    role = this[StaffTable.role],
    position = this[StaffTable.position],
    passwordHash = this[StaffTable.passwordHash]
)

object StaffRepository {

    fun findByEmail(email: String): StaffRow? = transaction {
        StaffTable.selectAll().where { StaffTable.email eq email.trim().lowercase() }
            .singleOrNull()
            ?.toStaffRow()
    }

    fun findById(staffId: Int): StaffRow? = transaction {
        StaffTable.selectAll().where { StaffTable.staffId eq staffId }
            .singleOrNull()
            ?.toStaffRow()
    }
}
