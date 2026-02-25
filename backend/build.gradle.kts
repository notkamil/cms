plugins {
    application
    kotlin("jvm") version "2.2.0"
    kotlin("plugin.serialization") version "2.2.0"
}

group = "ru.itmo.cms"
version = "0.0.1"

application {
    mainClass.set("io.ktor.server.netty.EngineMain")
}

repositories {
    mavenCentral()
}

val ktorVersion = "2.3.13"

val exposedVersion = "1.0.0"

dependencies {
    implementation("io.ktor:ktor-server-core-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-netty-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-auth-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-auth-jwt-jvm:$ktorVersion")
    implementation("io.ktor:ktor-server-cors-jvm:$ktorVersion")
    implementation("ch.qos.logback:logback-classic:1.4.14")
    // JDBC and connection pool
    implementation("org.postgresql:postgresql:42.7.2")
    implementation("com.zaxxer:HikariCP:5.1.0")
    // Exposed (type-safe queries, table mapping)
    implementation("org.jetbrains.exposed:exposed-core:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-dao:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-jdbc:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-java-time:$exposedVersion")
    // Password hashing
    implementation("at.favre.lib:bcrypt:0.10.2")
    // JWT creation (validation via Ktor Auth JWT)
    implementation("com.auth0:java-jwt:4.4.0")
}

kotlin {
    jvmToolchain(21)
}

// Password hash for DB (staff/members): ./gradlew hashPassword -Ppassword=your_password
tasks.register<JavaExec>("hashPassword") {
    group = "application"
    mainClass.set("ru.itmo.cms.util.HashPasswordKt")
    classpath = sourceSets["main"].runtimeClasspath
    args = listOf(project.findProperty("password")?.toString() ?: "changeme")
}
