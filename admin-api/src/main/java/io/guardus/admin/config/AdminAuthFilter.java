package io.guardus.admin.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Authorization filter for /admin/* routes.
 * ADMIN_KEY → full access
 * STATS_KEY → GET /admin/stats/* and /admin/logs only (read-only)
 */
@Component
public class AdminAuthFilter extends OncePerRequestFilter {

    private final String adminKey;
    private final String statsKey;

    public AdminAuthFilter(Environment env) {
        String ak = env.getProperty("ADMIN_KEY", "");
        this.adminKey = ak.isBlank() ? null : ak.trim();
        String sk = env.getProperty("STATS_KEY", "");
        this.statsKey = sk.isBlank() ? null : sk.trim();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        String uri = req.getRequestURI();
        // /admin/ 이하 API만 보호 (/admin.html 같은 정적 파일은 통과)
        if (!uri.startsWith("/admin/")) {
            chain.doFilter(req, res);
            return;
        }

        // No keys configured → open (dev/test mode)
        if (adminKey == null && statsKey == null) {
            chain.doFilter(req, res);
            return;
        }

        String authHeader = req.getHeader("Authorization");
        String auth = authHeader != null ? authHeader.replaceAll("(?i)^Bearer\\s+", "") : "";

        // ADMIN_KEY: full access
        if (adminKey != null && adminKey.equals(auth)) {
            chain.doFilter(req, res);
            return;
        }

        // STATS_KEY: read-only GET /admin/stats/* and /admin/logs
        if (statsKey != null && statsKey.equals(auth)) {
            if (!"GET".equalsIgnoreCase(req.getMethod())) {
                sendJson(res, 403, "{\"error\":\"STATS_KEY is read-only\"}");
                return;
            }
            if (!uri.startsWith("/admin/stats") && !uri.startsWith("/admin/logs")) {
                sendJson(res, 403, "{\"error\":\"STATS_KEY allows /admin/stats/* and /admin/logs only\"}");
                return;
            }
            chain.doFilter(req, res);
            return;
        }

        sendJson(res, 401, "{\"error\":\"unauthorized\"}");
    }

    private void sendJson(HttpServletResponse res, int status, String body) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write(body);
    }
}
