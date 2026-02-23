package ru.itmo.cms.util

import org.postgresql.util.PGobject
import ru.itmo.cms.repository.SpaceStatus

/**
 * Преобразует значение из БД (при чтении) в [SpaceStatus].
 */
fun spaceStatusFromDb(value: Any): SpaceStatus = when (value) {
    is PGobject -> SpaceStatus.valueOf(value.value!!)
    is String -> SpaceStatus.valueOf(value)
    else -> SpaceStatus.valueOf(value.toString())
}
