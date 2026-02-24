package ru.itmo.cms.util

import org.postgresql.util.PGobject
import ru.itmo.cms.repository.SubscriptionStatus

fun subscriptionStatusFromDb(value: Any): SubscriptionStatus = when (value) {
    is PGobject -> SubscriptionStatus.valueOf(value.value!!)
    is String -> SubscriptionStatus.valueOf(value)
    else -> SubscriptionStatus.valueOf(value.toString())
}
