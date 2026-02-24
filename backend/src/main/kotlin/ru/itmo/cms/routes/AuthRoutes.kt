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
import ru.itmo.cms.models.SubscriptionsListResponse
import ru.itmo.cms.models.SubscriptionResponse
import ru.itmo.cms.models.AvailableTariffResponse
import ru.itmo.cms.models.CreateSubscriptionRequest
import ru.itmo.cms.models.SpaceForBookingsResponse
import ru.itmo.cms.models.BookingTimelineResponse
import ru.itmo.cms.models.CreateBookingRequest
import ru.itmo.cms.models.MemberSearchResponse
import ru.itmo.cms.models.MyBookingsListResponse
import ru.itmo.cms.models.UpdateBookingParticipantsRequest
import ru.itmo.cms.repository.MemberRepository
import ru.itmo.cms.repository.MemberRow
import ru.itmo.cms.repository.ProfileUpdateException
import ru.itmo.cms.repository.SubscriptionRepository
import ru.itmo.cms.repository.SubscriptionRow
import ru.itmo.cms.repository.SubscriptionStatus
import ru.itmo.cms.repository.TariffRepository
import ru.itmo.cms.repository.TariffType
import ru.itmo.cms.repository.markExpiredSubscriptions
import ru.itmo.cms.repository.TransactionRow
import ru.itmo.cms.repository.TransactionType
import ru.itmo.cms.repository.BookingRepository
import ru.itmo.cms.repository.BookingTimelineRow
import ru.itmo.cms.repository.BookingType
import ru.itmo.cms.repository.BookingStatus
import ru.itmo.cms.repository.SpaceRepository
import ru.itmo.cms.util.normalizeEmail
import ru.itmo.cms.util.normalizePhone
import java.time.LocalDate
import java.time.LocalDateTime
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

            get("/api/me/subscriptions") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@get
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@get
                }
                val spaceIdParam = call.request.queryParameters["spaceId"]?.toIntOrNull()
                markExpiredSubscriptions()
                var all = SubscriptionRepository.findByMemberId(memberId)
                if (spaceIdParam != null) {
                    all = all.filter { TariffRepository.getSpaceIdsByTariffId(it.tariffId).contains(spaceIdParam) }
                }
                val current = all.filter { it.status == SubscriptionStatus.active }.map { it.toSubscriptionResponse() }
                val archived = all.filter { it.status != SubscriptionStatus.active }.map { it.toSubscriptionResponse() }
                call.respond(SubscriptionsListResponse(current = current, archived = archived))
            }

            get("/api/me/tariffs/available") {
                val list = TariffRepository.findAll()
                    .filter { it.isActive && (it.type == TariffType.fixed || it.type == TariffType.`package`) }
                    .map { it.toAvailableTariffResponse() }
                call.respond(list)
            }

            get("/api/me/tariffs/hourly") {
                val spaceIdParam = call.request.queryParameters["spaceId"]?.toIntOrNull()
                var list = TariffRepository.findAll()
                    .filter { it.isActive && it.type == TariffType.hourly }
                if (spaceIdParam != null) {
                    val allowedTariffIds = TariffRepository.getTariffIdsBySpaceId(spaceIdParam).toSet()
                    list = list.filter { it.tariffId in allowedTariffIds }
                }
                call.respond(list.map { it.toAvailableTariffResponse() })
            }

            post("/api/me/subscriptions") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@post
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@post
                }
                val body = call.receive<CreateSubscriptionRequest>()
                val tariff = TariffRepository.findById(body.tariffId)
                    ?: run {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Тариф не найден"))
                        return@post
                    }
                if (!tariff.isActive) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Тариф недоступен для оформления"))
                    return@post
                }
                if (tariff.type == TariffType.hourly) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Почасовой тариф оформляется только при бронировании"))
                    return@post
                }
                val startDate = body.startDate?.trim()?.let { raw ->
                    try {
                        LocalDate.parse(raw)
                    } catch (_: Exception) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Некорректная дата начала (ожидается YYYY-MM-DD)"))
                        return@post
                    }
                } ?: LocalDate.now()
                val endDate = startDate.plusDays(tariff.durationDays.toLong())
                val subscription = SubscriptionRepository.createWithPayment(
                    memberId = memberId,
                    tariffId = body.tariffId,
                    tariffName = tariff.name,
                    price = tariff.price,
                    startDate = startDate,
                    endDate = endDate,
                    remainingMinutes = if (tariff.includedHours == 0) 0 else tariff.includedHours * 60
                )
                if (subscription == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Недостаточно средств на балансе"))
                    return@post
                }
                call.respond(HttpStatusCode.Created, subscription.toSubscriptionResponse())
            }

            get("/api/me/spaces") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@get
                }
                val list = SpaceRepository.findAll().map { SpaceForBookingsResponse(id = it.spaceId, name = it.name, floor = it.floor) }
                call.respond(list)
            }

            get("/api/me/bookings") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@get
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@get
                }
                val dateStr = call.parameters["date"] ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Укажите date (YYYY-MM-DD)"))
                    return@get
                }
                val zone = ZoneId.of("Europe/Moscow")
                val date = try {
                    LocalDate.parse(dateStr)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Некорректная дата (ожидается YYYY-MM-DD)"))
                    return@get
                }
                val from = date.atStartOfDay(zone).toLocalDateTime()
                val to = date.plusDays(1).atStartOfDay(zone).toLocalDateTime()
                val rows = BookingRepository.listForDateRange(from, to, memberId)
                val list = rows.map { it.toBookingTimelineResponse(zone) }
                call.respond(list)
            }

            get("/api/me/bookings/list") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@get
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@get
                }
                val zone = ZoneId.of("Europe/Moscow")
                val (current, archive) = BookingRepository.listMyBookings(memberId)
                call.respond(MyBookingsListResponse(
                    current = current.map { it.toBookingTimelineResponse(zone) },
                    archive = archive.map { it.toBookingTimelineResponse(zone) }
                ))
            }

            post("/api/me/bookings") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@post
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@post
                }
                val zone = ZoneId.of("Europe/Moscow")
                val body = call.receive<CreateBookingRequest>()
                val bookingType = when (body.bookingType) {
                    "subscription" -> BookingType.subscription
                    "one_time" -> BookingType.one_time
                    else -> {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "bookingType: subscription или one_time"))
                        return@post
                    }
                }
                val startTime = try {
                    LocalDateTime.parse(body.startTime.take(19)).atZone(zone).toLocalDateTime()
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Некорректное время начала (ожидается YYYY-MM-DDTHH:mm:ss)"))
                    return@post
                }
                val endTime = try {
                    LocalDateTime.parse(body.endTime.take(19)).atZone(zone).toLocalDateTime()
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Некорректное время окончания"))
                    return@post
                }
                if (bookingType == BookingType.one_time && body.tariffId != null) {
                    val tariff = TariffRepository.findById(body.tariffId)
                        ?: run {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Тариф не найден"))
                            return@post
                        }
                    if (tariff.type != TariffType.hourly) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Указан не почасовой тариф"))
                        return@post
                    }
                    val durationMinutes = java.time.Duration.between(startTime, endTime).toMinutes().toInt()
                    val totalPrice = tariff.price
                        .multiply(java.math.BigDecimal(durationMinutes))
                        .divide(java.math.BigDecimal(60), 2, java.math.RoundingMode.HALF_UP)
                    val member = MemberRepository.findById(memberId)
                        ?: run {
                            call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Участник не найден"))
                            return@post
                        }
                    if (member.balance < totalPrice) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Недостаточно средств на счёте"))
                        return@post
                    }
                }
                val id = BookingRepository.create(
                    memberId = memberId,
                    spaceId = body.spaceId,
                    startTime = startTime,
                    endTime = endTime,
                    bookingType = bookingType,
                    subscriptionId = body.subscriptionId,
                    tariffId = body.tariffId,
                    participantMemberIds = body.participantMemberIds
                )
                if (id == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Не удалось создать бронирование (пересечение, нехватка часов/средств или неверные параметры)"))
                    return@post
                }
                call.respond(HttpStatusCode.Created, mapOf("id" to id))
            }

            post("/api/me/bookings/{id}/cancel") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@post
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@post
                }
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@post
                }
                val failureReason = BookingRepository.cancelFailureReason(id, memberId)
                if (failureReason != null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to failureReason))
                    return@post
                }
                BookingRepository.cancelWithSideEffects(id, memberId)
                call.respond(HttpStatusCode.NoContent)
            }

            patch("/api/me/bookings/{id}") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@patch
                }
                val memberId = principal.payload.subject?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Invalid token"))
                    return@patch
                }
                val id = call.parameters["id"]?.toIntOrNull() ?: run {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid id"))
                    return@patch
                }
                val failureReason = BookingRepository.updateParticipantsFailureReason(id, memberId)
                if (failureReason != null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("error" to failureReason))
                    return@patch
                }
                val body = call.receive<UpdateBookingParticipantsRequest>()
                BookingRepository.updateParticipants(id, body.participantMemberIds, memberId)
                call.respond(HttpStatusCode.NoContent)
            }

            get("/api/me/members/search") {
                val principal = call.principal<JWTPrincipal>() ?: run {
                    call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Unauthorized"))
                    return@get
                }
                val q = call.parameters["q"]?.trim() ?: ""
                val list = MemberRepository.searchByEmailOrPhone(q).map { MemberSearchResponse(id = it.memberId, name = it.name, email = it.email) }
                call.respond(list)
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

private val dateFormatter = DateTimeFormatter.ISO_LOCAL_DATE

private fun SubscriptionRow.toSubscriptionResponse() = SubscriptionResponse(
    id = subscriptionId,
    tariffName = tariffName,
    startDate = startDate.format(dateFormatter),
    endDate = endDate.format(dateFormatter),
    remainingMinutes = remainingMinutes,
    status = status.name
)

private fun ru.itmo.cms.repository.TariffRow.toAvailableTariffResponse() = AvailableTariffResponse(
    id = tariffId,
    name = name,
    type = type.name,
    durationDays = durationDays,
    includedHours = includedHours,
    price = price.toPlainString()
)

private fun BookingTimelineRow.toBookingTimelineResponse(zone: ZoneId): BookingTimelineResponse = BookingTimelineResponse(
    id = bookingId,
    spaceId = spaceId,
    spaceName = spaceName,
    startTime = startTime.atZone(zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
    endTime = endTime.atZone(zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
    createdBy = createdBy,
    creatorEmail = creatorEmail,
    participantMemberIds = participantMemberIds,
    participantEmails = participantEmails,
    type = bookingType.name,
    status = status.name,
    isCreator = isCreator,
    isParticipant = isParticipant
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
