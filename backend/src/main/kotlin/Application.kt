import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.transactions.transaction

fun Application.module() {
    val dbConfig = environment.config.config("database")
    val jdbcUrl = dbConfig.property("url").getString()
    val driverClassName = dbConfig.property("driver").getString()
    val dbUser = dbConfig.property("user").getString()
    val dbPassword = dbConfig.property("password").getString()

    val hikariConfig = HikariConfig().apply {
        this.jdbcUrl = jdbcUrl
        this.driverClassName = driverClassName
        username = dbUser
        password = dbPassword
        maximumPoolSize = 4
        // When DB is down, fail fast instead of waiting default 30s for connection.
        connectionTimeout = 5000L
    }
    val dataSource = HikariDataSource(hikariConfig)
    Database.connect(dataSource)

    install(ContentNegotiation) {
        json(Json {
            prettyPrint = true
            isLenient = true
        })
    }
    routing {
        get("/") {
            call.respondText("Hello from CMS backend")
        }
        get("/api/health") {
            val dbStatus = try {
                transaction { exec("SELECT 1") }
                "connected"
            } catch (e: Exception) {
                "error"
            }
            if (dbStatus == "error") {
                call.respond(
                    io.ktor.http.HttpStatusCode.ServiceUnavailable,
                    mapOf(
                        "status" to "error",
                        "service" to "cms-backend",
                        "db" to dbStatus
                    )
                )
            } else {
                call.respond(
                    mapOf(
                        "status" to "ok",
                        "service" to "cms-backend",
                        "db" to dbStatus
                    )
                )
            }
        }
    }
}
