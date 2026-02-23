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
