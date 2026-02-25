package ru.itmo.cms.repository

import org.postgresql.util.PGobject

enum class TariffType {
    fixed,
    hourly,
    `package`
}

/** PGobject for PostgreSQL enum tariff_type */
class PGTariffType(value: TariffType?) : PGobject() {
    init {
        type = "tariff_type"
        this.value = value?.name
    }
}
