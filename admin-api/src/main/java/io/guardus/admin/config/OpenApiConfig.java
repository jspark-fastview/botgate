package io.guardus.admin.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeIn;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.annotations.servers.Server;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
    info = @Info(
        title       = "GuardUs admin-api",
        version     = "v1",
        description = """
            GuardUs 봇 게이트웨이 어드민 API.

            인증 그룹:
            - /admin/*  → ADMIN_KEY 또는 STATS_KEY (Bearer)
            - /me/*     → 세션 토큰 (Bearer, /auth/login 후 발급)
            - /auth/*   → 공개 (register/login)
            - /tokens   → 공개 (외부 토큰 발급)
            """,
        license = @License(name = "Internal")
    ),
    servers = {
        @Server(url = "/", description = "현재 호스트")
    }
)
@SecurityScheme(
    name        = "bearerAuth",
    type        = SecuritySchemeType.HTTP,
    scheme      = "bearer",
    bearerFormat = "JWT",
    in          = SecuritySchemeIn.HEADER,
    description = "ADMIN_KEY (operator) 또는 세션 토큰 (channel owner)"
)
public class OpenApiConfig {
}
