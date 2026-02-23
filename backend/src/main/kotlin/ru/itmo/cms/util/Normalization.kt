package ru.itmo.cms.util

/**
 * Returns lowercase trimmed email for storage and uniqueness checks.
 */
fun normalizeEmail(input: String?): String {
    if (input.isNullOrBlank()) return ""
    return input.trim().lowercase()
}

/**
 * Normalizes phone to E.164-like form: must start with '+', then only digits.
 * Strips spaces, parentheses, dashes. If input does not start with '+' (after trim), returns null
 * and caller should respond with 400. Max 15 digits after '+' (E.164).
 */
fun normalizePhone(input: String?): String? {
    if (input.isNullOrBlank()) return null
    val trimmed = input.trim()
    if (!trimmed.startsWith("+")) return null
    val digitsOnly = trimmed.filter { it == '+' || it.isDigit() }
    if (digitsOnly.isEmpty() || digitsOnly == "+") return null
    val digitCount = digitsOnly.count { it.isDigit() }
    if (digitCount < 10 || digitCount > 15) return null
    return digitsOnly
}
