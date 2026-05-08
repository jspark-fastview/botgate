package io.guardus.admin.controller;

import io.guardus.admin.service.SessionService;
import io.guardus.admin.util.NanoId;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * /me/* — 채널 오너(로그인 사용자) 전용 라우트
 */
@RestController
public class UserController {

    private final JdbcTemplate   db;
    private final SessionService sessions;

    public UserController(JdbcTemplate db, SessionService sessions) {
        this.db       = db;
        this.sessions = sessions;
    }

    /** GET /me/dashboard */
    @GetMapping("/me/dashboard")
    public Map<String, Object> dashboard(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return Map.of("channels", List.of(), "stats", List.of());

        List<Map<String, Object>> channels = db.queryForList(
                "SELECT id, name, domain, upstream, active, created_at" +
                " FROM channels WHERE owner_id = ? ORDER BY created_at", user.get("id"));
        if (channels.isEmpty()) return Map.of("channels", List.of(), "stats", List.of(), "purposes", List.of());

        String ph = String.join(",", channels.stream().map(c2 -> "?").toList());
        Object[] domains = channels.stream().map(c -> c.get("domain")).toArray();

        List<Map<String, Object>> stats = db.queryForList(
                "SELECT domain, COUNT(*) AS total," +
                " SUM(CASE WHEN verified=1 THEN 1 ELSE 0 END) AS verified," +
                " SUM(CASE WHEN blocked=1 THEN 1 ELSE 0 END) AS blocked," +
                " COUNT(DISTINCT bot_ua) AS bot_types" +
                " FROM access_logs WHERE domain IN (" + ph + ") GROUP BY domain", domains);

        List<Map<String, Object>> purposes = db.queryForList(
                "SELECT bot_purpose, COUNT(*) AS total" +
                " FROM access_logs WHERE domain IN (" + ph + ")" +
                " AND bot_purpose IS NOT NULL AND bot_purpose != ''" +
                " GROUP BY bot_purpose ORDER BY total DESC", domains);

        return Map.of("channels", channels, "stats", stats, "purposes", purposes);
    }

    /** GET /me/channels */
    @GetMapping("/me/channels")
    public List<Map<String, Object>> myChannels(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return List.of();
        return db.queryForList(
                "SELECT id, name, domain, upstream, active, created_at" +
                " FROM channels WHERE owner_id = ? ORDER BY created_at DESC", user.get("id"));
    }

    /** POST /me/channels */
    @PostMapping("/me/channels")
    public ResponseEntity<Map<String, Object>> createChannel(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));

        String name     = (String) body.get("name");
        String domain   = (String) body.get("domain");
        String upstream = (String) body.get("upstream");
        if (name == null || domain == null || upstream == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "name, domain, upstream 필수"));
        }
        String id = "ch_" + NanoId.generate(8);
        try {
            db.update("INSERT INTO channels (id, name, domain, upstream, owner_id) VALUES (?, ?, ?, ?, ?)",
                    id, name, domain, upstream, user.get("id"));
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE")) {
                return ResponseEntity.status(409).body(Map.of("error", "domain already exists"));
            }
            throw e;
        }
        return ResponseEntity.status(201).body(
                Map.of("id", id, "name", name, "domain", domain, "upstream", upstream, "active", 1));
    }

    /** GET /me/tokens */
    @GetMapping("/me/tokens")
    public List<Map<String, Object>> myTokens(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return List.of();
        return db.queryForList(
                "SELECT id, token, owner, plan, active, created_at, expires_at" +
                " FROM tokens WHERE user_id = ? ORDER BY created_at DESC", user.get("id"));
    }

    /** GET /me/profile */
    @GetMapping("/me/profile")
    public ResponseEntity<Map<String, Object>> profile(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));
        return ResponseEntity.ok(Map.of("id", user.get("id"), "email", user.get("email"), "name", user.get("name")));
    }
}
