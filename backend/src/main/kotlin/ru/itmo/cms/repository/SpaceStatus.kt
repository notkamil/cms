package ru.itmo.cms.repository

import org.postgresql.util.PGobject

enum class SpaceStatus {
    available,
    occupied,
    maintenance
}

/** PGobject для записи PostgreSQL enum space_status */
class PGSpaceStatus(value: SpaceStatus?) : PGobject() {
    init {
        type = "space_status"
        this.value = value?.name
    }
}
