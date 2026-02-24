package ru.itmo.cms.repository

import org.postgresql.util.PGobject

enum class SubscriptionStatus {
    active,
    expired,
    cancelled
}

/** PGobject для записи PostgreSQL enum subscription_status */
class PGSubscriptionStatus(value: SubscriptionStatus?) : PGobject() {
    init {
        type = "subscription_status"
        this.value = value?.name
    }
}
