package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Table

object TransactionSubscriptionsTable : Table("transactionsubscriptions") {
    val transactionId = integer("transactionid").references(TransactionsTable.transactionId)
    val subscriptionId = integer("subscriptionid").references(SubscriptionsTable.subscriptionId)

    override val primaryKey = PrimaryKey(transactionId)
}
