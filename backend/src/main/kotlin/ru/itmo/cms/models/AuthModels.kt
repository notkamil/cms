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

// ----- Staff: Space Types -----

@Serializable
data class SpaceTypeResponse(
    val id: Int,
    val name: String,
    val description: String
)

@Serializable
data class CreateSpaceTypeRequest(
    val name: String,
    val description: String? = null
)

@Serializable
data class UpdateSpaceTypeRequest(
    val name: String? = null,
    val description: String? = null
)

@Serializable
data class SpaceSummaryResponse(
    val spaceId: Int,
    val name: String
)

@Serializable
data class DeleteSpaceTypeConflictResponse(
    val error: String,
    val spaces: List<SpaceSummaryResponse>
)

// ----- Staff: Spaces -----

@Serializable
data class SpaceResponse(
    val id: Int,
    val name: String,
    val typeId: Int,
    val typeName: String,
    val floor: Int,
    val capacity: Int,
    val status: String,
    val description: String
)

@Serializable
data class CreateSpaceRequest(
    val name: String,
    val spaceTypeId: Int,
    val floor: Int,
    val capacity: Int,
    val description: String? = null,
    val status: String? = null
)

@Serializable
data class UpdateSpaceRequest(
    val name: String? = null,
    val spaceTypeId: Int? = null,
    val floor: Int? = null,
    val capacity: Int? = null,
    val description: String? = null,
    val status: String? = null
)
