package ru.itmo.cms.repository

import org.postgresql.util.PGobject

enum class TransactionType {
    deposit,
    payment,
    refund,
    bonus,
    withdrawal
}

/** PGobject для записи PostgreSQL enum в колонку transaction_type */
class PGTransactionType(value: TransactionType?) : PGobject() {
    init {
        type = "transaction_type"
        this.value = value?.name
    }
}
