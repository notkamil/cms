package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.javatime.date
import ru.itmo.cms.util.subscriptionStatusFromDb

object SubscriptionsTable : Table("subscriptions") {
    val subscriptionId = integer("subscriptionid").autoIncrement()
    val memberId = integer("memberid").references(MembersTable.memberId)
    val tariffId = integer("tariffid").references(TariffsTable.tariffId)
    val startDate = date("startdate")
    val endDate = date("enddate")
    val remainingHours = integer("remaininghours").default(0)
    val status: Column<SubscriptionStatus> = customEnumeration(
        name = "status",
        sql = "subscription_status",
        fromDb = { subscriptionStatusFromDb(it) },
        toDb = { PGSubscriptionStatus(it) }
    )

    override val primaryKey = PrimaryKey(subscriptionId)
}
