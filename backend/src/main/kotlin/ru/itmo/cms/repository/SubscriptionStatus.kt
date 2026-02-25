package ru.itmo.cms.repository

import org.postgresql.util.PGobject

enum class SubscriptionStatus {
    active,
    expired,
    cancelled
}

/** PGobject for PostgreSQL enum subscription_status */
class PGSubscriptionStatus(value: SubscriptionStatus?) : PGobject() {
    init {
        type = "subscription_status"
        this.value = value?.name
    }
}
