package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.datetime
import org.postgresql.util.PGobject
import ru.itmo.cms.util.transactionTypeFromDb

object TransactionsTable : Table("transactions") {
    val transactionId = integer("transactionid").autoIncrement()
    val memberId = integer("memberid").references(MembersTable.memberId)
    val amount = decimal("amount", 10, 2)
    val transactionType: Column<TransactionType> = customEnumeration(
        name = "transactiontype",
        sql = "transaction_type",
        fromDb = { transactionTypeFromDb(it) },
        toDb = { PGTransactionType(it) }
    )
    val transactionDate = datetime("transactiondate")
    val description = text("description").default("")

    override val primaryKey = PrimaryKey(transactionId)
}
