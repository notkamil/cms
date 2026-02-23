package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.select
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update

data class SpaceTypeRow(
    val spaceTypeId: Int,
    val name: String,
    val description: String
)

data class SpaceSummaryRow(val spaceId: Int, val name: String)

fun ResultRow.toSpaceTypeRow() = SpaceTypeRow(
    spaceTypeId = this[SpaceTypesTable.spaceTypeId],
    name = this[SpaceTypesTable.name],
    description = this[SpaceTypesTable.description]
)

object SpaceTypeRepository {

    fun findAll(): List<SpaceTypeRow> = transaction {
        SpaceTypesTable.selectAll()
            .map { it.toSpaceTypeRow() }
    }

    fun findById(spaceTypeId: Int): SpaceTypeRow? = transaction {
        SpaceTypesTable.selectAll().where { SpaceTypesTable.spaceTypeId eq spaceTypeId }
            .singleOrNull()
            ?.toSpaceTypeRow()
    }

    fun findByName(name: String): SpaceTypeRow? = transaction {
        SpaceTypesTable.selectAll().where { SpaceTypesTable.name eq name.trim() }
            .singleOrNull()
            ?.toSpaceTypeRow()
    }

    fun getSpacesUsingType(spaceTypeId: Int): List<SpaceSummaryRow> = transaction {
        SpacesTable.selectAll().where { SpacesTable.spaceTypeId eq spaceTypeId }
            .map { SpaceSummaryRow(spaceId = it[SpacesTable.spaceId], name = it[SpacesTable.name]) }
    }

    fun create(name: String, description: String): SpaceTypeRow = transaction {
        val n = name.trim()
        val d = description.trim()
        val id = SpaceTypesTable.insert {
            it[SpaceTypesTable.name] = n
            it[SpaceTypesTable.description] = d
        } get SpaceTypesTable.spaceTypeId
        SpaceTypeRow(spaceTypeId = id, name = n, description = d)
    }

    fun update(spaceTypeId: Int, name: String? = null, description: String? = null): SpaceTypeRow? = transaction {
        if (SpaceTypesTable.selectAll().where { SpaceTypesTable.spaceTypeId eq spaceTypeId }.singleOrNull() == null) return@transaction null
        SpaceTypesTable.update(where = { SpaceTypesTable.spaceTypeId eq spaceTypeId }) { stmt ->
            name?.let { v -> stmt[SpaceTypesTable.name] = v.trim() }
            description?.let { v -> stmt[SpaceTypesTable.description] = v.trim() }
        }
        findById(spaceTypeId)
    }

    fun delete(spaceTypeId: Int): Boolean = transaction {
        SpaceTypesTable.deleteWhere { SpaceTypesTable.spaceTypeId eq spaceTypeId } > 0
    }
}
