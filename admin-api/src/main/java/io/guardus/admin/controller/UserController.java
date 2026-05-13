package io.guardus.admin.controller;

import io.guardus.admin.service.DnsService;
import io.guardus.admin.service.SessionService;
import io.guardus.admin.service.SiteVerificationService;
import io.guardus.admin.util.CacheInvalidator;
import io.guardus.admin.util.NanoId;
import io.guardus.admin.util.SiteKeys;
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

    private final JdbcTemplate            db;
    private final SessionService          sessions;
    private final DnsService              dns;
    private final SiteVerificationService siteVerify;

    public UserController(JdbcTemplate db, SessionService sessions,
                          DnsService dns, SiteVerificationService siteVerify) {
        this.db         = db;
        this.sessions   = sessions;
        this.dns        = dns;
        this.siteVerify = siteVerify;
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
        // site_key_hash 자체는 노출 X (보안). 발급 여부만 has_site_key 로 표현.
        return db.queryForList(
                "SELECT id, name, domain, upstream, active, created_at," +
                "       integration_mode, verified_at, verification_method," +
                "       (site_key_hash IS NOT NULL) AS has_site_key" +
                " FROM channels WHERE owner_id = ? ORDER BY created_at DESC", user.get("id"));
    }

    /**
     * POST /me/channels — 신규 고객 채널 생성.
     *
     * 항상 external 모드. 퍼블리셔는 자기 server/edge 에 우리 site_key 박고
     * /v1/verify 를 호출해서 봇 검증/과금. 우리는 데이터 경로 밖.
     *
     * reverse_proxy 모드는 우리 자체 플랫폼 (viewus/pikle/pure-beef 등) 전용 — /admin/channels 로만 생성.
     */
    @PostMapping("/me/channels")
    public ResponseEntity<Map<String, Object>> createChannel(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));

        String name   = (String) body.get("name");
        String domain = (String) body.get("domain");
        if (name == null || domain == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "name, domain 필수"));
        }

        String id          = "ch_" + NanoId.generate(8);
        String verifyToken = NanoId.generate(32);

        try {
            db.update("INSERT INTO channels " +
                      "(id, name, domain, domain_canonical, upstream, owner_id, verify_token, integration_mode) " +
                      "VALUES (?, ?, ?, ?, '', ?, ?, 'external')",
                    id, name, domain,
                    ChannelAdminController.canonicalDomain(domain),
                    user.get("id"),
                    verifyToken);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE")) {
                return ResponseEntity.status(409).body(Map.of("error", "domain already exists"));
            }
            throw e;
        }

        // 검증 가이드 함께 반환 — 다음 단계 (verify → site-key) 안내
        Map<String, Object> instructions = Map.of(
                "verify_token", verifyToken,
                "dns_txt", Map.of(
                        "name",  "_guardus-verify." + domain,
                        "type",  "TXT",
                        "value", verifyToken),
                "well_known", Map.of(
                        "url",  "https://" + domain + "/.well-known/guardus-verify.txt",
                        "body", verifyToken)
        );

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("id", id);
        res.put("name", name);
        res.put("domain", domain);
        res.put("active", 1);
        res.put("integration_mode", "external");
        res.put("verified_at", null);
        res.put("verification", instructions);
        res.put("next_steps", List.of(
                "1) DNS TXT 또는 well-known 으로 verify_token 노출",
                "2) POST /me/channels/" + id + "/verify",
                "3) POST /me/channels/" + id + "/site-key — site_key 발급",
                "4) Worker/nginx/SDK 에 site_key 박고 /v1/verify 호출"));
        return ResponseEntity.status(201).body(res);
    }

    /** POST /me/channels/:id/verify — 도메인 소유 검증 트리거 */
    @PostMapping("/me/channels/{id}/verify")
    public ResponseEntity<Map<String, Object>> verifyOwnership(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String id) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));
        if (!ownsChannel((String) user.get("id"), id))
            return ResponseEntity.status(403).body(Map.of("error", "forbidden"));

        Map<String, Object> ch = db.queryForList("SELECT * FROM channels WHERE id = ?", id).get(0);
        String domain      = (String) ch.get("domain");
        String verifyToken = (String) ch.get("verify_token");
        if (verifyToken == null || verifyToken.isBlank()) {
            return ResponseEntity.status(400).body(Map.of("error", "verify_token missing — 채널 재생성 필요"));
        }

        Map<String, Object> result = siteVerify.verify(domain, verifyToken);
        if (Boolean.TRUE.equals(result.get("verified"))) {
            db.update(
                "UPDATE channels SET verified_at = datetime('now'), verification_method = ? WHERE id = ?",
                result.get("method"), id);
            CacheInvalidator.invalidate();
        }
        return ResponseEntity.ok(result);
    }

    /**
     * POST /me/channels/:id/site-key
     * 처음 1회 또는 rotation. 평문은 응답에만, DB 엔 hash 만 저장.
     */
    @PostMapping("/me/channels/{id}/site-key")
    public ResponseEntity<Map<String, Object>> createSiteKey(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @PathVariable String id) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));
        if (!ownsChannel((String) user.get("id"), id))
            return ResponseEntity.status(403).body(Map.of("error", "forbidden"));

        Map<String, Object> ch = db.queryForList("SELECT verified_at FROM channels WHERE id = ?", id).get(0);
        if (ch.get("verified_at") == null) {
            return ResponseEntity.status(412).body(Map.of(
                    "error", "도메인 소유 검증 먼저 통과해야 함 — POST /me/channels/" + id + "/verify"));
        }

        String key  = SiteKeys.generate();
        String hash = SiteKeys.hash(key);
        db.update("UPDATE channels SET site_key_hash = ? WHERE id = ?", hash, id);

        // 평문은 이번 한 번만 노출
        return ResponseEntity.status(201).body(Map.of(
                "site_key", key,
                "warning", "이 키는 다시 보여주지 않습니다. 안전한 곳에 저장하세요."));
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

    /** DELETE /me/cache-purge — 즉시 종료 (남은 시간 0으로) */
    @DeleteMapping("/me/cache-purge")
    public ResponseEntity<Map<String, Object>> cachePurgeCancel(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        if (sessions.validate(auth) == null) return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
        db.update("""
                INSERT INTO settings (key, value) VALUES (?, '0')
                ON CONFLICT(key) DO UPDATE SET value = '0'
                """, "cache_purge_expires_at");
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true, "active", false));
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
