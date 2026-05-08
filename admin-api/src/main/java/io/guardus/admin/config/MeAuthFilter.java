package io.guardus.admin.config;

import io.guardus.admin.service.SessionService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * /me/* 라우트 인증 필터.
 * - Authorization 헤더의 세션 토큰을 검증
 * - 유효하지 않으면 401 반환 (SPA가 /login 으로 redirect 가능)
 * - /auth/* 와 정적 파일은 그대로 통과
 */
@Component
public class MeAuthFilter extends OncePerRequestFilter {

    private final SessionService sessions;

    public MeAuthFilter(SessionService sessions) {
        this.sessions = sessions;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        String uri = req.getRequestURI();
        if (!uri.startsWith("/me/")) {
            chain.doFilter(req, res);
            return;
        }

        String auth = req.getHeader("Authorization");
        if (auth == null || sessions.validate(auth) == null) {
            res.setStatus(401);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write("{\"error\":\"unauthorized\"}");
            return;
        }

        chain.doFilter(req, res);
    }
}
