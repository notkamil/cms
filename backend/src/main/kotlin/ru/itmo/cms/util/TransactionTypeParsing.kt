package ru.itmo.cms.util

import org.postgresql.util.PGobject
import ru.itmo.cms.repository.TransactionType

/**
 * Преобразует значение из БД (при чтении) в [TransactionType].
 * Драйвер PostgreSQL может вернуть enum как [PGobject] или как [String].
 */
fun transactionTypeFromDb(value: Any): TransactionType = when (value) {
    is PGobject -> TransactionType.valueOf(value.value!!)
    is String -> TransactionType.valueOf(value)
    else -> TransactionType.valueOf(value.toString())
}
