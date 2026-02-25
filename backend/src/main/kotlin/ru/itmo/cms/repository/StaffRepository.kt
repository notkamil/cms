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

    fun findAll(): List<StaffRow> = transaction {
        StaffTable.selectAll().map { it.toStaffRow() }
    }

    /**
     * Создаёт первого суперадмина при первом запуске, если в БД ещё нет ни одного с ролью superadmin.
     * Данные: email admin@admin.admin, имя Администратор, пароль admin. Дальше пользователь меняет в UI.
     */
    fun ensureBootstrapSuperadmin(): Unit = transaction {
        if (StaffTable.selectAll().where { StaffTable.role eq StaffRole.superadmin }.firstOrNull() != null) return@transaction
        val email = normalizeEmail("admin@admin.admin")
        val phone = "+79000000000"
        if (StaffTable.selectAll().where { StaffTable.email eq email }.firstOrNull() != null) return@transaction
        if (StaffTable.selectAll().where { StaffTable.phone eq phone }.firstOrNull() != null) return@transaction
        val passwordHash = BCrypt.withDefaults().hashToString(12, "admin".toCharArray())
        val staffId = StaffTable.insert {
            it[StaffTable.name] = "Администратор"
            it[StaffTable.email] = email
            it[StaffTable.phone] = phone
            it[StaffTable.role] = StaffRole.superadmin
            it[StaffTable.position] = "Администратор"
            it[StaffTable.passwordHash] = passwordHash
        } get StaffTable.staffId
        StaffAuditTable.insert {
            it[StaffAuditTable.staffId] = staffId
            it[StaffAuditTable.changedAt] = LocalDateTime.now()
            it[StaffAuditTable.changedByStaffId] = staffId
            it[StaffAuditTable.oldName] = ""
            it[StaffAuditTable.newName] = "Администратор"
            it[StaffAuditTable.oldEmail] = ""
            it[StaffAuditTable.newEmail] = email
            it[StaffAuditTable.oldPhone] = ""
            it[StaffAuditTable.newPhone] = phone
            it[StaffAuditTable.oldRole] = StaffRole.inactive
            it[StaffAuditTable.newRole] = StaffRole.superadmin
            it[StaffAuditTable.oldPosition] = ""
            it[StaffAuditTable.newPosition] = "Администратор"
            it[StaffAuditTable.oldPasswordHash] = ""
            it[StaffAuditTable.newPasswordHash] = passwordHash
        }
    }

    /**
     * Creates a new staff and writes audit (old* = empty/inactive, new* = actual).
     * @throws StaffProfileUpdateException.EmailAlreadyUsed, PhoneAlreadyUsed, PhoneNotE164
     */
    fun createWithAudit(
        name: String,
        email: String,
        phone: String,
        role: StaffRole,
        position: String,
        passwordHash: String,
        changedByStaffId: Int
    ): StaffRow = transaction {
        val normalizedEmail = normalizeEmail(email).takeIf { it.isNotBlank() }
            ?: throw StaffProfileUpdateException.InvalidInput("Укажите email")
        val normalizedPhone = normalizePhone(phone)
            ?: throw StaffProfileUpdateException.PhoneNotE164()
        if (StaffTable.selectAll().where { StaffTable.email eq normalizedEmail }.singleOrNull() != null) {
            throw StaffProfileUpdateException.EmailAlreadyUsed()
        }
        if (StaffTable.selectAll().where { StaffTable.phone eq normalizedPhone }.singleOrNull() != null) {
            throw StaffProfileUpdateException.PhoneAlreadyUsed()
        }
        val staffId = StaffTable.insert {
            it[StaffTable.name] = name.trim()
            it[StaffTable.email] = normalizedEmail
            it[StaffTable.phone] = normalizedPhone
            it[StaffTable.role] = role
            it[StaffTable.position] = position.trim().ifBlank { "" }
            it[StaffTable.passwordHash] = passwordHash
        } get StaffTable.staffId
        StaffAuditTable.insert {
            it[StaffAuditTable.staffId] = staffId
            it[StaffAuditTable.changedAt] = LocalDateTime.now()
            it[StaffAuditTable.changedByStaffId] = changedByStaffId
            it[StaffAuditTable.oldName] = ""
            it[StaffAuditTable.newName] = name.trim()
            it[StaffAuditTable.oldEmail] = ""
            it[StaffAuditTable.newEmail] = normalizedEmail
            it[StaffAuditTable.oldPhone] = ""
            it[StaffAuditTable.newPhone] = normalizedPhone
            it[StaffAuditTable.oldRole] = StaffRole.inactive
            it[StaffAuditTable.newRole] = role
            it[StaffAuditTable.oldPosition] = ""
            it[StaffAuditTable.newPosition] = position.trim().ifBlank { "" }
            it[StaffAuditTable.oldPasswordHash] = ""
            it[StaffAuditTable.newPasswordHash] = passwordHash
        }
        StaffTable.selectAll().where { StaffTable.staffId eq staffId }.single().toStaffRow()
    }

    /**
     * Updates staff by id and writes audit. Only non-null fields are changed.
     * @throws StaffProfileUpdateException.* if validation fails
     */
    fun updateWithAudit(
        staffId: Int,
        changedByStaffId: Int,
        name: String? = null,
        email: String? = null,
        phone: String? = null,
        role: StaffRole? = null,
        position: String? = null
    ): StaffRow = transaction {
        val before = StaffTable.selectAll().where { StaffTable.staffId eq staffId }.singleOrNull()?.toStaffRow()
            ?: return@transaction throw NoSuchElementException("Staff not found")
        val newName = name?.trim()?.takeIf { it.isNotBlank() } ?: before.name
        val newEmail = if (email != null) {
            val normalized = normalizeEmail(email).takeIf { it.isNotBlank() } ?: before.email
            if (normalized != before.email) {
                val existing = StaffTable.selectAll().where { StaffTable.email eq normalized }.singleOrNull()
                if (existing != null && existing[StaffTable.staffId] != staffId) {
                    throw StaffProfileUpdateException.EmailAlreadyUsed()
                }
                normalized
            } else before.email
        } else before.email
        val newPhone = if (phone != null) {
            val normalized = normalizePhone(phone) ?: throw StaffProfileUpdateException.PhoneNotE164()
            if (normalized != before.phone) {
                val existing = StaffTable.selectAll().where { StaffTable.phone eq normalized }.singleOrNull()
                if (existing != null && existing[StaffTable.staffId] != staffId) {
                    throw StaffProfileUpdateException.PhoneAlreadyUsed()
                }
                normalized
            } else before.phone
        } else before.phone
        val newRole = role ?: before.role
        val newPosition = position?.trim()?.ifBlank { "" } ?: before.position
        if (newName == before.name && newEmail == before.email && newPhone == before.phone && newRole == before.role && newPosition == before.position) {
            throw StaffProfileUpdateException.NothingChanged()
        }
        StaffTable.update(where = { StaffTable.staffId eq staffId }) {
            it[StaffTable.name] = newName
            it[StaffTable.email] = newEmail
            it[StaffTable.phone] = newPhone
            it[StaffTable.role] = newRole
            it[StaffTable.position] = newPosition
        }
        StaffAuditTable.insert {
            it[StaffAuditTable.staffId] = staffId
            it[StaffAuditTable.changedAt] = LocalDateTime.now()
            it[StaffAuditTable.changedByStaffId] = changedByStaffId
            it[StaffAuditTable.oldName] = before.name
            it[StaffAuditTable.newName] = newName
            it[StaffAuditTable.oldEmail] = before.email
            it[StaffAuditTable.newEmail] = newEmail
            it[StaffAuditTable.oldPhone] = before.phone
            it[StaffAuditTable.newPhone] = newPhone
            it[StaffAuditTable.oldRole] = before.role
            it[StaffAuditTable.newRole] = newRole
            it[StaffAuditTable.oldPosition] = before.position
            it[StaffAuditTable.newPosition] = newPosition
            it[StaffAuditTable.oldPasswordHash] = before.passwordHash
            it[StaffAuditTable.newPasswordHash] = before.passwordHash
        }
        StaffTable.selectAll().where { StaffTable.staffId eq staffId }.single().toStaffRow()
    }

    /**
     * Sets staff role to inactive (dismiss) and writes audit.
     */
    fun setInactiveWithAudit(staffId: Int, changedByStaffId: Int): StaffRow = transaction {
        val before = StaffTable.selectAll().where { StaffTable.staffId eq staffId }.singleOrNull()?.toStaffRow()
            ?: return@transaction throw NoSuchElementException("Staff not found")
        if (before.role == StaffRole.inactive) {
            throw StaffProfileUpdateException.NothingChanged("Сотрудник уже неактивен")
        }
        StaffTable.update(where = { StaffTable.staffId eq staffId }) {
            it[StaffTable.role] = StaffRole.inactive
        }
        StaffAuditTable.insert {
            it[StaffAuditTable.staffId] = staffId
            it[StaffAuditTable.changedAt] = LocalDateTime.now()
            it[StaffAuditTable.changedByStaffId] = changedByStaffId
            it[StaffAuditTable.oldName] = before.name
            it[StaffAuditTable.newName] = before.name
            it[StaffAuditTable.oldEmail] = before.email
            it[StaffAuditTable.newEmail] = before.email
            it[StaffAuditTable.oldPhone] = before.phone
            it[StaffAuditTable.newPhone] = before.phone
            it[StaffAuditTable.oldRole] = before.role
            it[StaffAuditTable.newRole] = StaffRole.inactive
            it[StaffAuditTable.oldPosition] = before.position
            it[StaffAuditTable.newPosition] = before.position
            it[StaffAuditTable.oldPasswordHash] = before.passwordHash
            it[StaffAuditTable.newPasswordHash] = before.passwordHash
        }
        StaffTable.selectAll().where { StaffTable.staffId eq staffId }.single().toStaffRow()
    }

    /**
     * Сотрудник меняет свои данные (имя, email, телефон, должность). Роль не меняется. Проверяется текущий пароль, пишется аудит (changedByStaffId = self).
     * @throws StaffProfileUpdateException.InvalidPassword, EmailAlreadyUsed, PhoneAlreadyUsed, PhoneNotE164, NothingChanged
     */
    fun updateOwnProfileWithAudit(
        staffId: Int,
        currentPassword: String,
        name: String? = null,
        email: String? = null,
        phone: String? = null,
        position: String? = null
    ): StaffRow = transaction {
        val before = StaffTable.selectAll().where { StaffTable.staffId eq staffId }.singleOrNull()?.toStaffRow()
            ?: throw StaffProfileUpdateException.InvalidPassword()
        if (!BCrypt.verifyer().verify(currentPassword.toCharArray(), before.passwordHash).verified) {
            throw StaffProfileUpdateException.InvalidPassword()
        }
        return@transaction updateWithAudit(
            staffId = staffId,
            changedByStaffId = staffId,
            name = name,
            email = email,
            phone = phone,
            role = null,
            position = position
        )
    }

    /**
     * Сотрудник меняет свой пароль. Проверяется текущий пароль, пишется аудит.
     * @throws StaffProfileUpdateException.InvalidPassword
     */
    fun changeOwnPasswordWithAudit(staffId: Int, currentPassword: String, newPasswordHash: String): Unit = transaction {
        val before = StaffTable.selectAll().where { StaffTable.staffId eq staffId }.singleOrNull()?.toStaffRow()
            ?: throw StaffProfileUpdateException.InvalidPassword()
        if (!BCrypt.verifyer().verify(currentPassword.toCharArray(), before.passwordHash).verified) {
            throw StaffProfileUpdateException.InvalidPassword()
        }
        StaffTable.update(where = { StaffTable.staffId eq staffId }) {
            it[StaffTable.passwordHash] = newPasswordHash
        }
        StaffAuditTable.insert {
            it[StaffAuditTable.staffId] = staffId
            it[StaffAuditTable.changedAt] = LocalDateTime.now()
            it[StaffAuditTable.changedByStaffId] = staffId
            it[StaffAuditTable.oldName] = before.name
            it[StaffAuditTable.newName] = before.name
            it[StaffAuditTable.oldEmail] = before.email
            it[StaffAuditTable.newEmail] = before.email
            it[StaffAuditTable.oldPhone] = before.phone
            it[StaffAuditTable.newPhone] = before.phone
            it[StaffAuditTable.oldRole] = before.role
            it[StaffAuditTable.newRole] = before.role
            it[StaffAuditTable.oldPosition] = before.position
            it[StaffAuditTable.newPosition] = before.position
            it[StaffAuditTable.oldPasswordHash] = before.passwordHash
            it[StaffAuditTable.newPasswordHash] = newPasswordHash
        }
    }
}
