package ru.itmo.cms.util

import org.postgresql.util.PGobject
import ru.itmo.cms.repository.TariffType

fun tariffTypeFromDb(value: Any): TariffType = when (value) {
    is PGobject -> TariffType.valueOf(value.value!!)
    is String -> TariffType.valueOf(value)
    else -> TariffType.valueOf(value.toString())
}
