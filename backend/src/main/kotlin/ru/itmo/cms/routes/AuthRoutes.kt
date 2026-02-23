package ru.itmo.cms.routes

import at.favre.lib.crypto.bcrypt.BCrypt
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import ru.itmo.cms.models.AuthResponse
import ru.itmo.cms.models.LoginRequest
import ru.itmo.cms.models.MemberResponse
import ru.itmo.cms.models.RegisterRequest
import ru.itmo.cms.repository.MemberRepository
import ru.itmo.cms.repository.MemberRow
import java.util.*

fun Application.configureAuthRoutes() {
    val jwtConfig = environment.config.config("jwt")
    val secret = jwtConfig.property("secret").getString()
    val issuer = jwtConfig.property("issuer").getString()
    val audience = jwtConfig.property("audience").getString()
    val expiresInSeconds = jwtConfig.property("expiresInSeconds").getString().toLong()

    routing {
        post("/api/auth/register") {
            try {
                val body = call.receive<RegisterRequest>()
                val trimmedEmail = body.email.trim().lowercase()
                if (MemberRepository.findByEmail(trimmedEmail) != null) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Email already registered"))
                    return@post
                }
                val passwordHash = BCrypt.withDefaults().hashToString(12, body.password.toCharArray())
                val member = MemberRepository.create(
                    name = body.name.trim(),
                    email = trimmedEmail,
                    phone = body.phone.trim(),
                    passwordHash = passwordHash
                )
                val token = createToken(member.memberId, member.email, secret, issuer, audience, expiresInSeconds)
                call.respond(AuthResponse(token = token, member = member.toMemberResponse()))
            } catch (e: Exception) {
                call.application.log.error("Register failed", e)
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Bad request")))
            }
        }

        post("/api/auth/login") {
            try {
                val body = call.receive<LoginRequest>()
                val trimmedEmail = body.email.trim().lowercase()
                val member = MemberRepository.findByEmail(trimmedEmail)
                    ?: run {
                        call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid email or password"))
                        return@post
                    }
                if (!BCrypt.verifyer().verify(body.password.toCharArray(), member.passwordHash).verified) {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid email or password"))
                    return@post
                }
                val token = createToken(member.memberId, member.email, secret, issuer, audience, expiresInSeconds)
                call.respond(AuthResponse(token = token, member = member.toMemberResponse()))
            } catch (e: Exception) {
                call.application.log.error("Login failed", e)
                call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Bad request")))
            }
        }
    }
}

private fun createToken(
    memberId: Int,
    email: String,
    secret: String,
    issuer: String,
    audience: String,
    expiresInSeconds: Long
): String {
    return JWT.create()
        .withSubject(memberId.toString())
        .withIssuer(issuer)
        .withAudience(audience)
        .withClaim("email", email)
        .withExpiresAt(Date(System.currentTimeMillis() + expiresInSeconds * 1000))
        .sign(Algorithm.HMAC256(secret))
}

private fun MemberRow.toMemberResponse() = MemberResponse(
    id = memberId,
    name = name,
    email = email,
    phone = phone,
    balance = balance.toDouble(),
    registeredAt = this.registeredAt.toString()
)
