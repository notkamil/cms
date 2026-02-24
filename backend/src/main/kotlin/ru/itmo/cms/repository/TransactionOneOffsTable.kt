package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object TransactionOneOffsTable : Table("transactiononeoffs") {
    val transactionId = integer("transactionid").references(TransactionsTable.transactionId)
    val oneOffId = integer("oneoffid").references(OneOffsTable.oneOffId)

    override val primaryKey = PrimaryKey(transactionId)
}
