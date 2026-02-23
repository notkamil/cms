package ru.itmo.cms.repository

import at.favre.lib.crypto.bcrypt.BCrypt
import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import ru.itmo.cms.util.normalizeEmail
import ru.itmo.cms.util.normalizePhone
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

    fun findById(memberId: Int): MemberRow? = transaction {
        MembersTable.selectAll().where { MembersTable.memberId eq memberId }
            .singleOrNull()
            ?.toMemberRow()
    }

    fun findByEmail(email: String): MemberRow? = transaction {
        MembersTable.selectAll().where { MembersTable.email eq email }
            .singleOrNull()
            ?.toMemberRow()
    }

    fun findByPhone(phone: String): MemberRow? = transaction {
        MembersTable.selectAll().where { MembersTable.phone eq phone }
            .singleOrNull()
            ?.toMemberRow()
    }

    fun updateProfile(
        memberId: Int,
        name: String? = null,
        email: String? = null,
        phone: String? = null,
        passwordHash: String? = null
    ): MemberRow? = transaction {
        if (MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull() == null) return@transaction null
        MembersTable.update(where = { MembersTable.memberId eq memberId }) { stmt ->
            name?.let { v -> stmt[MembersTable.name] = v }
            email?.let { v -> stmt[MembersTable.email] = v }
            phone?.let { v -> stmt[MembersTable.phone] = v }
            passwordHash?.let { v -> stmt[MembersTable.passwordHash] = v }
        }
        MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull()?.toMemberRow()
    }

    /**
     * Verifies current password, updates profile fields, and writes audit in a single transaction.
     * @throws ProfileUpdateException.InvalidPassword if currentPassword is wrong
     * @throws ProfileUpdateException.EmailAlreadyUsed if new email is taken by another member
     * @throws ProfileUpdateException.PhoneAlreadyUsed if new phone is taken by another member
     * @throws ProfileUpdateException.PhoneNotE164 if phone is not in international format (must start with +)
     */
    fun updateProfileWithAudit(
        memberId: Int,
        currentPassword: String,
        name: String? = null,
        email: String? = null,
        phone: String? = null
    ): MemberRow = transaction {
        val before = MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull()?.toMemberRow()
            ?: throw ProfileUpdateException.InvalidPassword()
        if (!BCrypt.verifyer().verify(currentPassword.toCharArray(), before.passwordHash).verified) {
            throw ProfileUpdateException.InvalidPassword()
        }
        val newName = name?.trim()?.takeIf { it.isNotBlank() } ?: before.name
        val newEmail = if (email != null) {
            val normalized = normalizeEmail(email).takeIf { it.isNotBlank() } ?: before.email
            if (normalized != before.email) {
                val existing = MembersTable.selectAll().where { MembersTable.email eq normalized }.singleOrNull()
                if (existing != null && existing[MembersTable.memberId] != memberId) {
                    throw ProfileUpdateException.EmailAlreadyUsed()
                }
                normalized
            } else before.email
        } else before.email
        val newPhone = if (phone != null) {
            val normalized = normalizePhone(phone) ?: throw ProfileUpdateException.PhoneNotE164()
            if (normalized != before.phone) {
                val existing = MembersTable.selectAll().where { MembersTable.phone eq normalized }.singleOrNull()
                if (existing != null && existing[MembersTable.memberId] != memberId) {
                    throw ProfileUpdateException.PhoneAlreadyUsed()
                }
                normalized
            } else before.phone
        } else before.phone
        if (newName == before.name && newEmail == before.email && newPhone == before.phone) {
            throw ProfileUpdateException.NothingChanged()
        }
        MembersTable.update(where = { MembersTable.memberId eq memberId }) { stmt ->
            stmt[MembersTable.name] = newName
            stmt[MembersTable.email] = newEmail
            stmt[MembersTable.phone] = newPhone
        }
        MemberProfileAuditTable.insert {
            it[MemberProfileAuditTable.memberId] = memberId
            it[MemberProfileAuditTable.changedAt] = LocalDateTime.now()
            it[MemberProfileAuditTable.oldName] = before.name
            it[MemberProfileAuditTable.newName] = newName
            it[MemberProfileAuditTable.oldEmail] = before.email
            it[MemberProfileAuditTable.newEmail] = newEmail
            it[MemberProfileAuditTable.oldPhone] = before.phone
            it[MemberProfileAuditTable.newPhone] = newPhone
            it[MemberProfileAuditTable.oldPasswordHash] = before.passwordHash
            it[MemberProfileAuditTable.newPasswordHash] = before.passwordHash
        }
        MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull()!!.toMemberRow()
    }

    /**
     * Verifies current password, updates password hash, and writes audit in a single transaction.
     * @throws ProfileUpdateException.InvalidPassword if currentPassword is wrong
     */
    fun changePasswordWithAudit(
        memberId: Int,
        currentPassword: String,
        newPasswordHash: String
    ): Unit = transaction {
        val before = MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull()?.toMemberRow()
            ?: throw ProfileUpdateException.InvalidPassword()
        if (!BCrypt.verifyer().verify(currentPassword.toCharArray(), before.passwordHash).verified) {
            throw ProfileUpdateException.InvalidPassword()
        }
        MembersTable.update(where = { MembersTable.memberId eq memberId }) { stmt ->
            stmt[MembersTable.passwordHash] = newPasswordHash
        }
        MemberProfileAuditTable.insert {
            it[MemberProfileAuditTable.memberId] = memberId
            it[MemberProfileAuditTable.changedAt] = LocalDateTime.now()
            it[MemberProfileAuditTable.oldName] = before.name
            it[MemberProfileAuditTable.newName] = before.name
            it[MemberProfileAuditTable.oldEmail] = before.email
            it[MemberProfileAuditTable.newEmail] = before.email
            it[MemberProfileAuditTable.oldPhone] = before.phone
            it[MemberProfileAuditTable.newPhone] = before.phone
            it[MemberProfileAuditTable.oldPasswordHash] = before.passwordHash
            it[MemberProfileAuditTable.newPasswordHash] = newPasswordHash
        }
    }

    /**
     * Пополнение баланса: увеличивает balance и записывает транзакцию типа deposit.
     * Сумма должна быть не меньше 0.01.
     * @return обновлённый MemberRow или null если участник не найден или сумма &lt; 0.01
     */
    fun deposit(memberId: Int, amount: java.math.BigDecimal): MemberRow? = transaction {
        val minAmount = java.math.BigDecimal("0.01")
        if (amount < minAmount) return@transaction null
        val row = MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull() ?: return@transaction null
        val newBalance = row[MembersTable.balance] + amount
        MembersTable.update(where = { MembersTable.memberId eq memberId }) {
            it[MembersTable.balance] = newBalance
        }
        TransactionsTable.insert {
            it[TransactionsTable.memberId] = memberId
            it[TransactionsTable.amount] = amount
            it[TransactionsTable.transactionType] = TransactionType.deposit
            it[TransactionsTable.transactionDate] = LocalDateTime.now()
            it[TransactionsTable.description] = "Пополнение"
        }
        MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull()?.toMemberRow()
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
