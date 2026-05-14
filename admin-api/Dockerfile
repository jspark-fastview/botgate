# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /build
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn dependency:go-offline -q
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn package -DskipTests -q

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
# OpenTelemetry Java agent (자동 계측)
# --chmod=644: K8s 에서 non-root user (1000) 로 실행 시 읽기 가능. ADD 기본 0600 이라 explicit.
ADD --chmod=644 https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.10.0/opentelemetry-javaagent.jar /app/otel-javaagent.jar
COPY --from=build /build/target/*.jar app.jar
# admin SPA 정적 파일 (admin.html + bg-*.jsx 등 ~360KB)
# CI workflow 가 build 직전 ../web 을 admin-api/web 으로 복사 (build context 외부 접근 회피)
COPY web /app/web/
EXPOSE 3002
ENV JAVA_TOOL_OPTIONS="-javaagent:/app/otel-javaagent.jar"
ENV OTEL_LOGS_EXPORTER=otlp
ENV OTEL_METRICS_EXPORTER=none
ENTRYPOINT ["java", "-jar", "app.jar"]
