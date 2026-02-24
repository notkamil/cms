package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import java.math.BigDecimal

data class TariffRow(
    val tariffId: Int,
    val name: String,
    val type: TariffType,
    val durationDays: Int,
    val includedHours: Int,
    val price: BigDecimal,
    val isActive: Boolean
)

private fun ResultRow.toTariffRow() = TariffRow(
    tariffId = this[TariffsTable.tariffId],
    name = this[TariffsTable.name],
    type = this[TariffsTable.type],
    durationDays = this[TariffsTable.durationDays],
    includedHours = this[TariffsTable.includedHours],
    price = this[TariffsTable.price],
    isActive = this[TariffsTable.isActive]
)

object TariffRepository {

    fun findAll(): List<TariffRow> = transaction {
        TariffsTable.selectAll().map { it.toTariffRow() }
    }

    fun findById(tariffId: Int): TariffRow? = transaction {
        TariffsTable.selectAll().where { TariffsTable.tariffId eq tariffId }
            .singleOrNull()
            ?.toTariffRow()
    }

    fun findByName(name: String): TariffRow? = transaction {
        TariffsTable.selectAll().where { TariffsTable.name eq name.trim() }
            .singleOrNull()
            ?.toTariffRow()
    }

    /** Всего подписок по тарифу (любой статус) */
    fun countSubscriptions(tariffId: Int): Int = transaction {
        SubscriptionsTable.selectAll().where { SubscriptionsTable.tariffId eq tariffId }.toList().size
    }

    /** Активных подписок (status = active) по тарифу */
    fun countActiveSubscriptions(tariffId: Int): Int = transaction {
        SubscriptionsTable.selectAll()
            .where { (SubscriptionsTable.tariffId eq tariffId) and (SubscriptionsTable.status eq SubscriptionStatus.active) }
            .toList().size
    }

    fun create(
        name: String,
        type: TariffType,
        durationDays: Int,
        includedHours: Int,
        price: BigDecimal,
        isActive: Boolean = true
    ): TariffRow = transaction {
        val n = name.trim()
        val id = TariffsTable.insert {
            it[TariffsTable.name] = n
            it[TariffsTable.type] = type
            it[TariffsTable.durationDays] = durationDays.coerceAtLeast(0)
            it[TariffsTable.includedHours] = includedHours.coerceAtLeast(0)
            it[TariffsTable.price] = price
            it[TariffsTable.isActive] = isActive
        } get TariffsTable.tariffId
        findById(id)!!
    }

    /**
     * Обновление тарифа.
     * Тип менять нельзя.
     * Длительность, включённые часы, цену — только если нет активных подписок.
     * Название — если нет конфликтов.
     * Активность можно менять всегда.
     */
    fun update(
        tariffId: Int,
        name: String? = null,
        durationDays: Int? = null,
        includedHours: Int? = null,
        price: BigDecimal? = null,
        isActive: Boolean? = null
    ): TariffRow? = transaction {
        val existing = TariffsTable.selectAll().where { TariffsTable.tariffId eq tariffId }.singleOrNull() ?: return@transaction null
        val activeCount = countActiveSubscriptions(tariffId)
        val canChangeRestricted = activeCount == 0

        TariffsTable.update(where = { TariffsTable.tariffId eq tariffId }) { stmt ->
            name?.let { n ->
                val t = n.trim()
                if (t.isNotEmpty()) stmt[TariffsTable.name] = t
            }
            if (canChangeRestricted) {
                durationDays?.let { stmt[TariffsTable.durationDays] = it.coerceAtLeast(0) }
                includedHours?.let { stmt[TariffsTable.includedHours] = it.coerceAtLeast(0) }
                price?.let { stmt[TariffsTable.price] = it }
            }
            isActive?.let { stmt[TariffsTable.isActive] = it }
        }
        findById(tariffId)
    }

    fun delete(tariffId: Int): Boolean = transaction {
        if (countSubscriptions(tariffId) > 0) return@transaction false
        TariffSpacesTable.deleteWhere { TariffSpacesTable.tariffId eq tariffId }
        TariffsTable.deleteWhere { TariffsTable.tariffId eq tariffId } > 0
    }

    fun getAllAssignments(): List<Pair<Int, Int>> = transaction {
        TariffSpacesTable.selectAll().map { it[TariffSpacesTable.tariffId] to it[TariffSpacesTable.spaceId] }
    }

    fun getSpaceIdsByTariffId(tariffId: Int): List<Int> = transaction {
        TariffSpacesTable.selectAll().where { TariffSpacesTable.tariffId eq tariffId }
            .map { it[TariffSpacesTable.spaceId] }
    }

    fun getTariffIdsBySpaceId(spaceId: Int): List<Int> = transaction {
        TariffSpacesTable.selectAll().where { TariffSpacesTable.spaceId eq spaceId }
            .map { it[TariffSpacesTable.tariffId] }
    }

    fun setAssignments(pairs: List<Pair<Int, Int>>): Unit = transaction {
        val current = getAllAssignments().toSet()
        val newSet = pairs.toSet()
        (current - newSet).forEach { (t, s) ->
            TariffSpacesTable.deleteWhere {
                (TariffSpacesTable.tariffId eq t) and (TariffSpacesTable.spaceId eq s)
            }
        }
        (newSet - current).forEach { (t, s) ->
            TariffSpacesTable.insert {
                it[TariffSpacesTable.tariffId] = t
                it[TariffSpacesTable.spaceId] = s
            }
        }
    }
}
