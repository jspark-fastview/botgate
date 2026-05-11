package io.guardus.admin.controller;

import io.guardus.admin.service.DnsService;
import io.guardus.admin.service.SessionService;
import io.guardus.admin.util.CacheInvalidator;
import io.guardus.admin.util.NanoId;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * /me/* — 채널 오너(로그인 사용자) 전용 라우트
 */
@RestController
public class UserController {

    private final JdbcTemplate   db;
    private final SessionService sessions;
    private final DnsService     dns;

    public UserController(JdbcTemplate db, SessionService sessions, DnsService dns) {
        this.db       = db;
        this.sessions = sessions;
        this.dns      = dns;
    }

    /** 본인 소유 채널 확인 */
    private boolean ownsChannel(String userId, String channelId) {
        Integer cnt = db.queryForObject(
                "SELECT COUNT(*) FROM channels WHERE id = ? AND owner_id = ?",
                Integer.class, channelId, userId);
        return cnt != null && cnt > 0;
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
            db.update("INSERT INTO channels (id, name, domain, domain_canonical, upstream, owner_id) VALUES (?, ?, ?, ?, ?, ?)",
                    id, name, domain, ChannelAdminController.canonicalDomain(domain), upstream, user.get("id"));
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE")) {
                return ResponseEntity.status(409).body(Map.of("error", "domain already exists"));
            }
            throw e;
        }
        return ResponseEntity.status(201).body(
                Map.of("id", id, "name", name, "domain", domain, "upstream", upstream, "active", 1));
    }

    /** PATCH /me/channels/:id — 본인 채널 수정 (active 토글, name/upstream 변경) */
    @PatchMapping("/me/channels/{id}")
    public ResponseEntity<Map<String, Object>> updateChannel(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String id,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));
        if (!ownsChannel((String) user.get("id"), id))
            return ResponseEntity.status(403).body(Map.of("error", "forbidden"));

        Map<String, Object> existing = db.queryForList("SELECT * FROM channels WHERE id = ?", id).get(0);
        String name     = body.containsKey("name")     ? (String) body.get("name")     : (String) existing.get("name");
        String upstream = body.containsKey("upstream") ? (String) body.get("upstream") : (String) existing.get("upstream");
        int active;
        if (body.containsKey("active")) {
            Object v = body.get("active");
            active = (Boolean.TRUE.equals(v) || "true".equals(v.toString()) || "1".equals(v.toString())) ? 1 : 0;
        } else {
            active = ((Number) existing.get("active")).intValue();
        }
        db.update("UPDATE channels SET name = ?, upstream = ?, active = ? WHERE id = ?",
                name, upstream, active, id);
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** DELETE /me/channels/:id — 본인 채널 삭제 */
    @DeleteMapping("/me/channels/{id}")
    public ResponseEntity<Map<String, Object>> deleteChannel(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String id) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));
        if (!ownsChannel((String) user.get("id"), id))
            return ResponseEntity.status(403).body(Map.of("error", "forbidden"));

        db.update("DELETE FROM channels WHERE id = ?", id);
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** GET /me/channels/:id/dns-check — 본인 채널 DNS 확인 */
    @GetMapping("/me/channels/{id}/dns-check")
    public ResponseEntity<Map<String, Object>> dnsCheck(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String id) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));
        if (!ownsChannel((String) user.get("id"), id))
            return ResponseEntity.status(403).body(Map.of("error", "forbidden"));

        Map<String, Object> ch = db.queryForList("SELECT * FROM channels WHERE id = ?", id).get(0);
        Map<String, Object> result = new LinkedHashMap<>(dns.checkDns((String) ch.get("domain")));
        result.put("id", id);
        return ResponseEntity.ok(result);
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

    /** POST /me/tokens — 본인 토큰 발급 */
    @PostMapping("/me/tokens")
    public ResponseEntity<Map<String, Object>> issueToken(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));

        String owner = body.containsKey("owner") ? (String) body.get("owner") : (String) user.get("name");
        String plan  = body.containsKey("plan")  ? (String) body.get("plan")  : "default";
        String token = "tk_" + NanoId.generate(24);
        String id    = "to_" + NanoId.generate(8);
        db.update("INSERT INTO tokens (id, token, owner, plan, active, user_id) VALUES (?, ?, ?, ?, 1, ?)",
                id, token, owner, plan, user.get("id"));
        return ResponseEntity.status(201).body(Map.of(
                "id", id, "token", token, "owner", owner, "plan", plan, "active", 1));
    }

    /** DELETE /me/tokens/:id — 본인 토큰 폐기 */
    @DeleteMapping("/me/tokens/{id}")
    public ResponseEntity<Map<String, Object>> revokeToken(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String id) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));

        Integer cnt = db.queryForObject(
                "SELECT COUNT(*) FROM tokens WHERE id = ? AND user_id = ?",
                Integer.class, id, user.get("id"));
        if (cnt == null || cnt == 0)
            return ResponseEntity.status(403).body(Map.of("error", "forbidden"));

        db.update("DELETE FROM tokens WHERE id = ?", id);
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** POST /me/cache-purge — 사용자 브라우저 캐시 강제 청소 모드 1시간 ON
     *  (OpenResty 가 Clear-Site-Data 헤더 부착) */
    @PostMapping("/me/cache-purge")
    public ResponseEntity<Map<String, Object>> cachePurge(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));

        long expiresAt = (System.currentTimeMillis() / 1000) + 3600;
        db.update("""
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """, "cache_purge_expires_at", String.valueOf(expiresAt));
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true, "expires_at", expiresAt));
    }

    /** GET /me/cache-purge — 현재 상태 (남은 시간) */
    @GetMapping("/me/cache-purge")
    public ResponseEntity<Map<String, Object>> cachePurgeStatus(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        if (sessions.validate(auth) == null) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        try {
            Map<String, Object> row = db.queryForMap(
                    "SELECT value FROM settings WHERE key = ?", "cache_purge_expires_at");
            long exp = Long.parseLong(row.get("value").toString());
            long now = System.currentTimeMillis() / 1000;
            return ResponseEntity.ok(Map.of(
                    "active", exp > now,
                    "expires_at", exp,
                    "remaining_sec", Math.max(0, exp - now)));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("active", false, "expires_at", 0, "remaining_sec", 0));
        }
    }

    /** GET /me/bot-catalog — /admin/bots/catalog 와 동일 형식 (delegate) */
    @org.springframework.beans.factory.annotation.Autowired
    private BotAdminController botCtrl;

    @GetMapping("/me/bot-catalog")
    public ResponseEntity<Object> botCatalog(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        if (sessions.validate(auth) == null) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        return ResponseEntity.ok(botCtrl.catalog());
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
