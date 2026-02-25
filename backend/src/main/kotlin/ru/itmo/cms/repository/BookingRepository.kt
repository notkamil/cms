package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greater
import org.jetbrains.exposed.v1.core.less
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/** Бронирование для таймлайна: с флагами isCreator/isParticipant для текущего пользователя. */
data class BookingTimelineRow(
    val bookingId: Int,
    val spaceId: Int,
    val spaceName: String,
    val startTime: LocalDateTime,
    val endTime: LocalDateTime,
    val createdBy: Int,
    val creatorEmail: String?,
    val participantMemberIds: List<Int>,
    val participantEmails: List<String>,
    val bookingType: BookingType,
    val status: BookingStatus,
    val isCreator: Boolean,
    val isParticipant: Boolean
)

object BookingRepository {

    /** Бронирования в диапазоне [from, to) для таймлайна. creatorEmail/participantEmails заполнены только для своих/участниковых. */
    fun listForDateRange(from: LocalDateTime, to: LocalDateTime, memberId: Int): List<BookingTimelineRow> = transaction {
        val spacesById = SpaceRepository.findAll().associateBy { it.spaceId }
        val allMemberIds = mutableSetOf<Int>()
        val bookingRows = BookingsTable.selectAll()
            .where {
                (BookingsTable.startTime less to) and (BookingsTable.endTime greater from)
            }
            .toList()
        bookingRows.forEach { row ->
            allMemberIds.add(row[BookingsTable.createdBy])
            BookingParticipantsTable.selectAll().where { BookingParticipantsTable.bookingId eq row[BookingsTable.bookingId] }
                .forEach { pr -> allMemberIds.add(pr[BookingParticipantsTable.memberId]) }
        }
        val memberEmails = if (allMemberIds.isEmpty()) emptyMap<Int, String>() else {
            MembersTable.selectAll().filter { it[MembersTable.memberId] in allMemberIds }
                .associate { it[MembersTable.memberId] to it[MembersTable.email] }
        }
        bookingRows.map { row ->
            val bid = row[BookingsTable.bookingId]
            val creatorId = row[BookingsTable.createdBy]
            val participantIds = BookingParticipantsTable.selectAll().where { BookingParticipantsTable.bookingId eq bid }
                .map { it[BookingParticipantsTable.memberId] }
            val isCreator = creatorId == memberId
            val isParticipant = memberId in participantIds
            val showDetails = isCreator || isParticipant
            BookingTimelineRow(
                bookingId = bid,
                spaceId = row[BookingsTable.spaceId],
                spaceName = spacesById[row[BookingsTable.spaceId]]?.name ?: "",
                startTime = row[BookingsTable.startTime],
                endTime = row[BookingsTable.endTime],
                createdBy = creatorId,
                creatorEmail = if (showDetails) memberEmails[creatorId] else null,
                participantMemberIds = participantIds,
                participantEmails = if (showDetails) participantIds.map { memberEmails[it] ?: "" } else emptyList(),
                bookingType = row[BookingsTable.bookingType],
                status = row[BookingsTable.status],
                isCreator = isCreator,
                isParticipant = isParticipant
            )
        }
    }

    /** Бронирования в диапазоне [from, to) для админки: все бронирования, всегда с email создателя и участников. */
    fun listForDateRangeStaff(from: LocalDateTime, to: LocalDateTime): List<BookingTimelineRow> = transaction {
        val spacesById = SpaceRepository.findAll().associateBy { it.spaceId }
        val allMemberIds = mutableSetOf<Int>()
        val bookingRows = BookingsTable.selectAll()
            .where {
                (BookingsTable.startTime less to) and (BookingsTable.endTime greater from)
            }
            .toList()
        bookingRows.forEach { row ->
            allMemberIds.add(row[BookingsTable.createdBy])
            BookingParticipantsTable.selectAll().where { BookingParticipantsTable.bookingId eq row[BookingsTable.bookingId] }
                .forEach { pr -> allMemberIds.add(pr[BookingParticipantsTable.memberId]) }
        }
        val memberEmails = if (allMemberIds.isEmpty()) emptyMap<Int, String>() else {
            MembersTable.selectAll().filter { it[MembersTable.memberId] in allMemberIds }
                .associate { it[MembersTable.memberId] to it[MembersTable.email] }
        }
        bookingRows.map { row ->
            val bid = row[BookingsTable.bookingId]
            val creatorId = row[BookingsTable.createdBy]
            val participantIds = BookingParticipantsTable.selectAll().where { BookingParticipantsTable.bookingId eq bid }
                .map { it[BookingParticipantsTable.memberId] }
            BookingTimelineRow(
                bookingId = bid,
                spaceId = row[BookingsTable.spaceId],
                spaceName = spacesById[row[BookingsTable.spaceId]]?.name ?: "",
                startTime = row[BookingsTable.startTime],
                endTime = row[BookingsTable.endTime],
                createdBy = creatorId,
                creatorEmail = memberEmails[creatorId],
                participantMemberIds = participantIds,
                participantEmails = participantIds.map { memberEmails[it] ?: "" },
                bookingType = row[BookingsTable.bookingType],
                status = row[BookingsTable.status],
                isCreator = false,
                isParticipant = false
            )
        }
    }

    /** Бронирование по id с информацией о подписке (subscriptionId, tariffType) для админки. */
    data class BookingWithSubscriptionInfo(
        val row: BookingTimelineRow,
        val subscriptionId: Int?,
        val tariffType: String?
    )

    fun findByIdForStaff(bookingId: Int): BookingWithSubscriptionInfo? = transaction {
        val row = findById(bookingId) ?: return@transaction null
        val bsRow = BookingSubscriptionsTable.selectAll().where { BookingSubscriptionsTable.bookingId eq bookingId }.singleOrNull()
        val (subId, tariffType) = if (bsRow != null) {
            val subRow = SubscriptionsTable.selectAll().where { SubscriptionsTable.subscriptionId eq bsRow[BookingSubscriptionsTable.subscriptionId] }.singleOrNull()
            val tt = subRow?.let { TariffRepository.findById(it[SubscriptionsTable.tariffId])?.type?.name }
            Pair(bsRow[BookingSubscriptionsTable.subscriptionId], tt)
        } else Pair(null, null)
        BookingWithSubscriptionInfo(row, subId, tariffType)
    }

    /**
     * Создать бронирование по фикс-подписке: одно пространство на весь период [startDate, endDate].
     * Вызывать только изнутри существующей транзакции (например, из createWithPayment).
     * Не списывает remainingMinutes. Не проверяет 15-мин гранулярность.
     */
    fun createFixBooking(
        memberId: Int,
        spaceId: Int,
        subscriptionId: Int,
        startDate: LocalDate,
        endDate: LocalDate
    ): Int {
        val startTime = startDate.atStartOfDay()
        val endTime = endDate.plusDays(1).atStartOfDay()
        val bookingId = BookingsTable.insert {
            it[BookingsTable.spaceId] = spaceId
            it[BookingsTable.createdBy] = memberId
            it[BookingsTable.bookingType] = BookingType.subscription
            it[BookingsTable.startTime] = startTime
            it[BookingsTable.endTime] = endTime
            it[BookingsTable.status] = BookingStatus.confirmed
        } get BookingsTable.bookingId
        BookingSubscriptionsTable.insert {
            it[BookingSubscriptionsTable.bookingId] = bookingId
            it[BookingSubscriptionsTable.subscriptionId] = subscriptionId
        }
        return bookingId
    }

    /**
     * Перевести в cancelled все подтверждённые бронирования, привязанные к подписке.
     * Вызывать при отмене подписки из админки (в т.ч. фикс: подписка и бронирование отменяются вместе).
     */
    fun cancelBookingsBySubscriptionId(subscriptionId: Int) = transaction {
        val bookingIds = BookingSubscriptionsTable.selectAll()
            .where { BookingSubscriptionsTable.subscriptionId eq subscriptionId }
            .map { it[BookingSubscriptionsTable.bookingId] }
        bookingIds.forEach { bookingId ->
            BookingsTable.update(where = {
                (BookingsTable.bookingId eq bookingId) and (BookingsTable.status eq BookingStatus.confirmed)
            }) {
                it[BookingsTable.status] = BookingStatus.cancelled
            }
        }
    }

    /** Есть ли у подписки хотя бы одно привязанное бронирование (таблица BookingSubscriptions). */
    fun hasBookingForSubscription(subscriptionId: Int): Boolean = transaction {
        BookingSubscriptionsTable.selectAll()
            .where { BookingSubscriptionsTable.subscriptionId eq subscriptionId }
            .limit(1)
            .toList()
            .isNotEmpty()
    }

    /** Есть ли пересечение по пространству и времени (стык конец=начало разрешён). */
    fun hasOverlap(spaceId: Int, startTime: LocalDateTime, endTime: LocalDateTime, excludeBookingId: Int?): Boolean = transaction {
        val overlapping = BookingsTable.selectAll().where {
            (BookingsTable.spaceId eq spaceId) and
                (BookingsTable.status eq BookingStatus.confirmed) and
                (BookingsTable.startTime less endTime) and
                (BookingsTable.endTime greater startTime)
        }.toList()
        val filtered = excludeBookingId?.let { id -> overlapping.filter { it[BookingsTable.bookingId] != id } } ?: overlapping
        filtered.isNotEmpty()
    }

    /** Создать бронирование. 15-мин гранулярность, без пересечений, подписка: списать минуты; one_off: создать OneOff+транзакция. */
    fun create(
        memberId: Int,
        spaceId: Int,
        startTime: LocalDateTime,
        endTime: LocalDateTime,
        bookingType: BookingType,
        subscriptionId: Int?,
        tariffId: Int?,
        participantMemberIds: List<Int>
    ): Int? = transaction {
        val durationMinutes = java.time.Duration.between(startTime, endTime).toMinutes().toInt()
        if (durationMinutes <= 0) return@transaction null
        if (durationMinutes % 15 != 0) return@transaction null
        if (startTime.minute % 15 != 0 || startTime.second != 0 || startTime.nano != 0) return@transaction null
        if (hasOverlap(spaceId, startTime, endTime, null)) return@transaction null

        when (bookingType) {
            BookingType.subscription -> {
                val subRow = SubscriptionsTable.selectAll().where {
                    (SubscriptionsTable.subscriptionId eq subscriptionId!!) and
                        (SubscriptionsTable.memberId eq memberId) and
                        (SubscriptionsTable.status eq SubscriptionStatus.active)
                }.singleOrNull() ?: return@transaction null
                val rem = subRow[SubscriptionsTable.remainingMinutes]
                if (rem != 0 && rem < durationMinutes) return@transaction null
                val bookingId = BookingsTable.insert {
                    it[BookingsTable.spaceId] = spaceId
                    it[BookingsTable.createdBy] = memberId
                    it[BookingsTable.bookingType] = BookingType.subscription
                    it[BookingsTable.startTime] = startTime
                    it[BookingsTable.endTime] = endTime
                    it[BookingsTable.status] = BookingStatus.confirmed
                } get BookingsTable.bookingId
                val subId = subscriptionId!!
                BookingSubscriptionsTable.insert {
                    it[BookingSubscriptionsTable.bookingId] = bookingId
                    it[BookingSubscriptionsTable.subscriptionId] = subId
                }
                if (rem != 0) {
                    SubscriptionsTable.update(where = { SubscriptionsTable.subscriptionId eq subId }) {
                        it[SubscriptionsTable.remainingMinutes] = rem - durationMinutes
                    }
                }
                participantMemberIds.distinct().filter { it != memberId }.forEach { pid ->
                    BookingParticipantsTable.insert {
                        it[BookingParticipantsTable.bookingId] = bookingId
                        it[BookingParticipantsTable.memberId] = pid
                    }
                }
                return@transaction bookingId
            }
            BookingType.one_time -> {
                val tariff = tariffId?.let { TariffRepository.findById(it) } ?: return@transaction null
                if (tariff.type != TariffType.hourly) return@transaction null
                val totalPrice = tariff.price
                    .multiply(BigDecimal(durationMinutes))
                    .divide(BigDecimal(60), 2, RoundingMode.HALF_UP)
                val memberRow = MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull() ?: return@transaction null
                if (memberRow[MembersTable.balance] < totalPrice) return@transaction null
                val bookingId = BookingsTable.insert {
                    it[BookingsTable.spaceId] = spaceId
                    it[BookingsTable.createdBy] = memberId
                    it[BookingsTable.bookingType] = BookingType.one_time
                    it[BookingsTable.startTime] = startTime
                    it[BookingsTable.endTime] = endTime
                    it[BookingsTable.status] = BookingStatus.confirmed
                } get BookingsTable.bookingId
                val oneOffId = OneOffsTable.insert {
                    it[OneOffsTable.bookingId] = bookingId
                    it[OneOffsTable.memberId] = memberId
                    it[OneOffsTable.tariffId] = tariffId
                    it[OneOffsTable.quantity] = durationMinutes
                } get OneOffsTable.oneOffId
                val space = SpaceRepository.findById(spaceId) ?: return@transaction null
                val dateTimeFmt = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
                val desc = "Бронирование «${space.name}» ${startTime.format(dateTimeFmt)} – ${endTime.format(dateTimeFmt)}"
                val transId = TransactionsTable.insert {
                    it[TransactionsTable.memberId] = memberId
                    it[TransactionsTable.amount] = totalPrice
                    it[TransactionsTable.transactionType] = TransactionType.payment
                    it[TransactionsTable.transactionDate] = LocalDateTime.now()
                    it[TransactionsTable.description] = desc
                } get TransactionsTable.transactionId
                TransactionOneOffsTable.insert {
                    it[TransactionOneOffsTable.transactionId] = transId
                    it[TransactionOneOffsTable.oneOffId] = oneOffId
                }
                MembersTable.update(where = { MembersTable.memberId eq memberId }) {
                    it[MembersTable.balance] = memberRow[MembersTable.balance] - totalPrice
                }
                participantMemberIds.distinct().filter { it != memberId }.forEach { pid ->
                    BookingParticipantsTable.insert {
                        it[BookingParticipantsTable.bookingId] = bookingId
                        it[BookingParticipantsTable.memberId] = pid
                    }
                }
                return@transaction bookingId
            }
        }
    }

    /** Причина, по которой отмену нельзя выполнить; null — отмена возможна. */
    fun cancelFailureReason(bookingId: Int, memberId: Int): String? = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull()
            ?: return@transaction "Бронирование не найдено"
        if (row[BookingsTable.status] != BookingStatus.confirmed) return@transaction "Бронирование уже отменено или завершено"
        val creatorId = row[BookingsTable.createdBy]
        val participantIds = BookingParticipantsTable.selectAll().where { BookingParticipantsTable.bookingId eq bookingId }
            .map { it[BookingParticipantsTable.memberId] }
        if (memberId != creatorId && memberId !in participantIds) return@transaction "Нет прав на отмену этого бронирования"
        // Бронирование по фикс-подписке отменяется только через админку
        if (row[BookingsTable.bookingType] == BookingType.subscription) {
            val bsRow = BookingSubscriptionsTable.selectAll().where { BookingSubscriptionsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction null
            val subRow = SubscriptionsTable.selectAll().where { SubscriptionsTable.subscriptionId eq bsRow[BookingSubscriptionsTable.subscriptionId] }.singleOrNull() ?: return@transaction null
            val tariff = TariffRepository.findById(subRow[SubscriptionsTable.tariffId])
            if (tariff?.type == TariffType.fixed) return@transaction "Отмена возможна только через администратора"
        }
        val startTime = row[BookingsTable.startTime]
        val now = LocalDateTime.now()
        if (startTime <= now) return@transaction "Бронирование уже началось или прошло"
        if (java.time.Duration.between(now, startTime).toMinutes() < 120) return@transaction "Отменить можно не позднее чем за 2 часа до начала"
        null
    }

    /** Выполнить отмену бронирования с возвратом (one_time) или возвратом минут (подписка-пакет). Вызывать после проверки через cancelFailureReason. */
    fun cancelWithSideEffects(bookingId: Int, memberId: Int) = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction
        val startTime = row[BookingsTable.startTime]
        val endTime = row[BookingsTable.endTime]
        val durationMinutes = java.time.Duration.between(startTime, endTime).toMinutes().toInt()
        when (row[BookingsTable.bookingType]) {
            BookingType.one_time -> {
                val oneOffRow = OneOffsTable.selectAll().where { OneOffsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction
                val oneOffId = oneOffRow[OneOffsTable.oneOffId]
                val payMemberId = oneOffRow[OneOffsTable.memberId]
                val toRefundRow = TransactionOneOffsTable.selectAll().where { TransactionOneOffsTable.oneOffId eq oneOffId }.singleOrNull() ?: return@transaction
                val payTransId = toRefundRow[TransactionOneOffsTable.transactionId]
                val payTrans = TransactionsTable.selectAll()
                    .where { (TransactionsTable.transactionId eq payTransId) and (TransactionsTable.transactionType eq TransactionType.payment) }
                    .singleOrNull() ?: return@transaction
                val amount = payTrans[TransactionsTable.amount]
                val memberRow = MembersTable.selectAll().where { MembersTable.memberId eq payMemberId }.singleOrNull() ?: return@transaction
                val newBalance = memberRow[MembersTable.balance] + amount
                MembersTable.update(where = { MembersTable.memberId eq payMemberId }) {
                    it[MembersTable.balance] = newBalance
                }
                val space = SpaceRepository.findById(row[BookingsTable.spaceId]) ?: return@transaction
                val dateTimeFmt = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
                val desc = "Возврат по бронированию «${space.name}», ${startTime.format(dateTimeFmt)} – ${endTime.format(dateTimeFmt)}"
                TransactionsTable.insert {
                    it[TransactionsTable.memberId] = payMemberId
                    it[TransactionsTable.amount] = amount
                    it[TransactionsTable.transactionType] = TransactionType.refund
                    it[TransactionsTable.transactionDate] = LocalDateTime.now()
                    it[TransactionsTable.description] = desc
                }
            }
            BookingType.subscription -> {
                val bsRow = BookingSubscriptionsTable.selectAll().where { BookingSubscriptionsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction
                val subscriptionId = bsRow[BookingSubscriptionsTable.subscriptionId]
                val subRow = SubscriptionsTable.selectAll().where { SubscriptionsTable.subscriptionId eq subscriptionId }.singleOrNull() ?: return@transaction
                val tariff = TariffRepository.findById(subRow[SubscriptionsTable.tariffId]) ?: return@transaction
                if (tariff.type == TariffType.`package`) {
                    val rem = subRow[SubscriptionsTable.remainingMinutes]
                    SubscriptionsTable.update(where = { SubscriptionsTable.subscriptionId eq subscriptionId }) {
                        it[SubscriptionsTable.remainingMinutes] = rem + durationMinutes
                    }
                }
            }
        }
        BookingsTable.update(where = { BookingsTable.bookingId eq bookingId }) {
            it[BookingsTable.status] = BookingStatus.cancelled
        }
    }

    /** Отмена бронирования сотрудником. Для фикс-подписки не вызывать (маршрут возвращает 400 с subscriptionId). returnMinutes — вернуть минуты в пакетную подписку. */
    fun cancelWithSideEffectsStaff(bookingId: Int, returnMinutes: Boolean) = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction
        val startTime = row[BookingsTable.startTime]
        val endTime = row[BookingsTable.endTime]
        val durationMinutes = java.time.Duration.between(startTime, endTime).toMinutes().toInt()
        when (row[BookingsTable.bookingType]) {
            BookingType.one_time -> {
                val oneOffRow = OneOffsTable.selectAll().where { OneOffsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction
                val oneOffId = oneOffRow[OneOffsTable.oneOffId]
                val payMemberId = oneOffRow[OneOffsTable.memberId]
                val toRefundRow = TransactionOneOffsTable.selectAll().where { TransactionOneOffsTable.oneOffId eq oneOffId }.singleOrNull() ?: return@transaction
                val payTransId = toRefundRow[TransactionOneOffsTable.transactionId]
                val payTrans = TransactionsTable.selectAll()
                    .where { (TransactionsTable.transactionId eq payTransId) and (TransactionsTable.transactionType eq TransactionType.payment) }
                    .singleOrNull() ?: return@transaction
                val amount = payTrans[TransactionsTable.amount]
                val memberRow = MembersTable.selectAll().where { MembersTable.memberId eq payMemberId }.singleOrNull() ?: return@transaction
                val newBalance = memberRow[MembersTable.balance] + amount
                MembersTable.update(where = { MembersTable.memberId eq payMemberId }) {
                    it[MembersTable.balance] = newBalance
                }
                val space = SpaceRepository.findById(row[BookingsTable.spaceId]) ?: return@transaction
                val dateTimeFmt = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
                val desc = "Возврат по бронированию «${space.name}», ${startTime.format(dateTimeFmt)} – ${endTime.format(dateTimeFmt)}"
                TransactionsTable.insert {
                    it[TransactionsTable.memberId] = payMemberId
                    it[TransactionsTable.amount] = amount
                    it[TransactionsTable.transactionType] = TransactionType.refund
                    it[TransactionsTable.transactionDate] = LocalDateTime.now()
                    it[TransactionsTable.description] = desc
                }
            }
            BookingType.subscription -> {
                val bsRow = BookingSubscriptionsTable.selectAll().where { BookingSubscriptionsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction
                val subscriptionId = bsRow[BookingSubscriptionsTable.subscriptionId]
                val subRow = SubscriptionsTable.selectAll().where { SubscriptionsTable.subscriptionId eq subscriptionId }.singleOrNull() ?: return@transaction
                val tariff = TariffRepository.findById(subRow[SubscriptionsTable.tariffId]) ?: return@transaction
                if (tariff.type == TariffType.`package` && returnMinutes) {
                    val rem = subRow[SubscriptionsTable.remainingMinutes]
                    SubscriptionsTable.update(where = { SubscriptionsTable.subscriptionId eq subscriptionId }) {
                        it[SubscriptionsTable.remainingMinutes] = rem + durationMinutes
                    }
                }
            }
        }
        BookingsTable.update(where = { BookingsTable.bookingId eq bookingId }) {
            it[BookingsTable.status] = BookingStatus.cancelled
        }
    }

    /** Только перевести бронирование в cancelled (без возврата и без возврата минут). Для «сирот» — бронирований по уже закрытой подписке. */
    fun cancelBookingOnly(bookingId: Int) = transaction {
        BookingsTable.update(where = { BookingsTable.bookingId eq bookingId }) {
            it[BookingsTable.status] = BookingStatus.cancelled
        }
    }

    fun findById(bookingId: Int): BookingTimelineRow? = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction null
        val space = SpaceRepository.findById(row[BookingsTable.spaceId]) ?: return@transaction null
        val creatorId = row[BookingsTable.createdBy]
        val participantIds = BookingParticipantsTable.selectAll().where { BookingParticipantsTable.bookingId eq bookingId }
            .map { it[BookingParticipantsTable.memberId] }
        val memberEmails = (listOf(creatorId) + participantIds).toSet().let { ids ->
            if (ids.isEmpty()) emptyMap() else MembersTable.selectAll().filter { it[MembersTable.memberId] in ids }
                .associate { it[MembersTable.memberId] to it[MembersTable.email] }
        }
        BookingTimelineRow(
            bookingId = row[BookingsTable.bookingId],
            spaceId = row[BookingsTable.spaceId],
            spaceName = space.name,
            startTime = row[BookingsTable.startTime],
            endTime = row[BookingsTable.endTime],
            createdBy = creatorId,
            creatorEmail = memberEmails[creatorId],
            participantMemberIds = participantIds,
            participantEmails = participantIds.map { memberEmails[it] ?: "" },
            bookingType = row[BookingsTable.bookingType],
            status = row[BookingsTable.status],
            isCreator = false,
            isParticipant = false
        )
    }

    /** Все бронирования пользователя (создатель или участник): current = активные/ожидаемые, archive = прошедшие + отменённые. */
    fun listMyBookings(memberId: Int): Pair<List<BookingTimelineRow>, List<BookingTimelineRow>> = transaction {
        val now = LocalDateTime.now()
        val all = listForDateRange(LocalDateTime.of(2000, 1, 1, 0, 0), LocalDateTime.of(2100, 1, 1, 0, 0), memberId)
            .filter { it.isCreator || it.isParticipant }
        val current = all.filter { it.status == BookingStatus.confirmed && it.endTime > now }
        val archive = all.filter { it.status != BookingStatus.confirmed || it.endTime <= now }
        Pair(current.sortedBy { it.startTime }, archive.sortedByDescending { it.startTime })
    }

    /** Обновить участников бронирования (только создатель, только подтверждённое, ещё не началось). */
    fun updateParticipantsFailureReason(bookingId: Int, memberId: Int): String? = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull()
            ?: return@transaction "Бронирование не найдено"
        if (row[BookingsTable.status] != BookingStatus.confirmed) return@transaction "Бронирование отменено или завершено"
        if (row[BookingsTable.createdBy] != memberId) return@transaction "Только владелец может менять участников"
        val startTime = row[BookingsTable.startTime]
        if (startTime <= LocalDateTime.now()) return@transaction "Бронирование уже началось"
        null
    }

    fun updateParticipants(bookingId: Int, participantMemberIds: List<Int>, creatorId: Int) = transaction {
        BookingParticipantsTable.deleteWhere { BookingParticipantsTable.bookingId eq bookingId }
        participantMemberIds.distinct().filter { it != creatorId }.forEach { pid ->
            BookingParticipantsTable.insert {
                it[BookingParticipantsTable.bookingId] = bookingId
                it[BookingParticipantsTable.memberId] = pid
            }
        }
    }

    /** Проверка возможности редактирования участников сотрудником; null — можно. */
    fun updateParticipantsForStaffFailureReason(bookingId: Int): String? = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull()
            ?: return@transaction "Бронирование не найдено"
        if (row[BookingsTable.status] != BookingStatus.confirmed) return@transaction "Бронирование отменено или завершено"
        val startTime = row[BookingsTable.startTime]
        if (startTime <= LocalDateTime.now()) return@transaction "Бронирование уже началось"
        null
    }

    /** Обновить участников бронирования (сотрудник; без проверки создателя). */
    fun updateParticipantsForStaff(bookingId: Int, participantMemberIds: List<Int>) = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction
        val creatorId = row[BookingsTable.createdBy]
        updateParticipants(bookingId, participantMemberIds, creatorId)
    }
}
