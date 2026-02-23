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
import ru.itmo.cms.models.LoginRequest
import ru.itmo.cms.models.StaffAuthResponse
import ru.itmo.cms.models.StaffResponse
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
