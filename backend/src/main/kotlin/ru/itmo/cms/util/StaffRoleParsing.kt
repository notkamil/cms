package ru.itmo.cms.util

import org.postgresql.util.PGobject
import ru.itmo.cms.repository.StaffRole

/**
 * Преобразует значение из БД (при чтении) в [StaffRole].
 * Драйвер PostgreSQL может вернуть enum как [PGobject] или как [String].
 */
fun staffRoleFromDb(value: Any): StaffRole = when (value) {
    is PGobject -> StaffRole.valueOf(value.value!!)
    is String -> StaffRole.valueOf(value)
    else -> StaffRole.valueOf(value.toString())
}
