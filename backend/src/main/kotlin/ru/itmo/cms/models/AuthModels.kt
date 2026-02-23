package ru.itmo.cms.models

import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String,
    val phone: String
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class MemberResponse(
    val id: Int,
    val name: String,
    val email: String,
    val phone: String,
    val balance: Double,
    val registeredAt: String
)

@Serializable
data class AuthResponse(
    val token: String,
    val member: MemberResponse
)

@Serializable
data class PatchMeRequest(
    val name: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val currentPassword: String
)

@Serializable
data class PutPasswordRequest(
    val currentPassword: String,
    val newPassword: String
)

@Serializable
data class DepositRequest(
    val amount: String
)

/** Ответ с данными сотрудника (без пароля) */
@Serializable
data class StaffResponse(
    val id: Int,
    val name: String,
    val email: String,
    val phone: String,
    val role: String,
    val position: String
)

/** Ответ при логине в админку: токен + данные сотрудника */
@Serializable
data class StaffAuthResponse(
    val token: String,
    val staff: StaffResponse
)

/** Элемент истории транзакций: время, изменение баланса (положительное — приход, отрицательное — расход), комментарий */
@Serializable
data class TransactionResponse(
    val transactionDate: String,
    val amountChange: Double,
    val description: String
)
