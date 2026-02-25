package ru.itmo.cms.repository

import org.postgresql.util.PGobject

enum class TransactionType {
    deposit,
    payment,
    refund,
    bonus,
    withdrawal
}

/** PGobject for PostgreSQL enum in column transaction_type */
class PGTransactionType(value: TransactionType?) : PGobject() {
    init {
        type = "transaction_type"
        this.value = value?.name
    }
}
