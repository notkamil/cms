package ru.itmo.cms.util

import at.favre.lib.crypto.bcrypt.BCrypt

/**
 * Печатает BCrypt-хеш пароля (cost 12, как в приложении).
 * Запуск: ./gradlew hashPassword -Ppassword=твой_пароль
 * Или: ./gradlew hashPassword  (по умолчанию пароль "changeme")
 */
fun main(args: Array<String>) {
    val password = args.getOrNull(0) ?: "changeme"
    val hash = BCrypt.withDefaults().hashToString(12, password.toCharArray())
    println(hash)
}
