# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /build
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn dependency:go-offline -q
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
# --chmod=644: K8s 에서 non-root user 로 실행 시 읽기 가능. ADD 기본 0600.
ADD --chmod=644 https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.10.0/opentelemetry-javaagent.jar /app/otel-javaagent.jar
COPY --from=build /build/target/*.jar app.jar
EXPOSE 3001
ENV JAVA_TOOL_OPTIONS="-javaagent:/app/otel-javaagent.jar"
ENV OTEL_LOGS_EXPORTER=otlp
ENV OTEL_METRICS_EXPORTER=none
ENTRYPOINT ["java", "-jar", "app.jar"]
