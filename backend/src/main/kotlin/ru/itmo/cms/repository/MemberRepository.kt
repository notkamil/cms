package ru.itmo.cms.repository

import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDateTime

data class MemberRow(
    val memberId: Int,
    val name: String,
    val email: String,
    val phone: String,
    val balance: java.math.BigDecimal,
    val registeredAt: LocalDateTime,
    val passwordHash: String
)

fun ResultRow.toMemberRow() = MemberRow(
    memberId = this[MembersTable.memberId],
    name = this[MembersTable.name],
    email = this[MembersTable.email],
    phone = this[MembersTable.phone],
    balance = this[MembersTable.balance],
    registeredAt = this[MembersTable.registeredAt],
    passwordHash = this[MembersTable.passwordHash]
)

object MemberRepository {

    fun findByEmail(email: String): MemberRow? = transaction {
        MembersTable.select { MembersTable.email eq email }
            .singleOrNull()
            ?.toMemberRow()
    }

    fun create(name: String, email: String, phone: String, passwordHash: String): MemberRow = transaction {
        val now = LocalDateTime.now()
        val id = MembersTable.insert {
            it[MembersTable.name] = name
            it[MembersTable.email] = email
            it[MembersTable.phone] = phone
            it[MembersTable.balance] = java.math.BigDecimal.ZERO
            it[MembersTable.registeredAt] = now
            it[MembersTable.passwordHash] = passwordHash
        } get MembersTable.memberId
        MemberRow(
            memberId = id,
            name = name,
            email = email,
            phone = phone,
            balance = java.math.BigDecimal.ZERO,
            registeredAt = now,
            passwordHash = passwordHash
        )
    }
}
