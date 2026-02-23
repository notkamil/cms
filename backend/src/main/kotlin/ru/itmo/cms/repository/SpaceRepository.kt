package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update

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
        val statusEnum = status?.trim()?.lowercase()?.takeIf { it in listOf("available", "occupied", "maintenance") }?.let { stringToSpaceStatus(it) }
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

    fun delete(spaceId: Int): Boolean = transaction {
        SpaceAmenitiesTable.deleteWhere { SpaceAmenitiesTable.spaceId eq spaceId }
        SpacesTable.deleteWhere { SpacesTable.spaceId eq spaceId } > 0
    }
}
