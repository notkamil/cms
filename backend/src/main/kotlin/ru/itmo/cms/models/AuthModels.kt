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

// ----- Member: Subscriptions -----

@Serializable
data class SubscriptionResponse(
    val id: Int,
    val tariffName: String,
    val startDate: String,
    val endDate: String,
    val remainingHours: Int,
    val status: String
)

@Serializable
data class SubscriptionsListResponse(
    val current: List<SubscriptionResponse>,
    val archived: List<SubscriptionResponse>
)

@Serializable
data class AvailableTariffResponse(
    val id: Int,
    val name: String,
    val type: String,
    val durationDays: Int,
    val includedHours: Int,
    val price: String
)

@Serializable
data class CreateSubscriptionRequest(
    val tariffId: Int,
    val startDate: String? = null
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

// ----- Staff: Amenities -----

@Serializable
data class AmenityResponse(
    val id: Int,
    val name: String,
    val description: String
)

@Serializable
data class CreateAmenityRequest(
    val name: String,
    val description: String? = null
)

@Serializable
data class UpdateAmenityRequest(
    val name: String? = null,
    val description: String? = null
)

@Serializable
data class DeleteAmenityConflictResponse(
    val error: String,
    val spaces: List<SpaceSummaryResponse>
)

@Serializable
data class SpaceAmenityAssignment(
    val spaceId: Int,
    val amenityId: Int
)

@Serializable
data class PutSpaceAmenitiesRequest(
    val assignments: List<SpaceAmenityAssignment>
)

// ----- Staff: Tariffs -----

@Serializable
data class TariffResponse(
    val id: Int,
    val name: String,
    val type: String,
    val durationDays: Int,
    val includedHours: Int,
    val price: String,
    val isActive: Boolean,
    val activeSubscriptionCount: Int,
    val subscriptionCount: Int
)

@Serializable
data class CreateTariffRequest(
    val name: String,
    val type: String,
    val durationDays: Int = 0,
    val includedHours: Int = 0,
    val price: String,
    val isActive: Boolean = true
)

@Serializable
data class UpdateTariffRequest(
    val name: String? = null,
    val durationDays: Int? = null,
    val includedHours: Int? = null,
    val price: String? = null,
    val isActive: Boolean? = null
)

@Serializable
data class DeleteTariffConflictResponse(
    val error: String,
    val subscriptionCount: Int
)

@Serializable
data class TariffSpaceAssignment(
    val tariffId: Int,
    val spaceId: Int
)

@Serializable
data class PutTariffSpacesRequest(
    val assignments: List<TariffSpaceAssignment>
)
