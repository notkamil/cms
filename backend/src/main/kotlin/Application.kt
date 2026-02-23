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
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.v1.jdbc.Database
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import ru.itmo.cms.repository.MembersTable
import ru.itmo.cms.routes.configureAuthRoutes

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

    val jwtConfig = environment.config.config("jwt")
    install(Authentication) {
        jwt("jwt") {
            realm = jwtConfig.property("realm").getString()
            verifier(
                JWT.require(Algorithm.HMAC256(jwtConfig.property("secret").getString()))
                    .withAudience(jwtConfig.property("audience").getString())
                    .withIssuer(jwtConfig.property("issuer").getString())
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
    }
    configureAuthRoutes()
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
