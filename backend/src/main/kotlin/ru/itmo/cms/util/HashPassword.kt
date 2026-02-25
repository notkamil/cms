package ru.itmo.cms.util

import at.favre.lib.crypto.bcrypt.BCrypt

/**
 * Prints BCrypt hash of password (cost 12, same as in app).
 * Run: ./gradlew hashPassword -Ppassword=your_password
 * Or: ./gradlew hashPassword (default password "changeme")
 */
fun main(args: Array<String>) {
    val password = args.getOrNull(0) ?: "changeme"
    val hash = BCrypt.withDefaults().hashToString(12, password.toCharArray())
    println(hash)
}
