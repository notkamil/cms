package ru.itmo.cms.routes

import at.favre.lib.crypto.bcrypt.BCrypt
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import ru.itmo.cms.models.*
import ru.itmo.cms.repository.SpaceRepository
import ru.itmo.cms.repository.SpaceRow
import ru.itmo.cms.repository.SpaceTypeRepository
import ru.itmo.cms.repository.SpaceTypeRow
import ru.itmo.cms.repository.StaffRepository
import ru.itmo.cms.repository.StaffRow
import java.util.*

fun Application.configureStaffRoutes() {
    val jwtConfig = environment.config.config("jwt")
    val secret = jwtConfig.property("secret").getString()
    val issuer = jwtConfig.property("issuer").getString()
    val staffAudience = jwtConfig.property("staffAudience").getString()
    val expiresInSeconds = jwtConfig.property("expiresInSeconds").getString().toLong()

    routing {
        post("/api/staff/auth/login") {
            try {
                val body = call.receive<LoginRequest>()
                val email = body.email.trim().lowercase()
                val staff = StaffRepository.findByEmail(email)
                    ?: run {
                        call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Неверный email или пароль"))
                        return@post
                    }
                if (!BCrypt.verifyer().verify(body.password.toCharArray(), staff.passwordHash).verified) {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Неверный email или пароль"))
                    return@post
                }
                val token = createStaffToken(staff.staffId, staff.email, secret, issuer, staffAudience, expiresInSeconds)
                call.respond(StaffAuthResponse(token = token, staff = staff.toStaffResponse()))
            } catch (e: Exception) {
                call.application.log.error("Staff login failed", e)
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Bad request")))
            }
        }

        authenticate("jwt-staff") {
            get("/api/staff/me") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@get
                }
                val staffId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@get
                }
                val staff = StaffRepository.findById(staffId)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Staff not found"))
                        return@get
                    }
                call.respond(staff.toStaffResponse())
            }

            // ----- Space Types -----
            get("/api/staff/space-types") {
                val list = SpaceTypeRepository.findAll().map { it.toSpaceTypeResponse() }
                call.respond(list)
            }
            post("/api/staff/space-types") {
                val body = call.receive<CreateSpaceTypeRequest>()
                val name = body.name.trim()
                if (name.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Название обязательно"))
                    return@post
                }
                if (SpaceTypeRepository.findByName(name) != null) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Тип с таким названием уже существует"))
                    return@post
                }
                val description = body.description?.trim() ?: ""
                val created = SpaceTypeRepository.create(name, description)
                call.respond(HttpStatusCode.Created, created.toSpaceTypeResponse())
            }
            get("/api/staff/space-types/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@get
                }
                val row = SpaceTypeRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тип пространства не найден"))
                        return@get
                    }
                call.respond(row.toSpaceTypeResponse())
            }
            patch("/api/staff/space-types/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@patch
                }
                val current = SpaceTypeRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тип пространства не найден"))
                        return@patch
                    }
                val body = call.receive<UpdateSpaceTypeRequest>()
                if (body.name == null && body.description == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Укажите name и/или description"))
                    return@patch
                }
                val newName = body.name?.trim()
                if (newName != null && newName.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Название не может быть пустым"))
                    return@patch
                }
                if (newName != null) {
                    val existing = SpaceTypeRepository.findByName(newName)
                    if (existing != null && existing.spaceTypeId != id) {
                        call.respond(HttpStatusCode.Conflict, mapOf("error" to "Тип с таким названием уже существует"))
                        return@patch
                    }
                }
                val updated = SpaceTypeRepository.update(
                    spaceTypeId = id,
                    name = body.name?.trim(),
                    description = body.description?.trim()
                )
                call.respond(updated!!.toSpaceTypeResponse())
            }
            get("/api/staff/space-types/{id}/spaces") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@get
                }
                if (SpaceTypeRepository.findById(id) == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тип пространства не найден"))
                    return@get
                }
                val spaces = SpaceTypeRepository.getSpacesUsingType(id)
                    .map { SpaceSummaryResponse(spaceId = it.spaceId, name = it.name) }
                call.respond(spaces)
            }
            delete("/api/staff/space-types/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@delete
                }
                val current = SpaceTypeRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тип пространства не найден"))
                        return@delete
                    }
                val spaces = SpaceTypeRepository.getSpacesUsingType(id)
                if (spaces.isNotEmpty()) {
                    call.respond(
                        HttpStatusCode.Conflict,
                        DeleteSpaceTypeConflictResponse(
                            error = "Невозможно удалить: существуют пространства с этим типом",
                            spaces = spaces.map { SpaceSummaryResponse(spaceId = it.spaceId, name = it.name) }
                        )
                    )
                    return@delete
                }
                SpaceTypeRepository.delete(id)
                call.respond(HttpStatusCode.NoContent)
            }

            // ----- Spaces -----
            get("/api/staff/spaces") {
                val list = SpaceRepository.findAll().map { it.toSpaceResponse() }
                call.respond(list)
            }
            post("/api/staff/spaces") {
                val body = call.receive<CreateSpaceRequest>()
                val name = body.name.trim()
                if (name.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Название обязательно"))
                    return@post
                }
                if (SpaceRepository.findByName(name) != null) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Пространство с таким названием уже существует"))
                    return@post
                }
                val type = SpaceTypeRepository.findById(body.spaceTypeId)
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Тип пространства не найден"))
                        return@post
                    }
                val created = SpaceRepository.create(
                    name = name,
                    spaceTypeId = body.spaceTypeId,
                    floor = body.floor,
                    capacity = body.capacity,
                    description = body.description?.trim() ?: "",
                    status = body.status?.trim()?.lowercase()?.takeIf { it in listOf("available", "occupied", "maintenance") } ?: "available"
                )
                call.respond(HttpStatusCode.Created, created.toSpaceResponse())
            }
            get("/api/staff/spaces/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@get
                }
                val row = SpaceRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Пространство не найдено"))
                        return@get
                    }
                call.respond(row.toSpaceResponse())
            }
            patch("/api/staff/spaces/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@patch
                }
                val current = SpaceRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Пространство не найдено"))
                        return@patch
                    }
                val body = call.receive<UpdateSpaceRequest>()
                if (body.name == null && body.spaceTypeId == null && body.floor == null && body.capacity == null && body.description == null && body.status == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Укажите хотя бы одно поле для обновления"))
                    return@patch
                }
                val newName = body.name?.trim()
                if (newName != null && newName.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Название не может быть пустым"))
                    return@patch
                }
                if (newName != null) {
                    val existing = SpaceRepository.findByName(newName)
                    if (existing != null && existing.spaceId != id) {
                        call.respond(HttpStatusCode.Conflict, mapOf("error" to "Пространство с таким названием уже существует"))
                        return@patch
                    }
                }
                body.spaceTypeId?.let { typeId ->
                    if (SpaceTypeRepository.findById(typeId) == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Тип пространства не найден"))
                        return@patch
                    }
                }
                val updated = SpaceRepository.update(
                    spaceId = id,
                    name = body.name?.trim(),
                    spaceTypeId = body.spaceTypeId,
                    floor = body.floor,
                    capacity = body.capacity,
                    description = body.description?.trim(),
                    status = body.status?.trim()?.lowercase()?.takeIf { it in listOf("available", "occupied", "maintenance") }
                )
                call.respond(updated!!.toSpaceResponse())
            }
            delete("/api/staff/spaces/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@delete
                }
                if (SpaceRepository.findById(id) == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Пространство не найдено"))
                    return@delete
                }
                SpaceRepository.delete(id)
                call.respond(HttpStatusCode.NoContent)
            }
        }
    }
}

private fun createStaffToken(
    staffId: Int,
    email: String,
    secret: String,
    issuer: String,
    staffAudience: String,
    expiresInSeconds: Long
): String {
    return JWT.create()
        .withSubject(staffId.toString())
        .withIssuer(issuer)
        .withAudience(staffAudience)
        .withClaim("email", email)
        .withExpiresAt(Date(System.currentTimeMillis() + expiresInSeconds * 1000))
        .sign(Algorithm.HMAC256(secret))
}

private fun StaffRow.toStaffResponse() = StaffResponse(
    id = staffId,
    name = name,
    email = email,
    phone = phone,
    role = role.name,
    position = position
)

private fun SpaceTypeRow.toSpaceTypeResponse() = SpaceTypeResponse(
    id = spaceTypeId,
    name = name,
    description = description
)

private fun SpaceRow.toSpaceResponse() = SpaceResponse(
    id = spaceId,
    name = name,
    typeId = spaceTypeId,
    typeName = typeName,
    floor = floor,
    capacity = capacity,
    status = status,
    description = description
)
