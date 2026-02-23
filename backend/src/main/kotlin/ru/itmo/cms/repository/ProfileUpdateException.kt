package ru.itmo.cms.repository

/**
 * Thrown when profile update or password change fails validation.
 * Route layer maps these to 400/409 with appropriate message.
 */
sealed class ProfileUpdateException(message: String) : Exception(message) {
    class InvalidPassword(message: String = "Invalid password") : ProfileUpdateException(message)
    class EmailAlreadyUsed(message: String = "This email is already in use") : ProfileUpdateException(message)
    class PhoneAlreadyUsed(message: String = "This phone number is already in use") : ProfileUpdateException(message)
    class PhoneNotE164(message: String = "Phone must be in international format (E.164), e.g. +79001234567") : ProfileUpdateException(message)
    class NothingChanged(message: String = "Ничего не изменено") : ProfileUpdateException(message)
}
