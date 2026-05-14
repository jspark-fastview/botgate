package io.guardus.admin.controller;

import io.guardus.admin.service.BotClassifierService;
import io.guardus.admin.service.BotClassifierService.Classification;
import io.guardus.admin.util.SiteKeys;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * /v1/verify — 외부 통합 (CF Worker / nginx auth_request / Node SDK 등) 의 진입점.
 *
 * 인증: X-Site-Key 헤더의 평문 site_key 를 SHA-256 해시해서 channels.site_key_hash 와 비교.
 * 흐름:
 *   1. site_key → 채널 lookup (verified_at IS NOT NULL AND integration_mode='external')
 *   2. UA 분류 (BotClassifierService)
 *   3. purpose_policies + path_rules 적용 → action
 *   4. token (선택) 검증
 *   5. access_logs 기록
 *   6. action 응답
 *
 * 한계 (MVP, v2 에서 보완):
 *   - IP 범위 검증 / rDNS 안 함 — OpenResty 의 bot_ip_verifier 미포팅. policy=verify 는 token 으로 fallback.
 *   - 가격 (cost_per_request) 응답 안 함 — 추후 per-site/per-bot pricing 도입 시 추가.
 */
@RestController
public class VerifyController {

    private final JdbcTemplate           db;
    private final BotClassifierService   classifier;

    public VerifyController(JdbcTemplate db, BotClassifierService classifier) {
        this.db         = db;
        this.classifier = classifier;
    }

    @PostMapping("/v1/verify")
    public ResponseEntity<Map<String, Object>> verify(
            @RequestHeader(value = "X-Site-Key", required = false) String siteKey,
            @RequestBody(required = false) Map<String, Object> body) {

        if (siteKey == null || siteKey.isBlank()) {
            return error(401, "X-Site-Key required");
        }

        // ── 1. site_key → 채널 lookup ────────────────────────────────────
        String hash = SiteKeys.hash(siteKey);
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT id, domain FROM channels " +
                "WHERE site_key_hash = ? AND active = 1 " +
                "  AND integration_mode = 'external' " +
                "  AND verified_at IS NOT NULL",
                hash);
        if (rows.isEmpty()) {
            return error(401, "invalid site_key");
        }
        String siteId = (String) rows.get(0).get("id");
        String domain = (String) rows.get(0).get("domain");

        // ── 2. body parse ────────────────────────────────────────────────
        Map<String, Object> b = body != null ? body : Map.of();
        String ua    = str(b.get("ua"));
        String ip    = str(b.get("ip"));
        String path  = str(b.get("path"));
        String token = str(b.get("token"));

        // ── 3. 분류 ───────────────────────────────────────────────────────
        Classification cls = classifier.classify(ua);

        // ── 4. action 결정 ────────────────────────────────────────────────
        String action;
        boolean blocked = false;
        boolean verified = false;
        boolean billed = false;
        String validatedToken = null;

        if ("malicious".equals(cls.category())) {
            action  = "block";
            blocked = true;
        } else if ("user".equals(cls.category())) {
            action = "pass";
        } else {
            // bot or other_bot — purpose_policy 적용
            String policy = lookupPolicy(cls.purpose());

            // path_rule (block) 이 정책보다 우선
            String pathRule = lookupPathRule(path);
            if ("block".equals(pathRule)) {
                action  = "block";
                blocked = true;
            } else {
                billed = "meter".equals(pathRule) || "meter".equals(policy);
                switch (policy) {
                    case "pass", "meter" -> { action = billed ? "meter" : "pass"; verified = true; }
                    case "block"         -> { action = "block"; blocked = true; }
                    case "gone"          -> { action = "gone";  blocked = true; }
                    case "token_only", "verify" -> {
                        // 토큰 필수 (MVP: verify 도 IP/rDNS 검증 없이 token 으로 fallback)
                        if (token == null || token.isBlank()) {
                            action  = "token_required";
                            blocked = true;
                        } else if (validateToken(token)) {
                            action         = billed ? "meter" : "pass";
                            verified       = true;
                            validatedToken = token;
                        } else {
                            action  = "token_invalid";
                            blocked = true;
                        }
                    }
                    default -> { action = "pass"; }   // 알 수 없는 정책 — 안전 fallback
                }
            }
        }

        // ── 5. access_logs 기록 ──────────────────────────────────────────
        // Long txId 로 보고 (autoincrement)
        Long txId = null;
        try {
            db.update(
                "INSERT INTO access_logs " +
                "(token, bot_ua, domain, ip, path, verified, billed, category, bot_purpose, bot_name, bot_vendor, blocked) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                validatedToken,
                ua != null ? ua : "",
                domain,            // channel.domain (site_key 가 매핑된 도메인)
                ip != null ? ip : "",
                path,
                verified ? 1 : 0,
                billed ? 1 : 0,
                cls.category(),
                cls.purpose(),
                cls.name(),
                cls.vendor(),
                blocked ? 1 : 0
            );
            txId = db.queryForObject("SELECT last_insert_rowid()", Long.class);
        } catch (Exception e) {
            // 로깅 실패는 검증 결과 자체엔 영향 X — 클라이언트에 정상 응답
        }

        // ── 6. 응답 ──────────────────────────────────────────────────────
        Map<String, Object> bot = "user".equals(cls.category())
                ? null
                : Map.of(
                    "name",     cls.name(),
                    "vendor",   cls.vendor(),
                    "purpose",  cls.purpose(),
                    "category", cls.category(),
                    "verified", verified
                );

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("action",  action);
        res.put("site_id", siteId);
        res.put("bot",     bot);
        res.put("tx_id",   txId);
        return ResponseEntity.ok(res);
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────

    private String lookupPolicy(String purpose) {
        try {
            return db.queryForObject(
                "SELECT action FROM purpose_policies WHERE purpose = ?",
                String.class, purpose);
        } catch (Exception e) {
            return "pass";
        }
    }

    /**
     * path_rules 중 첫 매칭 반환. 매칭 = path 가 pattern 으로 시작 (substring prefix).
     * MVP — 정교한 glob/regex 는 v2.
     */
    private String lookupPathRule(String path) {
        if (path == null || path.isBlank()) return null;
        List<Map<String, Object>> rules = db.queryForList(
            "SELECT pattern, action FROM path_rules WHERE active = 1");
        for (Map<String, Object> r : rules) {
            String pattern = (String) r.get("pattern");
            if (pattern != null && !pattern.isBlank() && path.startsWith(pattern)) {
                return (String) r.get("action");
            }
        }
        return null;
    }

    private boolean validateToken(String token) {
        try {
            Integer cnt = db.queryForObject(
                "SELECT COUNT(*) FROM tokens " +
                "WHERE token = ? AND active = 1 " +
                "  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)",
                Integer.class, token);
            return cnt != null && cnt > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private static String str(Object o) { return o != null ? o.toString() : null; }

    private static ResponseEntity<Map<String, Object>> error(int status, String msg) {
        return ResponseEntity.status(status).body(Map.of("error", msg));
    }
}
