package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greater
import org.jetbrains.exposed.v1.core.less
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDateTime

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
        val membersById = MemberRepository.findById(memberId)?.let { mapOf(memberId to it) } ?: emptyMap()
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
                val desc = "Бронирование: ${tariff.name}, ${durationMinutes} мин"
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

    /** Отменить бронирование: только создатель или участник, не началось, за 2 ч до начала (захардкожено). */
    fun cancel(bookingId: Int, memberId: Int): Boolean = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction false
        if (row[BookingsTable.status] != BookingStatus.confirmed) return@transaction false
        val creatorId = row[BookingsTable.createdBy]
        val participantIds = BookingParticipantsTable.selectAll().where { BookingParticipantsTable.bookingId eq bookingId }
            .map { it[BookingParticipantsTable.memberId] }
        if (memberId != creatorId && memberId !in participantIds) return@transaction false
        val startTime = row[BookingsTable.startTime]
        val now = LocalDateTime.now()
        if (startTime <= now) return@transaction false
        if (java.time.Duration.between(now, startTime).toMinutes() < 120) return@transaction false
        BookingsTable.update(where = { BookingsTable.bookingId eq bookingId }) {
            it[BookingsTable.status] = BookingStatus.cancelled
        }
        true
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
}
