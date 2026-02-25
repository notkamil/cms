package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greater
import org.jetbrains.exposed.v1.core.neq
import org.jetbrains.exposed.v1.core.or
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import java.time.LocalDateTime

data class SpaceRow(
    val spaceId: Int,
    val spaceTypeId: Int,
    val typeName: String,
    val name: String,
    val floor: Int,
    val capacity: Int,
    val status: String,
    val description: String
)

private fun stringToSpaceStatus(s: String): SpaceStatus = when (s.trim().lowercase()) {
    "occupied" -> SpaceStatus.occupied
    "maintenance" -> SpaceStatus.maintenance
    "disabled" -> SpaceStatus.disabled
    else -> SpaceStatus.available
}

private fun ResultRow.toSpaceRow(typeName: String) = SpaceRow(
    spaceId = this[SpacesTable.spaceId],
    spaceTypeId = this[SpacesTable.spaceTypeId],
    typeName = typeName,
    name = this[SpacesTable.name],
    floor = this[SpacesTable.floor],
    capacity = this[SpacesTable.capacity],
    status = this[SpacesTable.status].name,
    description = this[SpacesTable.description]
)

object SpaceRepository {

    fun findAll(): List<SpaceRow> = transaction {
        val typeNames = SpaceTypeRepository.findAll().associate { it.spaceTypeId to it.name }
        SpacesTable.selectAll().map { it.toSpaceRow(typeNames[it[SpacesTable.spaceTypeId]]!!) }
    }

    /** Пространства с статусом != disabled (для бронирований, подписок, выбора пространства). */
    fun findAllActive(): List<SpaceRow> = transaction {
        val typeNames = SpaceTypeRepository.findAll().associate { it.spaceTypeId to it.name }
        SpacesTable.selectAll()
            .where { SpacesTable.status neq SpaceStatus.disabled }
            .map { it.toSpaceRow(typeNames[it[SpacesTable.spaceTypeId]]!!) }
    }

    /** Пространства только available и occupied (для справочника у пользователя; без disabled и maintenance). */
    fun findAllAvailableAndOccupied(): List<SpaceRow> = transaction {
        val typeNames = SpaceTypeRepository.findAll().associate { it.spaceTypeId to it.name }
        SpacesTable.selectAll()
            .where { (SpacesTable.status eq SpaceStatus.available).or(SpacesTable.status eq SpaceStatus.occupied) }
            .map { it.toSpaceRow(typeNames[it[SpacesTable.spaceTypeId]]!!) }
    }

    fun findById(spaceId: Int): SpaceRow? = transaction {
        val row = SpacesTable.selectAll().where { SpacesTable.spaceId eq spaceId }.singleOrNull() ?: return@transaction null
        val typeName = SpaceTypeRepository.findById(row[SpacesTable.spaceTypeId])!!.name
        row.toSpaceRow(typeName)
    }

    fun findByName(name: String): SpaceRow? = transaction {
        val row = SpacesTable.selectAll().where { SpacesTable.name eq name.trim() }.singleOrNull() ?: return@transaction null
        val typeName = SpaceTypeRepository.findById(row[SpacesTable.spaceTypeId])!!.name
        row.toSpaceRow(typeName)
    }

    fun create(
        name: String,
        spaceTypeId: Int,
        floor: Int,
        capacity: Int,
        description: String = "",
        status: String = "available"
    ): SpaceRow = transaction {
        val n = name.trim()
        val d = description.trim()
        val statusEnum = stringToSpaceStatus(status)
        val id = SpacesTable.insert {
            it[SpacesTable.name] = n
            it[SpacesTable.spaceTypeId] = spaceTypeId
            it[SpacesTable.floor] = floor
            it[SpacesTable.capacity] = capacity
            it[SpacesTable.description] = d
            it[SpacesTable.status] = statusEnum
        } get SpacesTable.spaceId
        val typeName = SpaceTypeRepository.findById(spaceTypeId)!!.name
        SpaceRow(spaceId = id, spaceTypeId = spaceTypeId, typeName = typeName, name = n, floor = floor, capacity = capacity, status = statusEnum.name, description = d)
    }

    fun update(
        spaceId: Int,
        name: String? = null,
        spaceTypeId: Int? = null,
        floor: Int? = null,
        capacity: Int? = null,
        description: String? = null,
        status: String? = null
    ): SpaceRow? = transaction {
        val existing = SpacesTable.selectAll().where { SpacesTable.spaceId eq spaceId }.singleOrNull() ?: return@transaction null
        val statusEnum = status?.trim()?.lowercase()?.takeIf { it in listOf("available", "occupied", "maintenance", "disabled") }?.let { stringToSpaceStatus(it) }
        SpacesTable.update(where = { SpacesTable.spaceId eq spaceId }) { stmt ->
            name?.let { stmt[SpacesTable.name] = it.trim() }
            spaceTypeId?.let { stmt[SpacesTable.spaceTypeId] = it }
            floor?.let { stmt[SpacesTable.floor] = it }
            capacity?.let { stmt[SpacesTable.capacity] = it }
            description?.let { stmt[SpacesTable.description] = it.trim() }
            statusEnum?.let { stmt[SpacesTable.status] = it }
        }
        findById(spaceId)
    }

    /** Мягкое удаление: устанавливает status = disabled. Сохраняет историю (бронирования, тарифы). */
    fun setDisabled(spaceId: Int): SpaceRow? = transaction {
        val row = SpacesTable.selectAll().where { SpacesTable.spaceId eq spaceId }.singleOrNull() ?: return@transaction null
        SpacesTable.update(where = { SpacesTable.spaceId eq spaceId }) {
            it[SpacesTable.status] = SpaceStatus.disabled
        }
        findById(spaceId)
    }

    /**
     * Синхронизирует статусы available/occupied по текущим бронированиям.
     * Пространства с maintenance и disabled не трогаем.
     * Вызывать из фонового планировщика.
     */
    fun syncSpaceStatusFromBookings(): Unit = transaction {
        val now = LocalDateTime.now()
        val rows = BookingsTable.selectAll().where {
            (BookingsTable.status eq BookingStatus.confirmed) and (BookingsTable.endTime greater now)
        }.toList()
        val spaceIdsWithCurrentBooking = rows
            .filter { it[BookingsTable.startTime] <= now }
            .map { it[BookingsTable.spaceId] }
            .toSet()
        val spaceIdsToSync = SpacesTable.selectAll().where {
            (SpacesTable.status eq SpaceStatus.available).or(SpacesTable.status eq SpaceStatus.occupied)
        }.map { it[SpacesTable.spaceId] }
        spaceIdsToSync.forEach { sid ->
            SpacesTable.update(where = { SpacesTable.spaceId eq sid }) {
                it[SpacesTable.status] = if (sid in spaceIdsWithCurrentBooking) SpaceStatus.occupied else SpaceStatus.available
            }
        }
    }
}
