package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update

data class AmenityRow(
    val amenityId: Int,
    val name: String,
    val description: String
)

private fun ResultRow.toAmenityRow() = AmenityRow(
    amenityId = this[AmenitiesTable.amenityId],
    name = this[AmenitiesTable.name],
    description = this[AmenitiesTable.description]
)

object AmenityRepository {

    fun findAll(): List<AmenityRow> = transaction {
        AmenitiesTable.selectAll().map { it.toAmenityRow() }
    }

    fun findById(amenityId: Int): AmenityRow? = transaction {
        AmenitiesTable.selectAll().where { AmenitiesTable.amenityId eq amenityId }
            .singleOrNull()
            ?.toAmenityRow()
    }

    fun findByName(name: String): AmenityRow? = transaction {
        AmenitiesTable.selectAll().where { AmenitiesTable.name eq name.trim() }
            .singleOrNull()
            ?.toAmenityRow()
    }

    fun getSpacesUsingAmenity(amenityId: Int): List<SpaceSummaryRow> = transaction {
        val sids = SpaceAmenitiesTable.selectAll().where { SpaceAmenitiesTable.amenityId eq amenityId }
            .map { it[SpaceAmenitiesTable.spaceId] }
        val spaceNames = SpaceRepository.findAll().associateBy { it.spaceId }
        sids.map { sid -> SpaceSummaryRow(spaceId = sid, name = spaceNames[sid]?.name ?: "") }
    }

    /** Названия удобств, привязанных к пространству (для модалки и справочника). */
    fun getAmenityNamesForSpace(spaceId: Int): List<String> = transaction {
        val aids = SpaceAmenitiesTable.selectAll().where { SpaceAmenitiesTable.spaceId eq spaceId }
            .map { it[SpaceAmenitiesTable.amenityId] }
        if (aids.isEmpty()) return@transaction emptyList()
        val aidSet = aids.toSet()
        val byId = AmenitiesTable.selectAll().toList()
            .filter { it[AmenitiesTable.amenityId] in aidSet }
            .associate { it[AmenitiesTable.amenityId] to it[AmenitiesTable.name] }
        aids.map { byId[it] ?: "" }.filter { it.isNotBlank() }
    }

    fun create(name: String, description: String): AmenityRow = transaction {
        val n = name.trim()
        val d = description.trim()
        val id = AmenitiesTable.insert {
            it[AmenitiesTable.name] = n
            it[AmenitiesTable.description] = d
        } get AmenitiesTable.amenityId
        AmenityRow(amenityId = id, name = n, description = d)
    }

    fun update(amenityId: Int, name: String? = null, description: String? = null): AmenityRow? = transaction {
        if (AmenitiesTable.selectAll().where { AmenitiesTable.amenityId eq amenityId }.singleOrNull() == null) return@transaction null
        AmenitiesTable.update(where = { AmenitiesTable.amenityId eq amenityId }) { stmt ->
            name?.let { stmt[AmenitiesTable.name] = it.trim() }
            description?.let { stmt[AmenitiesTable.description] = it.trim() }
        }
        findById(amenityId)
    }

    fun delete(amenityId: Int): Boolean = transaction {
        AmenitiesTable.deleteWhere { AmenitiesTable.amenityId eq amenityId } > 0
    }

    fun getAllAssignments(): List<Pair<Int, Int>> = transaction {
        SpaceAmenitiesTable.selectAll().map { it[SpaceAmenitiesTable.spaceId] to it[SpaceAmenitiesTable.amenityId] }
    }

    fun setAssignments(pairs: List<Pair<Int, Int>>): Unit = transaction {
        val current = getAllAssignments().toSet()
        val newSet = pairs.toSet()
        (current - newSet).forEach { (s, a) ->
            SpaceAmenitiesTable.deleteWhere {
                (SpaceAmenitiesTable.spaceId eq s) and (SpaceAmenitiesTable.amenityId eq a)
            }
        }
        (newSet - current).forEach { (s, a) ->
            SpaceAmenitiesTable.insert {
                it[SpaceAmenitiesTable.spaceId] = s
                it[SpaceAmenitiesTable.amenityId] = a
            }
        }
    }
}
