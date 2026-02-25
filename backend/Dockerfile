# Build stage
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app

COPY gradlew .
COPY gradle gradle
COPY build.gradle.kts settings.gradle.kts ./
RUN ./gradlew dependencies --no-daemon || true

COPY src src
RUN ./gradlew installDist --no-daemon

# Run stage
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN adduser -D -u 1000 appuser
COPY --from=build /app/build/install/cms-backend/ ./
RUN chown -R appuser:appuser /app

USER appuser
EXPOSE 8080
ENTRYPOINT ["./bin/cms-backend"]
