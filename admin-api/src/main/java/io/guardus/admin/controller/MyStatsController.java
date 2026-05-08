package io.guardus.admin.controller;

import io.guardus.admin.service.SessionService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * /me/stats/* — 채널 오너 본인 채널로 자동 필터된 통계
 * /me/logs    — 본인 채널 트래픽 로그
 *
 * 모든 엔드포인트는 owner_id = 로그인 유저인 채널의 도메인만 집계.
 */
@RestController
public class MyStatsController {

    private final JdbcTemplate   db;
    private final SessionService sessions;

    public MyStatsController(JdbcTemplate db, SessionService sessions) {
        this.db       = db;
        this.sessions = sessions;
    }

    private List<String> myDomains(String auth) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return List.of();
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT domain FROM channels WHERE owner_id = ?", user.get("id"));
        List<String> domains = new ArrayList<>();
        for (Map<String, Object> r : rows) domains.add((String) r.get("domain"));
        return domains;
    }

    /** domain IN (?,?,?) 절 + 파라미터 */
    private String domainIn(List<String> domains, List<Object> params) {
        if (domains.isEmpty()) return "1=0"; // no channels → no rows
        params.addAll(domains);
        String ph = String.join(",", domains.stream().map(d -> "?").toList());
        return "domain IN (" + ph + ")";
    }

    /** GET /me/stats/category — 4-way 카운트 (malicious / bot / other_bot / user) */
    @GetMapping("/me/stats/category")
    public Map<String, Object> category(@RequestHeader("Authorization") String auth) {
        List<String> domains = myDomains(auth);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("malicious", 0L);
        result.put("bot",       0L);
        result.put("other_bot", 0L);
        result.put("user",      0L);
        if (domains.isEmpty()) return result;

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT category, COUNT(*) AS count FROM access_logs WHERE " + where + " GROUP BY category",
                params.toArray());
        for (Map<String, Object> r : rows) result.put((String) r.get("category"), r.get("count"));
        return result;
    }

    /** GET /me/stats/daily?days=30 — 일별 카테고리별 추이 */
    @GetMapping("/me/stats/daily")
    public List<Map<String, Object>> daily(
            @RequestHeader("Authorization") String auth,
            @RequestParam(defaultValue = "30") int days) {
        List<String> domains = myDomains(auth);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        int cap = Math.min(Math.max(days, 1), 90);
        return db.queryForList(
                "SELECT DATE(ts) AS date, category, COUNT(*) AS count " +
                "FROM access_logs WHERE " + where + " AND ts >= datetime('now', '-" + cap + " days') " +
                "GROUP BY date, category ORDER BY date",
                params.toArray());
    }

    /** GET /me/stats/bots?category=bot&limit=10 — 봇 이름별 TOP N */
    @GetMapping("/me/stats/bots")
    public List<Map<String, Object>> bots(
            @RequestHeader("Authorization") String auth,
            @RequestParam(defaultValue = "bot") String category,
            @RequestParam(defaultValue = "10") int limit) {
        List<String> domains = myDomains(auth);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        String catCond = "";
        if (!"all".equals(category) && !category.isBlank()) {
            catCond = " AND category = ?";
            params.add(category);
        }
        String groupCol = "bot".equals(category) || "other_bot".equals(category)
                ? "COALESCE(NULLIF(bot_name,''), bot_ua)"
                : "bot_ua";
        params.add(Math.min(limit, 50));
        return db.queryForList(
                "SELECT " + groupCol + " AS bot_ua, COUNT(*) AS count " +
                "FROM access_logs WHERE " + where + catCond +
                " GROUP BY bot_ua ORDER BY count DESC LIMIT ?",
                params.toArray());
    }

    /** GET /me/stats/purpose — purpose별 카운트 (user 제외) */
    @GetMapping("/me/stats/purpose")
    public List<Map<String, Object>> purpose(@RequestHeader("Authorization") String auth) {
        List<String> domains = myDomains(auth);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        return db.queryForList(
                "SELECT bot_purpose, COUNT(*) AS count, COUNT(DISTINCT bot_name) AS unique_bots " +
                "FROM access_logs WHERE " + where + " AND category != 'user' AND bot_purpose IS NOT NULL AND bot_purpose != '' " +
                "GROUP BY bot_purpose ORDER BY count DESC",
                params.toArray());
    }

    /** GET /me/stats/malicious — 악성 봇 차단 통계 */
    @GetMapping("/me/stats/malicious")
    public List<Map<String, Object>> malicious(@RequestHeader("Authorization") String auth) {
        List<String> domains = myDomains(auth);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        return db.queryForList(
                "SELECT bot_name, bot_vendor, COUNT(*) AS count, MAX(ts) AS last_seen " +
                "FROM access_logs WHERE " + where + " AND category = 'malicious' " +
                "GROUP BY bot_name, bot_vendor ORDER BY count DESC LIMIT 20",
                params.toArray());
    }

    /** GET /me/stats/billing — 과금 추정 */
    @GetMapping("/me/stats/billing")
    public Map<String, Object> billing(@RequestHeader("Authorization") String auth) {
        List<String> domains = myDomains(auth);
        if (domains.isEmpty()) return Map.of("total", 0, "billed", 0, "unit_price", 2, "estimated_amount", 0);

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        Map<String, Object> row;
        try {
            row = db.queryForMap(
                    "SELECT COUNT(*) AS total, SUM(CASE WHEN billed=1 THEN 1 ELSE 0 END) AS billed " +
                    "FROM access_logs WHERE " + where + " AND category='bot'",
                    params.toArray());
        } catch (Exception e) {
            row = Map.of();
        }
        long billed = toLong(row.get("billed"));
        long total  = toLong(row.get("total"));
        int unit = 2;
        return Map.of("total", total, "billed", billed, "unit_price", unit, "estimated_amount", billed * unit);
    }

    /** GET /me/logs?category=bot&limit=100 — 본인 채널 로그 */
    @GetMapping("/me/logs")
    public List<Map<String, Object>> logs(
            @RequestHeader("Authorization") String auth,
            @RequestParam(defaultValue = "bot") String category,
            @RequestParam(defaultValue = "100") int limit) {
        List<String> domains = myDomains(auth);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        String catCond = "";
        if (!"all".equals(category) && !category.isBlank()) {
            catCond = " AND category = ?";
            params.add(category);
        }
        params.add(Math.min(limit, 500));
        return db.queryForList(
                "SELECT id, bot_ua, domain, ip, path, verified, billed, category, bot_purpose, bot_name, ts " +
                "FROM access_logs WHERE " + where + catCond + " ORDER BY id DESC LIMIT ?",
                params.toArray());
    }

    private long toLong(Object v) {
        if (v instanceof Number n) return n.longValue();
        return 0L;
    }
}
