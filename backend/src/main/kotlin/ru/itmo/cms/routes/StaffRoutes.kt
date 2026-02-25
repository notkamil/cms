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
import ru.itmo.cms.repository.AmenityRepository
import ru.itmo.cms.repository.AmenityRow
import ru.itmo.cms.repository.SpaceRepository
import ru.itmo.cms.repository.SpaceRow
import ru.itmo.cms.repository.SpaceTypeRepository
import ru.itmo.cms.repository.SpaceTypeRow
import ru.itmo.cms.repository.StaffProfileUpdateException
import ru.itmo.cms.repository.StaffRepository
import ru.itmo.cms.repository.StaffRole
import ru.itmo.cms.repository.StaffRow
import ru.itmo.cms.repository.SubscriptionRepository
import ru.itmo.cms.repository.SubscriptionStatus
import ru.itmo.cms.repository.StaffSubscriptionRow
import ru.itmo.cms.repository.TariffRepository
import ru.itmo.cms.repository.TariffRow
import ru.itmo.cms.repository.TariffType
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.selectAll
import ru.itmo.cms.repository.BookingRepository
import ru.itmo.cms.repository.BookingRepository.BookingWithSubscriptionInfo
import ru.itmo.cms.repository.BookingTimelineRow
import ru.itmo.cms.repository.BookingsTable
import ru.itmo.cms.repository.BookingStatus
import ru.itmo.cms.repository.MemberRepository
import ru.itmo.cms.repository.MemberRow
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
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
                if (staff.role == StaffRole.inactive) {
                    call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Учётная запись деактивирована"))
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
            patch("/api/staff/me") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@patch
                }
                val staffId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@patch
                }
                val body = call.receive<PatchStaffMeRequest>()
                try {
                    val updated = StaffRepository.updateOwnProfileWithAudit(
                        staffId = staffId,
                        currentPassword = body.currentPassword,
                        name = body.name,
                        email = body.email,
                        phone = body.phone,
                        position = body.position
                    )
                    call.respond(updated.toStaffResponse())
                } catch (e: StaffProfileUpdateException) {
                    when (e) {
                        is StaffProfileUpdateException.InvalidPassword ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Неверный пароль")))
                        is StaffProfileUpdateException.EmailAlreadyUsed ->
                            call.respond(HttpStatusCode.Conflict, mapOf("error" to (e.message ?: "Email уже используется")))
                        is StaffProfileUpdateException.PhoneAlreadyUsed ->
                            call.respond(HttpStatusCode.Conflict, mapOf("error" to (e.message ?: "Телефон уже используется")))
                        is StaffProfileUpdateException.PhoneNotE164 ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Телефон в формате +79001234567")))
                        is StaffProfileUpdateException.NothingChanged ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Ничего не изменено")))
                        else -> call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Bad request")))
                    }
                }
            }
            put("/api/staff/me/password") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@put
                }
                val staffId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@put
                }
                val body = call.receive<PutPasswordRequest>()
                if (body.newPassword.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Укажите новый пароль"))
                    return@put
                }
                try {
                    val hash = BCrypt.withDefaults().hashToString(12, body.newPassword.toCharArray())
                    StaffRepository.changeOwnPasswordWithAudit(staffId, body.currentPassword, hash)
                    call.respond(HttpStatusCode.NoContent)
                } catch (e: StaffProfileUpdateException.InvalidPassword) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Неверный пароль")))
                }
            }

            // ----- Staff list (admin/superadmin only) -----
            get("/api/staff/staff") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@get
                }
                val currentId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@get
                }
                val current = StaffRepository.findById(currentId)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Staff not found"))
                        return@get
                    }
                if (current.role != StaffRole.superadmin && current.role != StaffRole.admin) {
                    call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Доступ только для администратора"))
                    return@get
                }
                val list = StaffRepository.findAll().map { it.toStaffResponse() }
                call.respond(list)
            }
            post("/api/staff/staff") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@post
                }
                val currentId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@post
                }
                val current = StaffRepository.findById(currentId)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Staff not found"))
                        return@post
                    }
                if (current.role != StaffRole.superadmin && current.role != StaffRole.admin) {
                    call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Доступ только для администратора"))
                    return@post
                }
                val body = call.receive<CreateStaffRequest>()
                val role = runCatching { StaffRole.valueOf(body.role) }.getOrNull()
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Недопустимая роль"))
                        return@post
                    }
                if (role == StaffRole.inactive) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Нельзя создать сотрудника с ролью неактивен"))
                    return@post
                }
                if (role == StaffRole.superadmin) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Нельзя создать суперадмина через интерфейс"))
                    return@post
                }
                if (current.role == StaffRole.admin && role != StaffRole.staff) {
                    call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Администратор может создавать только сотрудников"))
                    return@post
                }
                if (body.password.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Укажите пароль"))
                    return@post
                }
                try {
                    val hash = BCrypt.withDefaults().hashToString(12, body.password.toCharArray())
                    val created = StaffRepository.createWithAudit(
                        name = body.name.trim(),
                        email = body.email,
                        phone = body.phone,
                        role = role,
                        position = body.position.trim().ifBlank { "" },
                        passwordHash = hash,
                        changedByStaffId = currentId
                    )
                    call.respond(HttpStatusCode.Created, created.toStaffResponse())
                } catch (e: StaffProfileUpdateException) {
                    when (e) {
                        is StaffProfileUpdateException.InvalidInput ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Bad request")))
                        is StaffProfileUpdateException.EmailAlreadyUsed ->
                            call.respond(HttpStatusCode.Conflict, mapOf("error" to (e.message ?: "Email already used")))
                        is StaffProfileUpdateException.PhoneAlreadyUsed ->
                            call.respond(HttpStatusCode.Conflict, mapOf("error" to (e.message ?: "Phone already used")))
                        is StaffProfileUpdateException.PhoneNotE164 ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid phone")))
                        else -> call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Bad request")))
                    }
                }
            }
            patch("/api/staff/staff/{id}") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@patch
                }
                val currentId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@patch
                }
                val current = StaffRepository.findById(currentId)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Staff not found"))
                        return@patch
                    }
                if (current.role == StaffRole.staff) {
                    call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Сотрудник не может редактировать других сотрудников"))
                    return@patch
                }
                if (current.role != StaffRole.superadmin && current.role != StaffRole.admin) {
                    call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Доступ только для администратора"))
                    return@patch
                }
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@patch
                }
                val target = StaffRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Сотрудник не найден"))
                        return@patch
                    }
                val body = call.receive<UpdateStaffRequest>()
                val newRole = body.role?.let { runCatching { StaffRole.valueOf(it) }.getOrNull() }
                if (body.role != null && newRole == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Недопустимая роль"))
                    return@patch
                }
                if (newRole == StaffRole.inactive) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Для увольнения используйте действие «Уволить»"))
                    return@patch
                }
                if (newRole == StaffRole.superadmin) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Нельзя назначить роль суперадмин через интерфейс"))
                    return@patch
                }
                if (current.role == StaffRole.admin) {
                    if (target.role == StaffRole.superadmin || target.role == StaffRole.admin) {
                        call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Администратор может редактировать только сотрудников"))
                        return@patch
                    }
                    if (target.role == StaffRole.inactive && newRole != StaffRole.staff) {
                        call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Администратор может восстановить только с ролью «Сотрудник»"))
                        return@patch
                    }
                    if (target.role == StaffRole.staff && newRole != null && newRole != StaffRole.staff) {
                        call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Администратор может назначать только роль «Сотрудник»"))
                        return@patch
                    }
                }
                try {
                    val updated = StaffRepository.updateWithAudit(
                        staffId = id,
                        changedByStaffId = currentId,
                        name = body.name,
                        email = body.email,
                        phone = body.phone,
                        role = newRole,
                        position = body.position
                    )
                    call.respond(updated.toStaffResponse())
                } catch (e: StaffProfileUpdateException) {
                    when (e) {
                        is StaffProfileUpdateException.NothingChanged ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Nothing changed")))
                        is StaffProfileUpdateException.EmailAlreadyUsed ->
                            call.respond(HttpStatusCode.Conflict, mapOf("error" to (e.message ?: "Email already used")))
                        is StaffProfileUpdateException.PhoneAlreadyUsed ->
                            call.respond(HttpStatusCode.Conflict, mapOf("error" to (e.message ?: "Phone already used")))
                        is StaffProfileUpdateException.PhoneNotE164 ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid phone")))
                        else -> call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Bad request")))
                    }
                } catch (e: NoSuchElementException) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Сотрудник не найден"))
                }
            }
            post("/api/staff/staff/{id}/dismiss") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@post
                }
                val currentId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@post
                }
                val current = StaffRepository.findById(currentId)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Staff not found"))
                        return@post
                    }
                if (current.role == StaffRole.staff) {
                    call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Сотрудник не может увольнять других сотрудников"))
                    return@post
                }
                if (current.role != StaffRole.superadmin && current.role != StaffRole.admin) {
                    call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Доступ только для администратора"))
                    return@post
                }
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@post
                }
                val target = StaffRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Сотрудник не найден"))
                        return@post
                    }
                if (current.role == StaffRole.admin && target.role != StaffRole.staff) {
                    call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Администратор может уволить только сотрудников"))
                    return@post
                }
                if (currentId == id) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Нельзя уволить самого себя"))
                    return@post
                }
                try {
                    val updated = StaffRepository.setInactiveWithAudit(staffId = id, changedByStaffId = currentId)
                    call.respond(updated.toStaffResponse())
                } catch (e: StaffProfileUpdateException.NothingChanged) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Сотрудник уже неактивен")))
                } catch (e: NoSuchElementException) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Сотрудник не найден"))
                }
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
                val space = SpaceRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Пространство не найдено"))
                        return@delete
                    }
                if (space.status == "disabled") {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Пространство уже отключено (архивное)"))
                    return@delete
                }
                val activeBookings = BookingRepository.countActiveUpcomingBookingsForSpace(id)
                if (activeBookings > 0) {
                    call.respond(
                        HttpStatusCode.Conflict,
                        mapOf("error" to "Невозможно отключить: есть активные предстоящие бронирования ($activeBookings)")
                    )
                    return@delete
                }
                SpaceRepository.setDisabled(id)
                call.respond(HttpStatusCode.NoContent)
            }

            // ----- Amenities -----
            get("/api/staff/amenities") {
                val list = AmenityRepository.findAll().map { it.toAmenityResponse() }
                call.respond(list)
            }
            post("/api/staff/amenities") {
                val body = call.receive<CreateAmenityRequest>()
                val name = body.name.trim()
                if (name.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Название обязательно"))
                    return@post
                }
                if (AmenityRepository.findByName(name) != null) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Удобство с таким названием уже существует"))
                    return@post
                }
                val description = body.description?.trim() ?: ""
                val created = AmenityRepository.create(name, description)
                call.respond(HttpStatusCode.Created, created.toAmenityResponse())
            }
            get("/api/staff/amenities/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@get
                }
                val row = AmenityRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Удобство не найдено"))
                        return@get
                    }
                call.respond(row.toAmenityResponse())
            }
            patch("/api/staff/amenities/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@patch
                }
                val current = AmenityRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Удобство не найдено"))
                        return@patch
                    }
                val body = call.receive<UpdateAmenityRequest>()
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
                    val existing = AmenityRepository.findByName(newName)
                    if (existing != null && existing.amenityId != id) {
                        call.respond(HttpStatusCode.Conflict, mapOf("error" to "Удобство с таким названием уже существует"))
                        return@patch
                    }
                }
                val updated = AmenityRepository.update(id, name = body.name?.trim(), description = body.description?.trim())
                call.respond(updated!!.toAmenityResponse())
            }
            get("/api/staff/amenities/{id}/spaces") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@get
                }
                if (AmenityRepository.findById(id) == null) {
                    call.respond(HttpStatusCode.NotFound, mapOf("error" to "Удобство не найдено"))
                    return@get
                }
                val spaces = AmenityRepository.getSpacesUsingAmenity(id)
                    .map { SpaceSummaryResponse(spaceId = it.spaceId, name = it.name) }
                call.respond(spaces)
            }
            delete("/api/staff/amenities/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@delete
                }
                val current = AmenityRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Удобство не найдено"))
                        return@delete
                    }
                val spaces = AmenityRepository.getSpacesUsingAmenity(id)
                if (spaces.isNotEmpty()) {
                    call.respond(
                        HttpStatusCode.Conflict,
                        DeleteAmenityConflictResponse(
                            error = "Невозможно удалить: удобство привязано к пространствам",
                            spaces = spaces.map { SpaceSummaryResponse(spaceId = it.spaceId, name = it.name) }
                        )
                    )
                    return@delete
                }
                AmenityRepository.delete(id)
                call.respond(HttpStatusCode.NoContent)
            }

            // ----- Space-Amenity assignments -----
            get("/api/staff/space-amenities") {
                val pairs = AmenityRepository.getAllAssignments()
                call.respond(pairs.map { SpaceAmenityAssignment(spaceId = it.first, amenityId = it.second) })
            }
            put("/api/staff/space-amenities") {
                val body = call.receive<PutSpaceAmenitiesRequest>()
                val pairs = body.assignments.map { it.spaceId to it.amenityId }
                AmenityRepository.setAssignments(pairs)
                call.respond(HttpStatusCode.NoContent)
            }

            // ----- Tariffs -----
            get("/api/staff/tariffs") {
                val list = TariffRepository.findAll().map { it.toTariffResponse() }
                call.respond(list)
            }
            post("/api/staff/tariffs") {
                val body = call.receive<CreateTariffRequest>()
                val name = body.name.trim()
                if (name.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Название обязательно"))
                    return@post
                }
                if (TariffRepository.findByName(name) != null) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Тариф с таким названием уже существует"))
                    return@post
                }
                val type = when (body.type.trim().lowercase()) {
                    "fixed" -> TariffType.fixed
                    "hourly" -> TariffType.hourly
                    "package" -> TariffType.`package`
                    else -> {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Тип тарифа: fixed, hourly или package"))
                        return@post
                    }
                }
                val priceStr = body.price.trim()
                val price = priceStr.toBigDecimalOrNull()
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Некорректная цена"))
                        return@post
                    }
                if (price < BigDecimal.ZERO) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Цена не может быть отрицательной"))
                    return@post
                }
                if (price.stripTrailingZeros().scale() > 2) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Цена: не более двух знаков после запятой"))
                    return@post
                }
                val durationDays = when (type) {
                    TariffType.hourly -> 0
                    else -> body.durationDays.coerceAtLeast(0)
                }
                val includedHours = when (type) {
                    TariffType.hourly -> 1
                    TariffType.fixed -> 0
                    TariffType.`package` -> body.includedHours.coerceAtLeast(0)
                }
                val created = TariffRepository.create(
                    name = name,
                    type = type,
                    durationDays = durationDays,
                    includedHours = includedHours,
                    price = price,
                    isActive = body.isActive
                )
                call.respond(HttpStatusCode.Created, created.toTariffResponse())
            }
            get("/api/staff/tariffs/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@get
                }
                val row = TariffRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тариф не найден"))
                        return@get
                    }
                call.respond(row.toTariffResponse())
            }
            patch("/api/staff/tariffs/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@patch
                }
                val current = TariffRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тариф не найден"))
                        return@patch
                    }
                val body = call.receive<UpdateTariffRequest>()
                if (body.name == null && body.durationDays == null && body.includedHours == null && body.price == null && body.isActive == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Укажите хотя бы одно поле для изменения"))
                    return@patch
                }
                val newName = body.name?.trim()
                if (newName != null && newName.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Название не может быть пустым"))
                    return@patch
                }
                if (newName != null) {
                    val existing = TariffRepository.findByName(newName)
                    if (existing != null && existing.tariffId != id) {
                        call.respond(HttpStatusCode.Conflict, mapOf("error" to "Тариф с таким названием уже существует"))
                        return@patch
                    }
                }
                val activeCount = TariffRepository.countActiveSubscriptions(id)
                if (activeCount > 0 && (body.durationDays != null || body.includedHours != null || body.price != null)) {
                    call.respond(
                        HttpStatusCode.Conflict,
                        mapOf("error" to "Нельзя менять длительность, включённые часы или цену при наличии активных подписок по этому тарифу")
                    )
                    return@patch
                }
                val price = body.price?.trim()?.toBigDecimalOrNull()
                if (body.price != null && price == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Некорректная цена"))
                    return@patch
                }
                if (price != null) {
                    if (price < BigDecimal.ZERO) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Цена не может быть отрицательной"))
                        return@patch
                    }
                    if (price.stripTrailingZeros().scale() > 2) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Цена: не более двух знаков после запятой"))
                        return@patch
                    }
                }
                val effectiveDurationDays = if (current.type == TariffType.hourly) null else body.durationDays
                val effectiveIncludedHours = when (current.type) {
                    TariffType.hourly -> null
                    TariffType.fixed -> null
                    TariffType.`package` -> body.includedHours
                }
                val updated = TariffRepository.update(
                    tariffId = id,
                    name = newName,
                    durationDays = effectiveDurationDays,
                    includedHours = effectiveIncludedHours,
                    price = price,
                    isActive = body.isActive
                )
                call.respond(updated!!.toTariffResponse())
            }
            delete("/api/staff/tariffs/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@delete
                }
                val current = TariffRepository.findById(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тариф не найден"))
                        return@delete
                    }
                val count = TariffRepository.countSubscriptions(id)
                if (count > 0) {
                    call.respond(
                        HttpStatusCode.Conflict,
                        DeleteTariffConflictResponse(error = "Невозможно удалить: по тарифу есть подписки", subscriptionCount = count)
                    )
                    return@delete
                }
                TariffRepository.delete(id)
                call.respond(HttpStatusCode.NoContent)
            }

            // ----- Tariff-Space assignments -----
            get("/api/staff/tariff-spaces") {
                val pairs = TariffRepository.getAllAssignments()
                call.respond(pairs.map { TariffSpaceAssignment(tariffId = it.first, spaceId = it.second) })
            }
            put("/api/staff/tariff-spaces") {
                val body = call.receive<PutTariffSpacesRequest>()
                val pairs = body.assignments.map { it.tariffId to it.spaceId }
                TariffRepository.setAssignments(pairs)
                call.respond(HttpStatusCode.NoContent)
            }

            // ----- Bookings -----
            get("/api/staff/bookings") {
                val dateStr = call.request.queryParameters["date"] ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Параметр date (YYYY-MM-DD) обязателен"))
                    return@get
                }
                val date = try {
                    LocalDate.parse(dateStr)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Некорректная дата (ожидается YYYY-MM-DD)"))
                    return@get
                }
                val zone = ZoneId.of("Europe/Moscow")
                val from = date.atStartOfDay()
                val to = date.plusDays(1).atStartOfDay()
                val rows = BookingRepository.listForDateRangeStaff(from, to)
                val list = rows.map { it.toStaffBookingTimelineResponse(zone) }
                call.respond(list)
            }
            get("/api/staff/bookings/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@get
                }
                val zone = ZoneId.of("Europe/Moscow")
                val info = BookingRepository.findByIdForStaff(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Бронирование не найдено"))
                        return@get
                    }
                call.respond(info.toStaffBookingDetailResponse(zone))
            }
            patch("/api/staff/bookings/{id}") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@patch
                }
                val failureReason = BookingRepository.updateParticipantsForStaffFailureReason(id)
                if (failureReason != null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to failureReason))
                    return@patch
                }
                val body = call.receive<UpdateBookingParticipantsRequest>()
                BookingRepository.updateParticipantsForStaff(id, body.participantMemberIds)
                call.respond(HttpStatusCode.NoContent)
            }
            post("/api/staff/bookings/{id}/cancel") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@post
                }
                val info = BookingRepository.findByIdForStaff(id)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Бронирование не найдено"))
                        return@post
                    }
                if (info.tariffType == "fixed" && info.subscriptionId != null) {
                    val body = call.receiveOrNull<StaffBookingCancelRequest>() ?: StaffBookingCancelRequest()
                    val refundAmount = body.refundAmount?.let { BigDecimal.valueOf(it) }
                    val errorMessage = SubscriptionRepository.cancelSubscription(info.subscriptionId!!, refundAmount)
                    when {
                        errorMessage == null -> { /* подписка отменена */ }
                        errorMessage == "Подписка уже отменена" -> { /* только снимаем бронирование */ }
                        else -> {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to errorMessage))
                            return@post
                        }
                    }
                    BookingRepository.cancelBookingOnly(id)
                    call.respond(HttpStatusCode.NoContent)
                    return@post
                }
                if (info.row.status != BookingStatus.confirmed) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Бронирование уже отменено или завершено"))
                    return@post
                }
                val body = call.receiveOrNull<StaffBookingCancelRequest>() ?: StaffBookingCancelRequest()
                val returnMinutes = body.returnMinutes ?: true
                val returnMoney = body.returnMoney ?: true
                BookingRepository.cancelWithSideEffectsStaff(id, returnMinutes, returnMoney)
                call.respond(HttpStatusCode.NoContent)
            }

            get("/api/staff/members/search") {
                val q = call.parameters["q"]?.trim() ?: ""
                val list = MemberRepository.searchByEmailOrPhone(q).map { it.toMemberSearchResponse() }
                call.respond(list)
            }

            // ----- Subscriptions -----
            get("/api/staff/subscriptions") {
                val list = SubscriptionRepository.findAllForStaff().map { it.toStaffSubscriptionResponse() }
                call.respond(list)
            }
            post("/api/staff/subscriptions/{id}/cancel") {
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@post
                }
                val body = call.receive<CancelSubscriptionRequest>()
                val refundAmount = body.refundAmount?.let { BigDecimal.valueOf(it) }
                val errorMessage = SubscriptionRepository.cancelSubscription(id, refundAmount)
                if (errorMessage != null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to errorMessage))
                    return@post
                }
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

private fun AmenityRow.toAmenityResponse() = AmenityResponse(
    id = amenityId,
    name = name,
    description = description
)

private fun TariffRow.toTariffResponse() = TariffResponse(
    id = tariffId,
    name = name,
    type = type.name,
    durationDays = durationDays,
    includedHours = includedHours,
    price = price.toPlainString(),
    isActive = isActive,
    activeSubscriptionCount = TariffRepository.countActiveSubscriptions(tariffId),
    subscriptionCount = TariffRepository.countSubscriptions(tariffId)
)

private val staffDateFormatter = DateTimeFormatter.ISO_LOCAL_DATE

private fun StaffSubscriptionRow.toStaffSubscriptionResponse() = StaffSubscriptionResponse(
    id = subscriptionId,
    tariffName = tariffName,
    memberEmail = memberEmail,
    type = tariffType.name,
    startDate = startDate.format(staffDateFormatter),
    endDate = endDate.format(staffDateFormatter),
    remainingMinutes = remainingMinutes,
    status = status.name,
    paymentAmount = paymentAmount?.toDouble()
)

private val staffZone = ZoneId.of("Europe/Moscow")
private val staffDateTimeFormatter = DateTimeFormatter.ISO_OFFSET_DATE_TIME

private fun BookingTimelineRow.toStaffBookingTimelineResponse(zone: ZoneId) = BookingTimelineResponse(
    id = bookingId,
    spaceId = spaceId,
    spaceName = spaceName,
    startTime = startTime.atZone(zone).format(staffDateTimeFormatter),
    endTime = endTime.atZone(zone).format(staffDateTimeFormatter),
    createdBy = createdBy,
    creatorEmail = creatorEmail,
    participantMemberIds = participantMemberIds,
    participantEmails = participantEmails,
    type = bookingType.name,
    status = status.name,
    isCreator = isCreator,
    isParticipant = isParticipant
)

private fun BookingWithSubscriptionInfo.toStaffBookingDetailResponse(zone: ZoneId) = StaffBookingDetailResponse(
    id = row.bookingId,
    spaceId = row.spaceId,
    spaceName = row.spaceName,
    startTime = row.startTime.atZone(zone).format(staffDateTimeFormatter),
    endTime = row.endTime.atZone(zone).format(staffDateTimeFormatter),
    createdBy = row.createdBy,
    creatorEmail = row.creatorEmail,
    participantMemberIds = row.participantMemberIds,
    participantEmails = row.participantEmails,
    type = row.bookingType.name,
    status = row.status.name,
    isCreator = row.isCreator,
    isParticipant = row.isParticipant,
    subscriptionId = subscriptionId,
    tariffType = tariffType
)

private fun MemberRow.toMemberSearchResponse() = MemberSearchResponse(
    id = memberId,
    name = name,
    email = email
)
