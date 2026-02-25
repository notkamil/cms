package ru.itmo.cms.repository

/**
 * Thrown when staff profile update or staff management fails validation.
 */
sealed class StaffProfileUpdateException(message: String) : Exception(message) {
    class InvalidPassword(message: String = "Неверный пароль") : StaffProfileUpdateException(message)
    class InvalidInput(message: String) : StaffProfileUpdateException(message)
    class EmailAlreadyUsed(message: String = "Этот email уже используется") : StaffProfileUpdateException(message)
    class PhoneAlreadyUsed(message: String = "Этот телефон уже используется") : StaffProfileUpdateException(message)
    class PhoneNotE164(message: String = "Телефон в международном формате (E.164), например +79001234567") : StaffProfileUpdateException(message)
    class NothingChanged(message: String = "Ничего не изменено") : StaffProfileUpdateException(message)
}
