package ru.itmo.cms.repository

import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.less
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

data class SubscriptionRow(
    val subscriptionId: Int,
    val memberId: Int,
    val tariffId: Int,
    val tariffName: String,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val remainingMinutes: Int,
    val status: SubscriptionStatus
)

/** Строка подписки для списка в админке: с email участника, типом тарифа и суммой оплаты (если есть). */
data class StaffSubscriptionRow(
    val subscriptionId: Int,
    val memberId: Int,
    val memberEmail: String,
    val tariffId: Int,
    val tariffName: String,
    val tariffType: TariffType,
    val startDate: LocalDate,
    val endDate: LocalDate,
    val remainingMinutes: Int,
    val status: SubscriptionStatus,
    val paymentAmount: BigDecimal?
)

/**
 * Переводит просроченные подписки (status = active, end_date < сегодня) в expired.
 *
 * Сейчас вызывается при каждом GET /api/me/subscriptions (открытие страницы «Подписки»).
 * Альтернативы: периодическая задача (cron/scheduler) раз в день;
 * или триггер/функция в БД при чтении — если нужен переход в expired даже без визита пользователя.
 */
fun markExpiredSubscriptions(): Unit = transaction {
    val today = LocalDate.now()
    SubscriptionsTable.update(where = {
        (SubscriptionsTable.status eq SubscriptionStatus.active) and (SubscriptionsTable.endDate less today)
    }) {
        it[SubscriptionsTable.status] = SubscriptionStatus.expired
    }
}

object SubscriptionRepository {

    /** Статус подписки или null, если не найдена. */
    fun getStatus(subscriptionId: Int): SubscriptionStatus? = transaction {
        SubscriptionsTable.selectAll().where { SubscriptionsTable.subscriptionId eq subscriptionId }.singleOrNull()?.get(SubscriptionsTable.status)
    }

    fun findByMemberId(memberId: Int): List<SubscriptionRow> = transaction {
        val tariffsById = TariffRepository.findAll().associateBy { it.tariffId }
        SubscriptionsTable.selectAll()
            .where { SubscriptionsTable.memberId eq memberId }
            .map { row ->
                val tariffId = row[SubscriptionsTable.tariffId]
                val tariffName = tariffsById[tariffId]?.name ?: ""
                SubscriptionRow(
                    subscriptionId = row[SubscriptionsTable.subscriptionId],
                    memberId = row[SubscriptionsTable.memberId],
                    tariffId = tariffId,
                    tariffName = tariffName,
                    startDate = row[SubscriptionsTable.startDate],
                    endDate = row[SubscriptionsTable.endDate],
                    remainingMinutes = row[SubscriptionsTable.remainingMinutes],
                    status = row[SubscriptionsTable.status]
                )
            }
    }

    fun create(
        memberId: Int,
        tariffId: Int,
        startDate: LocalDate,
        endDate: LocalDate,
        remainingMinutes: Int
    ): SubscriptionRow = transaction {
        val tariff = TariffRepository.findById(tariffId) ?: error("Tariff not found")
        val id = SubscriptionsTable.insert {
            it[SubscriptionsTable.memberId] = memberId
            it[SubscriptionsTable.tariffId] = tariffId
            it[SubscriptionsTable.startDate] = startDate
            it[SubscriptionsTable.endDate] = endDate
            it[SubscriptionsTable.remainingMinutes] = remainingMinutes
            it[SubscriptionsTable.status] = SubscriptionStatus.active
        } get SubscriptionsTable.subscriptionId
        val row = SubscriptionsTable.selectAll()
            .where { SubscriptionsTable.subscriptionId eq id }
            .single()
        SubscriptionRow(
            subscriptionId = row[SubscriptionsTable.subscriptionId],
            memberId = row[SubscriptionsTable.memberId],
            tariffId = row[SubscriptionsTable.tariffId],
            tariffName = tariff.name,
            startDate = row[SubscriptionsTable.startDate],
            endDate = row[SubscriptionsTable.endDate],
            remainingMinutes = row[SubscriptionsTable.remainingMinutes],
            status = row[SubscriptionsTable.status]
        )
    }

    /**
     * Оформление подписки с оплатой с баланса: проверка баланса, списание, транзакция оплаты, запись в TransactionSubscriptions.
     * Для фикс-тарифа (fixSpaceId != null) сразу создаётся бронирование на выбранное пространство на весь период.
     * @return SubscriptionRow при успехе, null при недостатке средств или если участник не найден
     */
    fun createWithPayment(
        memberId: Int,
        tariffId: Int,
        tariffName: String,
        price: BigDecimal,
        startDate: LocalDate,
        endDate: LocalDate,
        remainingMinutes: Int,
        fixSpaceId: Int? = null
    ): SubscriptionRow? = transaction {
        val memberRow = MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull() ?: return@transaction null
        val balance = memberRow[MembersTable.balance]
        if (balance < price) return@transaction null

        val subscriptionId = SubscriptionsTable.insert {
            it[SubscriptionsTable.memberId] = memberId
            it[SubscriptionsTable.tariffId] = tariffId
            it[SubscriptionsTable.startDate] = startDate
            it[SubscriptionsTable.endDate] = endDate
            it[SubscriptionsTable.remainingMinutes] = remainingMinutes
            it[SubscriptionsTable.status] = SubscriptionStatus.active
        } get SubscriptionsTable.subscriptionId

        if (fixSpaceId != null) {
            BookingRepository.createFixBooking(memberId, fixSpaceId, subscriptionId, startDate, endDate)
        }

        val dateFmt = DateTimeFormatter.ofPattern("dd.MM.yyyy")
        val description = "Подписка «${tariffName}» ${startDate.format(dateFmt)}–${endDate.format(dateFmt)}"

        val transactionId = TransactionsTable.insert {
            it[TransactionsTable.memberId] = memberId
            it[TransactionsTable.amount] = price
            it[TransactionsTable.transactionType] = TransactionType.payment
            it[TransactionsTable.transactionDate] = LocalDateTime.now()
            it[TransactionsTable.description] = description
        } get TransactionsTable.transactionId

        MembersTable.update(where = { MembersTable.memberId eq memberId }) {
            it[MembersTable.balance] = balance - price
        }

        TransactionSubscriptionsTable.insert {
            it[TransactionSubscriptionsTable.transactionId] = transactionId
            it[TransactionSubscriptionsTable.subscriptionId] = subscriptionId
        }

        SubscriptionRow(
            subscriptionId = subscriptionId,
            memberId = memberId,
            tariffId = tariffId,
            tariffName = tariffName,
            startDate = startDate,
            endDate = endDate,
            remainingMinutes = remainingMinutes,
            status = SubscriptionStatus.active
        )
    }

    /** Список всех подписок для админки: с email участника, типом тарифа и суммой оплаты (если есть транзакция оплаты). */
    fun findAllForStaff(): List<StaffSubscriptionRow> = transaction {
        markExpiredSubscriptions()
        val tariffsById = TariffRepository.findAll().associateBy { it.tariffId }
        val memberIds = SubscriptionsTable.selectAll().map { it[SubscriptionsTable.memberId] }.toSet()
        val membersById = if (memberIds.isEmpty()) emptyMap() else {
            MembersTable.selectAll()
                .filter { it[MembersTable.memberId] in memberIds }
                .associate { it[MembersTable.memberId] to it[MembersTable.email] }
        }
        val paymentBySubscriptionId = TransactionSubscriptionsTable.selectAll()
            .associate { it[TransactionSubscriptionsTable.subscriptionId] to it[TransactionSubscriptionsTable.transactionId] }
        val paymentTransactionIds = paymentBySubscriptionId.values.toSet()
        val paymentAmountByTransactionId = if (paymentTransactionIds.isEmpty()) emptyMap() else {
            TransactionsTable.selectAll()
                .filter { it[TransactionsTable.transactionId] in paymentTransactionIds && it[TransactionsTable.transactionType] == TransactionType.payment }
                .associate { it[TransactionsTable.transactionId] to it[TransactionsTable.amount] }
        }
        SubscriptionsTable.selectAll()
            .orderBy(SubscriptionsTable.subscriptionId, org.jetbrains.exposed.v1.core.SortOrder.DESC)
            .map { row ->
                val subscriptionId = row[SubscriptionsTable.subscriptionId]
                val tariffId = row[SubscriptionsTable.tariffId]
                val tariff = tariffsById[tariffId]
                val memberId = row[SubscriptionsTable.memberId]
                val paymentAmount = paymentBySubscriptionId[subscriptionId]?.let { tid -> paymentAmountByTransactionId[tid] }
                StaffSubscriptionRow(
                    subscriptionId = subscriptionId,
                    memberId = memberId,
                    memberEmail = membersById[memberId] ?: "",
                    tariffId = tariffId,
                    tariffName = tariff?.name ?: "",
                    tariffType = tariff?.type ?: TariffType.fixed,
                    startDate = row[SubscriptionsTable.startDate],
                    endDate = row[SubscriptionsTable.endDate],
                    remainingMinutes = row[SubscriptionsTable.remainingMinutes],
                    status = row[SubscriptionsTable.status],
                    paymentAmount = paymentAmount
                )
            }
    }

    /**
     * Сумма оплаты по подписке (из транзакции payment, связанной через TransactionSubscriptions), или null.
     */
    fun getPaymentAmountForSubscription(subscriptionId: Int): BigDecimal? = transaction {
        val tsRow = TransactionSubscriptionsTable.selectAll().where { TransactionSubscriptionsTable.subscriptionId eq subscriptionId }.singleOrNull() ?: return@transaction null
        val transactionId = tsRow[TransactionSubscriptionsTable.transactionId]
        val row = TransactionsTable.selectAll()
            .where { (TransactionsTable.transactionId eq transactionId) and (TransactionsTable.transactionType eq TransactionType.payment) }
            .singleOrNull() ?: return@transaction null
        row[TransactionsTable.amount]
    }

    /**
     * Отмена подписки. Если refundAmount != null и > 0 — создаётся транзакция refund и пополняется баланс.
     * Разрешена для active и expired (чтобы сотрудник мог отменить уже истёкшую подписку и её бронирования).
     * @return null при успехе, иначе текст ошибки
     */
    fun cancelSubscription(subscriptionId: Int, refundAmount: BigDecimal?): String? = transaction {
        val subRow = SubscriptionsTable.selectAll().where { SubscriptionsTable.subscriptionId eq subscriptionId }.singleOrNull() ?: return@transaction "Подписка не найдена"
        val status = subRow[SubscriptionsTable.status]
        if (status != SubscriptionStatus.active && status != SubscriptionStatus.expired) return@transaction "Подписка уже отменена"

        val memberId = subRow[SubscriptionsTable.memberId]
        val tariffId = subRow[SubscriptionsTable.tariffId]
        val tariffRow = TariffsTable.selectAll().where { TariffsTable.tariffId eq tariffId }.singleOrNull()
        val tariffName = tariffRow?.get(TariffsTable.name) ?: ""

        if (refundAmount != null && refundAmount > java.math.BigDecimal.ZERO) {
            val tsRow = TransactionSubscriptionsTable.selectAll().where { TransactionSubscriptionsTable.subscriptionId eq subscriptionId }.singleOrNull() ?: return@transaction "Не найдена связь с оплатой (возврат невозможен)"
            val payTransId = tsRow[TransactionSubscriptionsTable.transactionId]
            val payRow = TransactionsTable.selectAll()
                .where { (TransactionsTable.transactionId eq payTransId) and (TransactionsTable.transactionType eq TransactionType.payment) }
                .singleOrNull() ?: return@transaction "Не найдена связь с оплатой (возврат невозможен)"
            val paymentAmount = payRow[TransactionsTable.amount]
            if (refundAmount > paymentAmount) return@transaction "Сумма возврата превышает сумму оплаты"
            val memberRow = MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull() ?: return@transaction "Участник не найден"
            val dateFmt = DateTimeFormatter.ofPattern("dd.MM.yyyy")
            val startDate = subRow[SubscriptionsTable.startDate]
            val endDate = subRow[SubscriptionsTable.endDate]
            val description = "Возврат: подписка «$tariffName» ${startDate.format(dateFmt)}–${endDate.format(dateFmt)}"
            TransactionsTable.insert {
                it[TransactionsTable.memberId] = memberId
                it[TransactionsTable.amount] = refundAmount
                it[TransactionsTable.transactionType] = TransactionType.refund
                it[TransactionsTable.transactionDate] = LocalDateTime.now()
                it[TransactionsTable.description] = description
            }
            MembersTable.update(where = { MembersTable.memberId eq memberId }) {
                it[MembersTable.balance] = memberRow[MembersTable.balance] + refundAmount
            }
        }

        SubscriptionsTable.update(where = { SubscriptionsTable.subscriptionId eq subscriptionId }) {
            it[SubscriptionsTable.status] = SubscriptionStatus.cancelled
        }
        // Все подтверждённые бронирования по этой подписке (в т.ч. фикс) переводим в cancelled
        BookingRepository.cancelBookingsBySubscriptionId(subscriptionId)
        null
    }
}
