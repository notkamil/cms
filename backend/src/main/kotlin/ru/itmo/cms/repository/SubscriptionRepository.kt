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
    val remainingHours: Int,
    val status: SubscriptionStatus
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
                    remainingHours = row[SubscriptionsTable.remainingHours],
                    status = row[SubscriptionsTable.status]
                )
            }
    }

    fun create(
        memberId: Int,
        tariffId: Int,
        startDate: LocalDate,
        endDate: LocalDate,
        remainingHours: Int
    ): SubscriptionRow = transaction {
        val tariff = TariffRepository.findById(tariffId) ?: error("Tariff not found")
        val id = SubscriptionsTable.insert {
            it[SubscriptionsTable.memberId] = memberId
            it[SubscriptionsTable.tariffId] = tariffId
            it[SubscriptionsTable.startDate] = startDate
            it[SubscriptionsTable.endDate] = endDate
            it[SubscriptionsTable.remainingHours] = remainingHours
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
            remainingHours = row[SubscriptionsTable.remainingHours],
            status = row[SubscriptionsTable.status]
        )
    }

    /**
     * Оформление подписки с оплатой с баланса: проверка баланса, списание, транзакция оплаты, запись в TransactionSubscriptions.
     * @return SubscriptionRow при успехе, null при недостатке средств или если участник не найден
     */
    fun createWithPayment(
        memberId: Int,
        tariffId: Int,
        tariffName: String,
        price: BigDecimal,
        startDate: LocalDate,
        endDate: LocalDate,
        remainingHours: Int
    ): SubscriptionRow? = transaction {
        val memberRow = MembersTable.selectAll().where { MembersTable.memberId eq memberId }.singleOrNull() ?: return@transaction null
        val balance = memberRow[MembersTable.balance]
        if (balance < price) return@transaction null

        val subscriptionId = SubscriptionsTable.insert {
            it[SubscriptionsTable.memberId] = memberId
            it[SubscriptionsTable.tariffId] = tariffId
            it[SubscriptionsTable.startDate] = startDate
            it[SubscriptionsTable.endDate] = endDate
            it[SubscriptionsTable.remainingHours] = remainingHours
            it[SubscriptionsTable.status] = SubscriptionStatus.active
        } get SubscriptionsTable.subscriptionId

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
            remainingHours = remainingHours,
            status = SubscriptionStatus.active
        )
    }
}
