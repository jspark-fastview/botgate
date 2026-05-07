package io.guardus.admin.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;

/**
 * CORS + 정적 파일 서빙 설정.
 *
 * 정적 파일은 WEB_DIR 환경변수(기본: /app/web)에서 서빙.
 * REST 컨트롤러(@RestController) 매핑이 우선 처리되므로
 * /admin/*, /auth/*, /me/*, /tokens 등 API 경로는 영향 없음.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // / → index.html (URL 유지, forward)
        registry.addViewController("/").setViewName("forward:/index.html");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String webDir = System.getenv().getOrDefault("WEB_DIR", "/app/web");
        registry.addResourceHandler("/**")
                .addResourceLocations("file:" + webDir + "/")
                .setCachePeriod(0);       // 개발 중 캐시 비활성화
    }
}
