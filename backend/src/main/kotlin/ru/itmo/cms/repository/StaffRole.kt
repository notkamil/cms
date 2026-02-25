package ru.itmo.cms.repository

import org.postgresql.util.PGobject

enum class StaffRole {
    superadmin,
    admin,
    staff,
    inactive
}

/** PGobject for PostgreSQL enum staff_role */
class PGStaffRole(value: StaffRole?) : PGobject() {
    init {
        type = "staff_role"
        this.value = value?.name
    }
}
