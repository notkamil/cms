import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.v1.jdbc.Database
import org.slf4j.LoggerFactory
import ru.itmo.cms.repository.BookingRepository
import ru.itmo.cms.repository.markExpiredSubscriptions
import ru.itmo.cms.repository.SpaceRepository
import ru.itmo.cms.repository.StaffRepository
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import ru.itmo.cms.repository.MembersTable
import ru.itmo.cms.routes.configureAuthRoutes
import ru.itmo.cms.routes.configureStaffRoutes

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

    StaffRepository.ensureBootstrapSuperadmin()

    val jwtConfig = environment.config.config("jwt")
    val jwtSecret = jwtConfig.property("secret").getString()
    val jwtIssuer = jwtConfig.property("issuer").getString()
    val jwtRealm = jwtConfig.property("realm").getString()
    install(Authentication) {
        jwt("jwt") {
            realm = jwtRealm
            verifier(
                JWT.require(Algorithm.HMAC256(jwtSecret))
                    .withAudience(jwtConfig.property("audience").getString())
                    .withIssuer(jwtIssuer)
                    .build()
            )
            validate { credential ->
                val subject = credential.payload.subject
                if (subject != null) JWTPrincipal(credential.payload) else null
            }
        }
        jwt("jwt-staff") {
            realm = jwtRealm
            verifier(
                JWT.require(Algorithm.HMAC256(jwtSecret))
                    .withAudience(jwtConfig.property("staffAudience").getString())
                    .withIssuer(jwtIssuer)
                    .build()
            )
            validate { credential ->
                val subject = credential.payload.subject
                if (subject != null) JWTPrincipal(credential.payload) else null
            }
        }
    }
    install(ContentNegotiation) {
        json(Json {
            prettyPrint = true
            isLenient = true
        })
    }
    install(CORS) {
        allowHost("localhost:5173", listOf("http"))
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Patch)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
    }
    configureAuthRoutes()
    configureStaffRoutes()

    val statusSyncLog = LoggerFactory.getLogger("StatusSyncJob")
    GlobalScope.launch(Dispatchers.Default) {
        while (true) {
            try {
                BookingRepository.markCompletedBookings()
                markExpiredSubscriptions()
                SpaceRepository.syncSpaceStatusFromBookings()
            } catch (e: Exception) {
                statusSyncLog.error("Status sync job failed", e)
            }
            delay(60_000)
        }
    }

    routing {
        get("/") {
            call.respondText("Hello from CMS backend")
        }
        get("/api/health") {
            val dbStatus = try {
                transaction { MembersTable.selectAll().limit(1).firstOrNull(); }
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
