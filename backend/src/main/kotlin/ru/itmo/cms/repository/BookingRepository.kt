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
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/** Booking row for timeline with isCreator/isParticipant for current user. */
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

/** Data access and business logic for bookings: create, cancel, timeline, participants, fix-subscription. */
object BookingRepository {

    /** Mark completed: status=confirmed and end_time < now → completed. Called from scheduler. */
    fun markCompletedBookings(): Unit = transaction {
        val now = LocalDateTime.now()
        BookingsTable.update(where = {
            (BookingsTable.status eq BookingStatus.confirmed) and (BookingsTable.endTime less now)
        }) {
            it[BookingsTable.status] = BookingStatus.completed
        }
    }

    /** Count active upcoming bookings for space (confirmed, endTime > now). Used before disabling space. */
    fun countActiveUpcomingBookingsForSpace(spaceId: Int): Int = transaction {
        val now = LocalDateTime.now()
        BookingsTable.selectAll().where {
            (BookingsTable.spaceId eq spaceId) and
                (BookingsTable.status eq BookingStatus.confirmed) and
                (BookingsTable.endTime greater now)
        }.toList().size
    }

    /** Bookings in [from, to) for timeline. creatorEmail/participantEmails only for own/participant. */
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

    /** Bookings in [from, to) for staff: all bookings with creator/participant emails. */
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

    /** Booking by id with subscription info (subscriptionId, tariffType) for staff. */
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

    /** Create fix-subscription booking: one space for [startDate, endDate]. Call inside existing transaction. */
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

    /** Set status cancelled for all confirmed bookings linked to subscription. Call when cancelling subscription from staff. */
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

    /** Whether subscription has at least one linked booking (BookingSubscriptions). */
    fun hasBookingForSubscription(subscriptionId: Int): Boolean = transaction {
        BookingSubscriptionsTable.selectAll()
            .where { BookingSubscriptionsTable.subscriptionId eq subscriptionId }
            .limit(1)
            .toList()
            .isNotEmpty()
    }

    /** Whether there is overlap in space and time (touching end=start allowed). */
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

    /** Create booking: slot granularity, no overlap, working hours check (except fix-sub), subscription: deduct minutes; one_off: OneOff+transaction. */
    fun create(
        memberId: Int,
        spaceId: Int,
        startTime: LocalDateTime,
        endTime: LocalDateTime,
        bookingType: BookingType,
        subscriptionId: Int?,
        tariffId: Int?,
        participantMemberIds: List<Int>,
        slotMinutes: Int,
        minBookingMinutes: Int,
        maxBookingDaysAhead: Int,
        workingHours24_7: Boolean,
        workingHoursByDay: Map<Int, Pair<LocalTime, LocalTime>>,
        zoneId: ZoneId
    ): Int? = transaction {
        val durationMinutes = java.time.Duration.between(startTime, endTime).toMinutes().toInt()
        if (durationMinutes <= 0) return@transaction null
        if (slotMinutes <= 0 || durationMinutes % slotMinutes != 0) return@transaction null
        if (startTime.minute % slotMinutes != 0 || startTime.second != 0 || startTime.nano != 0) return@transaction null
        if (durationMinutes < minBookingMinutes) return@transaction null
        val now = ZonedDateTime.now(zoneId).toLocalDateTime()
        val deadline = now.plusDays(maxBookingDaysAhead.toLong())
        if (endTime >= deadline) return@transaction null

        val isFixedSubscription = when (bookingType) {
            BookingType.one_time -> false
            BookingType.subscription -> {
                val subRow = subscriptionId?.let { id ->
                    SubscriptionsTable.selectAll().where { SubscriptionsTable.subscriptionId eq id }.singleOrNull()
                } ?: null
                val tariff = subRow?.let { TariffRepository.findById(it[SubscriptionsTable.tariffId]) }
                tariff?.type == TariffType.fixed
            }
        }
        if (!isFixedSubscription && !workingHours24_7) {
            var date = startTime.toLocalDate()
            val endDate = if (endTime.toLocalTime() == LocalTime.MIDNIGHT) endTime.toLocalDate().minusDays(1) else endTime.toLocalDate()
            while (!date.isAfter(endDate)) {
                val dayOfWeek = date.dayOfWeek.value
                val (open, close) = workingHoursByDay[dayOfWeek] ?: return@transaction null
                val dayOpen = date.atTime(open)
                val dayClose = date.atTime(close)
                if (startTime.toLocalDate() == date && startTime < dayOpen) return@transaction null
                if (endTime.toLocalDate() == date && endTime > dayClose) return@transaction null
                date = date.plusDays(1)
            }
        }

        val space = SpaceRepository.findById(spaceId) ?: return@transaction null
        if (space.status == "disabled") return@transaction null
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

    /** Reason cancel is not allowed; null if cancel is allowed. cancelBeforeMinutes = min minutes before start. */
    fun cancelFailureReason(bookingId: Int, memberId: Int, cancelBeforeMinutes: Int, zoneId: ZoneId): String? = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull()
            ?: return@transaction "Бронирование не найдено"
        if (row[BookingsTable.status] != BookingStatus.confirmed) return@transaction "Бронирование уже отменено или завершено"
        val creatorId = row[BookingsTable.createdBy]
        if (memberId != creatorId) return@transaction "Отменить бронирование может только владелец"
        if (row[BookingsTable.bookingType] == BookingType.subscription) {
            val bsRow = BookingSubscriptionsTable.selectAll().where { BookingSubscriptionsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction null
            val subRow = SubscriptionsTable.selectAll().where { SubscriptionsTable.subscriptionId eq bsRow[BookingSubscriptionsTable.subscriptionId] }.singleOrNull() ?: return@transaction null
            val tariff = TariffRepository.findById(subRow[SubscriptionsTable.tariffId])
            if (tariff?.type == TariffType.fixed) return@transaction "Отмена возможна только через администратора"
        }
        val startTime = row[BookingsTable.startTime]
        val now = ZonedDateTime.now(zoneId).toLocalDateTime()
        if (startTime <= now) return@transaction "Бронирование уже началось или прошло"
        val mins = java.time.Duration.between(now, startTime).toMinutes()
        if (mins < cancelBeforeMinutes) {
            val msg = if (cancelBeforeMinutes >= 60 && cancelBeforeMinutes % 60 == 0) "за ${cancelBeforeMinutes / 60} ч" else "за $cancelBeforeMinutes мин"
            return@transaction "Отменить можно не позднее чем $msg до начала"
        }
        null
    }

    /** Perform cancel with refund (one_time) or return minutes (package subscription). Call after cancelFailureReason check. */
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

    /** Staff cancel booking. Do not use for fix subscription. returnMinutes/returnMoney for package/one_time refund. */
    fun cancelWithSideEffectsStaff(bookingId: Int, returnMinutes: Boolean, returnMoney: Boolean = true) = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction
        val startTime = row[BookingsTable.startTime]
        val endTime = row[BookingsTable.endTime]
        val durationMinutes = java.time.Duration.between(startTime, endTime).toMinutes().toInt()
        when (row[BookingsTable.bookingType]) {
            BookingType.one_time -> {
                if (returnMoney) {
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

    /** Set booking to cancelled only (no refund, no return minutes). For orphans (closed subscription). */
    fun cancelBookingOnly(bookingId: Int) = transaction {
        BookingsTable.update(where = { BookingsTable.bookingId eq bookingId }) {
            it[BookingsTable.status] = BookingStatus.cancelled
        }
    }

    /** Single booking by id (no creator/participant flags). Use for member or staff lookup. */
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

    /** User bookings (creator or participant): current = active/pending, archive = past + cancelled. */
    fun listMyBookings(memberId: Int): Pair<List<BookingTimelineRow>, List<BookingTimelineRow>> = transaction {
        val now = LocalDateTime.now()
        val all = listForDateRange(LocalDateTime.of(2000, 1, 1, 0, 0), LocalDateTime.of(2100, 1, 1, 0, 0), memberId)
            .filter { it.isCreator || it.isParticipant }
        val current = all.filter { it.status == BookingStatus.confirmed && it.endTime > now }
        val archive = all.filter { it.status != BookingStatus.confirmed || it.endTime <= now }
        Pair(current.sortedBy { it.startTime }, archive.sortedByDescending { it.startTime })
    }

    /** Update booking participants (creator only, confirmed, not started yet). */
    fun updateParticipantsFailureReason(bookingId: Int, memberId: Int, zoneId: ZoneId): String? = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull()
            ?: return@transaction "Бронирование не найдено"
        if (row[BookingsTable.status] != BookingStatus.confirmed) return@transaction "Бронирование отменено или завершено"
        if (row[BookingsTable.createdBy] != memberId) return@transaction "Только владелец может менять участников"
        val startTime = row[BookingsTable.startTime]
        if (startTime <= ZonedDateTime.now(zoneId).toLocalDateTime()) return@transaction "Бронирование уже началось"
        null
    }

    /** Replace participants list (creator only; confirmed, not started). */
    fun updateParticipants(bookingId: Int, participantMemberIds: List<Int>, creatorId: Int) = transaction {
        BookingParticipantsTable.deleteWhere { BookingParticipantsTable.bookingId eq bookingId }
        participantMemberIds.distinct().filter { it != creatorId }.forEach { pid ->
            BookingParticipantsTable.insert {
                it[BookingParticipantsTable.bookingId] = bookingId
                it[BookingParticipantsTable.memberId] = pid
            }
        }
    }

    /** Check if staff can edit participants; null if allowed. */
    fun updateParticipantsForStaffFailureReason(bookingId: Int, zoneId: ZoneId): String? = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull()
            ?: return@transaction "Бронирование не найдено"
        if (row[BookingsTable.status] != BookingStatus.confirmed) return@transaction "Бронирование отменено или завершено"
        val startTime = row[BookingsTable.startTime]
        if (startTime <= ZonedDateTime.now(zoneId).toLocalDateTime()) return@transaction "Бронирование уже началось"
        null
    }

    /** Update booking participants (staff; no creator check). */
    fun updateParticipantsForStaff(bookingId: Int, participantMemberIds: List<Int>) = transaction {
        val row = BookingsTable.selectAll().where { BookingsTable.bookingId eq bookingId }.singleOrNull() ?: return@transaction
        val creatorId = row[BookingsTable.createdBy]
        updateParticipants(bookingId, participantMemberIds, creatorId)
    }
}
