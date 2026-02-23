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
import ru.itmo.cms.models.AuthResponse
import ru.itmo.cms.models.LoginRequest
import ru.itmo.cms.models.MemberResponse
import ru.itmo.cms.models.DepositRequest
import ru.itmo.cms.models.PatchMeRequest
import ru.itmo.cms.models.TransactionResponse
import ru.itmo.cms.models.PutPasswordRequest
import ru.itmo.cms.models.RegisterRequest
import ru.itmo.cms.repository.MemberRepository
import ru.itmo.cms.repository.MemberRow
import ru.itmo.cms.repository.ProfileUpdateException
import ru.itmo.cms.repository.TransactionRow
import ru.itmo.cms.repository.TransactionType
import ru.itmo.cms.util.normalizeEmail
import ru.itmo.cms.util.normalizePhone
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
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
                val email = normalizeEmail(body.email).takeIf { it.isNotBlank() }
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Укажите email"))
                        return@post
                    }
                if (MemberRepository.findByEmail(email) != null) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Этот email уже зарегистрирован"))
                    return@post
                }
                val phone = normalizePhone(body.phone)
                    ?: run {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Номер должен быть в международном формате (E.164), например +79001234567"))
                        return@post
                    }
                if (MemberRepository.findByPhone(phone) != null) {
                    call.respond(HttpStatusCode.Conflict, mapOf("error" to "Этот номер телефона уже зарегистрирован"))
                    return@post
                }
                val passwordHash = BCrypt.withDefaults().hashToString(12, body.password.toCharArray())
                val member = MemberRepository.create(
                    name = body.name.trim(),
                    email = email,
                    phone = phone,
                    passwordHash = passwordHash
                )
                val token = createToken(member.memberId, member.email, secret, issuer, audience, expiresInSeconds)
                call.respond(AuthResponse(token = token, member = member.toMemberResponse()))
            } catch (e: Exception) {
                call.application.log.error("Register failed", e)
                val (status, message) = when {
                    e.message?.contains("members_email_key") == true ->
                        HttpStatusCode.Conflict to "Этот email уже зарегистрирован"
                    e.message?.contains("members_phone_key") == true ->
                        HttpStatusCode.Conflict to "Этот номер телефона уже зарегистрирован"
                    else ->
                        HttpStatusCode.BadRequest to (e.message ?: "Не удалось зарегистрироваться")
                }
                call.respond(status, mapOf("error" to message))
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

        authenticate("jwt") {
            get("/api/me") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@get
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@get
                }
                val member = MemberRepository.findById(memberId)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "User not found"))
                        return@get
                    }
                call.respond(member.toMemberResponse())
            }

            get("/api/me/transactions") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@get
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@get
                }
                val rows = MemberRepository.findTransactionsByMemberId(memberId)
                val list = rows.map { it.toTransactionResponse() }
                call.respond(list)
            }

            patch("/api/me") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@patch
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@patch
                }
                try {
                    val body = call.receive<PatchMeRequest>()
                    if (body.name == null && body.email == null && body.phone == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Provide at least one of name, email, phone"))
                        return@patch
                    }
                    val member = MemberRepository.updateProfileWithAudit(
                        memberId = memberId,
                        currentPassword = body.currentPassword,
                        name = body.name,
                        email = body.email,
                        phone = body.phone
                    )
                    call.respond(member.toMemberResponse())
                } catch (e: ProfileUpdateException) {
                    when (e) {
                        is ProfileUpdateException.InvalidPassword ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to e.message))
                        is ProfileUpdateException.EmailAlreadyUsed ->
                            call.respond(HttpStatusCode.Conflict, mapOf("error" to e.message))
                        is ProfileUpdateException.PhoneAlreadyUsed ->
                            call.respond(HttpStatusCode.Conflict, mapOf("error" to e.message))
                        is ProfileUpdateException.PhoneNotE164 ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to e.message))
                        is ProfileUpdateException.NothingChanged ->
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to e.message))
                    }
                } catch (e: Exception) {
                    call.application.log.error("PATCH /api/me failed", e)
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Bad request")))
                }
            }

            put("/api/me/password") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@put
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@put
                }
                try {
                    val body = call.receive<PutPasswordRequest>()
                    val newPasswordHash = BCrypt.withDefaults().hashToString(12, body.newPassword.toCharArray())
                    MemberRepository.changePasswordWithAudit(
                        memberId = memberId,
                        currentPassword = body.currentPassword,
                        newPasswordHash = newPasswordHash
                    )
                    call.respond(HttpStatusCode.OK, mapOf("ok" to true))
                } catch (e: ProfileUpdateException.InvalidPassword) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Invalid password")))
                } catch (e: Exception) {
                    call.application.log.error("PUT /api/me/password failed", e)
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Bad request")))
                }
            }

            post("/api/me/balance/deposit") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@post
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@post
                }
                try {
                    val body = call.receive<DepositRequest>()
                    val trimmed = body.amount.trim()
                    if (trimmed.isEmpty()) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Укажите сумму"))
                        return@post
                    }
                    if (!Regex("^[0-9]+(\\.[0-9]{1,2})?$").matches(trimmed)) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Сумма должна быть положительным числом: только цифры 0–9 и точка, не более двух знаков после запятой"))
                        return@post
                    }
                    val amount = trimmed.toBigDecimal()
                    val minAmount = java.math.BigDecimal("0.01")
                    if (amount < minAmount) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Минимальная сумма пополнения — 0.01"))
                        return@post
                    }
                    val member = MemberRepository.deposit(memberId, amount)
                        ?: run {
                            call.respond(HttpStatusCode.NotFound, mapOf("error" to "Участник не найден"))
                            return@post
                        }
                    call.respond(member.toMemberResponse())
                } catch (e: Exception) {
                    call.application.log.error("POST /api/me/balance/deposit failed", e)
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to (e.message ?: "Не удалось пополнить баланс")))
                }
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
    registeredAt = this.registeredAt.atZone(ZoneId.systemDefault()).format(
        DateTimeFormatter.ofPattern("d MMMM yyyy, HH:mm z", Locale.of("ru"))
    )
)

private fun TransactionRow.toTransactionResponse(): TransactionResponse {
    val signed = when (transactionType) {
        TransactionType.deposit, TransactionType.refund, TransactionType.bonus -> amount.toDouble()
        TransactionType.payment, TransactionType.withdrawal -> -amount.toDouble()
    }
    val formattedDate = transactionDate.atZone(ZoneId.systemDefault()).format(
        DateTimeFormatter.ofPattern("d MMMM yyyy, HH:mm z", Locale.of("ru"))
    )
    return TransactionResponse(
        transactionDate = formattedDate,
        amountChange = signed,
        description = description.ifBlank { "—" }
    )
}
