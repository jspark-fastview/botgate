package io.guardus.internal.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.guardus.internal.dto.AccessLogRequest;
import io.guardus.internal.dto.ValidateRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class InternalController {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    // bot_catalog 30초 메모리 캐시 (JS 동작 동일)
    private volatile Map<String, Object> catalogCache = null;
    private volatile long catalogAt = 0L;

    public InternalController(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    // POST /internal/tokens/validate
    @PostMapping("/internal/tokens/validate")
    public ResponseEntity<Map<String, Object>> validateToken(@RequestBody ValidateRequest req) {
        var rows = jdbc.queryForList(
            "SELECT id, plan FROM tokens WHERE token = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))",
            req.token()
        );

        boolean valid = !rows.isEmpty();
        String plan = valid ? (String) rows.get(0).get("plan") : null;

        jdbc.update(
            "INSERT INTO access_logs (token, bot_ua, domain, ip, path, verified, billed, category, bot_purpose, bot_name, bot_vendor, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            valid ? req.token() : null,
            req.bot_ua(), req.domain(), req.ip(), req.path(),
            valid ? 1 : 0,
            Boolean.TRUE.equals(req.billed()) ? 1 : 0,
            "bot",
            req.bot_purpose() != null ? req.bot_purpose() : "generic",
            req.bot_name(),
            req.bot_vendor(),
            valid ? 0 : 1
        );

        if (!valid) {
            return ResponseEntity.status(401).body(Map.of("valid", false));
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("valid", true);
        resp.put("plan", plan != null ? plan : "free");
        return ResponseEntity.ok(resp);
    }

    // POST /internal/access
    @PostMapping("/internal/access")
    public ResponseEntity<Void> logAccess(@RequestBody AccessLogRequest req) {
        jdbc.update(
            "INSERT INTO access_logs (token, bot_ua, domain, ip, path, verified, billed, category, bot_purpose, bot_name, bot_vendor, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            null,
            req.bot_ua(), req.domain(), req.ip(), req.path(),
            Boolean.TRUE.equals(req.verified()) ? 1 : 0,
            Boolean.TRUE.equals(req.billed()) ? 1 : 0,
            req.category() != null ? req.category() : "bot",
            req.bot_purpose() != null ? req.bot_purpose() : "generic",
            req.bot_name(),
            req.bot_vendor(),
            Boolean.TRUE.equals(req.blocked()) ? 1 : 0
        );
        return ResponseEntity.noContent().build();
    }

    // GET /internal/bot-catalog
    @GetMapping("/internal/bot-catalog")
    public Map<String, Object> getBotCatalog() {
        long now = System.currentTimeMillis();
        if (catalogCache != null && now - catalogAt < 30_000L) {
            return catalogCache;
        }

        var rows = jdbc.queryForList(
            "SELECT name, vendor, purpose, patterns, is_malicious FROM bot_catalog WHERE enabled = 1 ORDER BY is_malicious, purpose, name"
        );

        var bots = rows.stream()
            .filter(r -> !isMalicious(r))
            .map(r -> {
                Map<String, Object> m = new HashMap<>();
                m.put("name",     r.getOrDefault("name", ""));
                m.put("vendor",   r.getOrDefault("vendor", ""));
                m.put("purpose",  r.getOrDefault("purpose", ""));
                m.put("patterns", parsePatterns((String) r.get("patterns")));
                return m;
            })
            .toList();

        var malicious = rows.stream()
            .filter(this::isMalicious)
            .map(r -> {
                Map<String, Object> m = new HashMap<>();
                m.put("name",     r.getOrDefault("name", ""));
                m.put("vendor",   r.getOrDefault("vendor", ""));
                m.put("patterns", parsePatterns((String) r.get("patterns")));
                return m;
            })
            .toList();

        Map<String, Object> cache = new HashMap<>();
        cache.put("version",  now);
        cache.put("bots",     bots);
        cache.put("malicious", malicious);

        catalogCache = cache;
        catalogAt    = now;
        return cache;
    }

    // GET /internal/bypass
    @GetMapping("/internal/bypass")
    public Map<String, Object> getBypass() {
        var rows = jdbc.queryForList(
            "SELECT value FROM settings WHERE key = 'bypass_mode'"
        );
        boolean bypass = !rows.isEmpty() && "1".equals(rows.get(0).get("value"));
        return Map.of("bypass", bypass);
    }

    // ── 헬퍼 ──────────────────────────────────────────────────
    private boolean isMalicious(Map<String, Object> r) {
        Object v = r.get("is_malicious");
        if (v instanceof Integer i) return i == 1;
        if (v instanceof Boolean b) return b;
        return false;
    }

    private List<String> parsePatterns(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }
}
