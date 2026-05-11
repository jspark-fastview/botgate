package io.guardus.admin.controller;

import io.guardus.admin.service.SessionService;
import org.springframework.cache.annotation.Cacheable;
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

    /** 채널 selector 적용: filter가 user 소유 도메인에 포함되면 그것만, 아니면 전체 */
    private List<String> filterDomains(List<String> myDomains, String filter) {
        if (filter == null || filter.isBlank() || "all".equals(filter)) return myDomains;
        if (myDomains.contains(filter)) return List.of(filter);
        // apex/www 자동 매칭
        for (String d : myDomains) {
            if (filter.equals("www." + d) || ("www." + filter).equals(d)) return List.of(filter);
        }
        return List.of(); // 본인 채널 아님 → empty
    }

    /** domain IN (?,?,?) 절 + 파라미터 */
    private String domainIn(List<String> domains, List<Object> params) {
        if (domains.isEmpty()) return "1=0"; // no channels → no rows
        params.addAll(domains);
        String ph = String.join(",", domains.stream().map(d -> "?").toList());
        return "domain IN (" + ph + ")";
    }

    /** GET /me/stats/category?domain=&hellip; */
    @Cacheable(value = "stats", key = "'cat:' + #auth + ':' + #domain")
    @GetMapping("/me/stats/category")
    public Map<String, Object> category(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain) {
        List<String> domains = filterDomains(myDomains(auth), domain);
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

    /** GET /me/stats/daily?domain=&category=bot&billed= — /admin/stats/daily 와 동일 형식 */
    @Cacheable(value = "stats", key = "'daily:' + #auth + ':' + #domain + ':' + #category + ':' + #billed")
    @GetMapping("/me/stats/daily")
    public List<Map<String, Object>> daily(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category,
            @RequestParam(required = false) String billed) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        String catCond = "";
        if (!"all".equals(category) && !category.isBlank()) {
            catCond = " AND category = ?";
            params.add(category);
        }
        String billedCond = "1".equals(billed) ? " AND billed = 1" : "";
        return db.queryForList(
                "SELECT DATE(ts) AS date, COUNT(*) AS count " +
                "FROM access_logs WHERE " + where + " AND ts >= datetime('now', '-30 days')" + catCond + billedCond +
                " GROUP BY date ORDER BY date DESC",
                params.toArray());
    }

    /** GET /me/stats/bots?domain=&category=bot&limit=10 */
    @Cacheable(value = "stats", key = "'bots:' + #auth + ':' + #domain + ':' + #category + ':' + #limit")
    @GetMapping("/me/stats/bots")
    public List<Map<String, Object>> bots(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category,
            @RequestParam(defaultValue = "10") int limit) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        String catCond = "";
        if (!"all".equals(category) && !category.isBlank()) {
            catCond = " AND category = ?";
            params.add(category);
        }
        // bot/other_bot 카테고리는 bot_name 으로 묶어야 같은 봇의 UA 변형이 한 줄로 집계됨.
        // 과거엔 GROUP BY 가 base 컬럼 `bot_ua` 를 가리켜서 같은 봇이 UA 변형마다 별도 행으로 나왔음
        // (프론트가 `name.split('/')[0]` 로 자른 뒤에야 같은 라벨 두 줄이 보이는 현상).
        String groupCol = "bot".equals(category) || "other_bot".equals(category)
                ? "COALESCE(NULLIF(bot_name,''), bot_ua)"
                : "bot_ua";
        params.add(Math.min(limit, 50));
        return db.queryForList(
                "SELECT " + groupCol + " AS bot_ua, COUNT(*) AS count " +
                "FROM access_logs WHERE " + where + catCond +
                " GROUP BY " + groupCol + " ORDER BY count DESC LIMIT ?",
                params.toArray());
    }

    /** GET /me/stats/purpose?domain= */
    @Cacheable(value = "stats", key = "'purpose:' + #auth + ':' + #domain")
    @GetMapping("/me/stats/purpose")
    public List<Map<String, Object>> purpose(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        return db.queryForList(
                "SELECT bot_purpose, COUNT(*) AS count, COUNT(DISTINCT bot_name) AS unique_bots " +
                "FROM access_logs WHERE " + where + " AND category != 'user' AND bot_purpose IS NOT NULL AND bot_purpose != '' " +
                "GROUP BY bot_purpose ORDER BY count DESC",
                params.toArray());
    }

    /** GET /me/stats/malicious?domain= */
    @Cacheable(value = "stats", key = "'mal:' + #auth + ':' + #domain")
    @GetMapping("/me/stats/malicious")
    public List<Map<String, Object>> malicious(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        return db.queryForList(
                "SELECT bot_name, bot_vendor, COUNT(*) AS count, MAX(ts) AS last_seen " +
                "FROM access_logs WHERE " + where + " AND category = 'malicious' " +
                "GROUP BY bot_name, bot_vendor ORDER BY count DESC LIMIT 20",
                params.toArray());
    }

    /** GET /me/stats/billing?domain= */
    @Cacheable(value = "stats", key = "'bill:' + #auth + ':' + #domain")
    @GetMapping("/me/stats/billing")
    public Map<String, Object> billing(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain) {
        List<String> domains = filterDomains(myDomains(auth), domain);
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

    /** GET /me/stats/daily/bots?domain=&category=bot */
    @Cacheable(value = "stats", key = "'dailybots:' + #auth + ':' + #domain + ':' + #category")
    @GetMapping("/me/stats/daily/bots")
    public List<Map<String, Object>> dailyBots(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        String catCond = "";
        if (!"all".equals(category) && !category.isBlank()) {
            catCond = " AND category = ?";
            params.add(category);
        }
        return db.queryForList(
                "SELECT DATE(ts) AS date, COALESCE(NULLIF(bot_name,''), bot_ua) AS bot_name, COUNT(*) AS count " +
                "FROM access_logs WHERE " + where + catCond +
                " AND ts >= datetime('now', '-30 days') " +
                "GROUP BY date, bot_name ORDER BY date, count DESC",
                params.toArray());
    }

    /** GET /me/stats/hourly?date=YYYY-MM-DD&domain=&category=bot */
    @Cacheable(value = "stats", key = "'hourly:' + #auth + ':' + #date + ':' + #domain + ':' + #category")
    @GetMapping("/me/stats/hourly")
    public List<Map<String, Object>> hourly(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty() || date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        params.add(date);
        String catCond = "";
        if (!"all".equals(category) && !category.isBlank()) {
            catCond = " AND category = ?";
            params.add(category);
        }
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT strftime('%H', ts) AS hour, COUNT(*) AS count " +
                "FROM access_logs WHERE " + where + " AND DATE(ts) = ?" + catCond +
                " GROUP BY hour ORDER BY hour",
                params.toArray());
        Map<String, Long> map = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) map.put((String) r.get("hour"), toLong(r.get("count")));
        List<Map<String, Object>> result = new ArrayList<>(24);
        for (int i = 0; i < 24; i++) {
            String h = String.format("%02d", i);
            result.add(Map.of("hour", h, "count", map.getOrDefault(h, 0L)));
        }
        return result;
    }

    /** GET /me/stats/pages?domain=&category=&limit=50 */
    @Cacheable(value = "stats", key = "'pages:' + #auth + ':' + #domain + ':' + #category + ':' + #limit")
    @GetMapping("/me/stats/pages")
    public List<Map<String, Object>> pages(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "50") int limit) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        String catCond = "";
        if (category != null && !"all".equals(category) && !category.isBlank()) {
            catCond = " AND category = ?";
            params.add(category);
        }
        params.add(Math.min(limit, 200));
        return db.queryForList(
                "SELECT path, COUNT(*) AS count FROM access_logs WHERE " + where + catCond +
                " GROUP BY path ORDER BY count DESC LIMIT ?",
                params.toArray());
    }

    /** GET /me/stats/pages/bots?path=&domain=&category=bot */
    @GetMapping("/me/stats/pages/bots")
    public List<Map<String, Object>> pageBots(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam String path,
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        params.add(path);
        String catCond = "";
        if (!"all".equals(category) && !category.isBlank()) {
            catCond = " AND category = ?";
            params.add(category);
        }
        return db.queryForList(
                "SELECT COALESCE(NULLIF(bot_name,''), bot_ua) AS bot_name, COUNT(*) AS count " +
                "FROM access_logs WHERE " + where + " AND path = ?" + catCond +
                " GROUP BY bot_name ORDER BY count DESC LIMIT 10",
                params.toArray());
    }

    /** GET /me/stats/bot-names?domain=&purpose= */
    @Cacheable(value = "stats", key = "'botnames:' + #auth + ':' + #domain + ':' + #purpose")
    @GetMapping("/me/stats/bot-names")
    public List<Map<String, Object>> botNames(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain,
            @RequestParam(required = false) String purpose) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty()) return List.of();

        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        String pCond = "";
        if (purpose != null && !purpose.isBlank()) {
            pCond = " AND bot_purpose = ?";
            params.add(purpose);
        }
        return db.queryForList(
                "SELECT bot_name, bot_purpose, COUNT(*) AS count " +
                "FROM access_logs WHERE " + where + " AND category != 'user' AND bot_name IS NOT NULL AND bot_name != ''" + pCond +
                " GROUP BY bot_name ORDER BY count DESC",
                params.toArray());
    }

    /** GET /me/stats/channels — 본인 채널들의 누적 통계 */
    @Cacheable(value = "stats", key = "'chstats:' + #auth")
    @GetMapping("/me/stats/channels")
    public List<Map<String, Object>> statsByChannel(@RequestHeader(value = "Authorization", required = false) String auth) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return List.of();
        return db.queryForList("""
                SELECT
                  c.id, c.name, c.domain, c.upstream, c.active,
                  SUM(CASE WHEN l.category = 'bot'       THEN 1 ELSE 0 END) AS bot_total,
                  SUM(CASE WHEN l.category = 'other_bot' THEN 1 ELSE 0 END) AS other_bot_total,
                  SUM(CASE WHEN l.category = 'user'      THEN 1 ELSE 0 END) AS user_total,
                  SUM(CASE WHEN l.category = 'malicious' THEN 1 ELSE 0 END) AS malicious_total,
                  SUM(CASE WHEN l.category = 'bot' AND l.verified = 1                THEN 1 ELSE 0 END) AS verified,
                  SUM(CASE WHEN l.category = 'bot' AND l.verified = 0 AND l.blocked = 0 THEN 1 ELSE 0 END) AS lenient_pass,
                  SUM(CASE WHEN l.category = 'bot' AND l.blocked  = 1                THEN 1 ELSE 0 END) AS blocked,
                  COUNT(DISTINCT CASE WHEN l.category = 'bot' THEN l.bot_name END) AS bot_types
                FROM channels c
                LEFT JOIN access_logs l ON l.domain_canonical = c.domain_canonical
                WHERE c.owner_id = ?
                GROUP BY c.id
                ORDER BY (bot_total + other_bot_total + user_total) DESC
                """, user.get("id"));
    }

    /** GET /me/stats/domains — 본인 채널 도메인별 카운트 */
    @Cacheable(value = "stats", key = "'doms:' + #auth")
    @GetMapping("/me/stats/domains")
    public List<Map<String, Object>> statsDomains(@RequestHeader(value = "Authorization", required = false) String auth) {
        List<String> domains = myDomains(auth);
        if (domains.isEmpty()) return List.of();
        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        return db.queryForList(
                "SELECT domain, COUNT(*) AS count FROM access_logs WHERE " + where +
                " GROUP BY domain ORDER BY count DESC",
                params.toArray());
    }

    /** GET /me/channels/dns-status — 본인 채널들 DNS 일괄 확인 */
    @GetMapping("/me/channels/dns-status")
    public List<Map<String, Object>> dnsStatusAll(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @org.springframework.beans.factory.annotation.Autowired io.guardus.admin.service.DnsService dnsService) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return List.of();
        List<Map<String, Object>> chs = db.queryForList(
                "SELECT id, name, domain FROM channels WHERE owner_id = ?", user.get("id"));
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> c : chs) {
            Map<String, Object> r = new LinkedHashMap<>(dnsService.checkDns((String) c.get("domain")));
            r.put("id", c.get("id"));
            result.add(r);
        }
        return result;
    }

    /** GET /me/logs/export?period=day|week|month&domain=&category= */
    @GetMapping("/me/logs/export")
    public List<Map<String, Object>> exportLogs(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(defaultValue = "day") String period,
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "all") String category) {
        List<String> domains = filterDomains(myDomains(auth), domain);
        if (domains.isEmpty()) return List.of();

        String interval = switch (period) {
            case "week"  -> "-7 days";
            case "month" -> "-30 days";
            default      -> "-1 days";
        };
        List<Object> params = new ArrayList<>();
        String where = domainIn(domains, params);
        String catCond = "";
        if (!"all".equals(category) && !category.isBlank()) {
            catCond = " AND category = ?";
            params.add(category);
        }
        return db.queryForList(
                "SELECT id, bot_ua, domain, ip, path, verified, billed, category, bot_purpose, bot_name, bot_vendor, blocked, ts " +
                "FROM access_logs WHERE " + where + catCond +
                " AND ts >= datetime('now', '" + interval + "') ORDER BY id DESC LIMIT 100000",
                params.toArray());
    }

    /** GET /me/logs?domain=&category=bot&limit=100 */
    @GetMapping("/me/logs")
    public List<Map<String, Object>> logs(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category,
            @RequestParam(defaultValue = "100") int limit) {
        List<String> domains = filterDomains(myDomains(auth), domain);
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

    // ── 경로 규칙 (path-rules) — 글로벌 ────────────────────────────

    /** GET /me/path-rules */
    @GetMapping("/me/path-rules")
    public List<Map<String, Object>> listRules(@RequestHeader(value = "Authorization", required = false) String auth) {
        if (sessions.validate(auth) == null) return List.of();
        return db.queryForList(
                "SELECT id, pattern, action, note, active, created_at FROM path_rules ORDER BY created_at ASC");
    }

    /** POST /me/path-rules */
    @PostMapping("/me/path-rules")
    public Map<String, Object> createRule(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody Map<String, Object> body) {
        if (sessions.validate(auth) == null) return Map.of("error", "unauthorized");
        String pattern = (String) body.get("pattern");
        String action  = (String) body.get("action");
        if (pattern == null || pattern.isBlank() || action == null) return Map.of("error", "pattern, action 필수");
        String note = body.getOrDefault("note", "").toString();
        String id = "pr_" + io.guardus.admin.util.NanoId.generate(8);
        try {
            db.update("INSERT INTO path_rules (id, pattern, action, note) VALUES (?, ?, ?, ?)",
                    id, pattern, action, note);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE"))
                return Map.of("error", "이미 존재하는 패턴입니다");
            throw e;
        }
        io.guardus.admin.util.CacheInvalidator.invalidate();
        return Map.of("id", id, "pattern", pattern, "action", action, "note", note, "active", 1);
    }

    /** PATCH /me/path-rules/:id (active 토글, action 변경) */
    @PatchMapping("/me/path-rules/{id}")
    public Map<String, Object> updateRule(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @org.springframework.web.bind.annotation.PathVariable String id,
            @RequestBody Map<String, Object> body) {
        if (sessions.validate(auth) == null) return Map.of("error", "unauthorized");
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM path_rules WHERE id = ?", id);
        if (rows.isEmpty()) return Map.of("error", "not found");
        Map<String, Object> existing = rows.get(0);
        String action = body.containsKey("action") ? (String) body.get("action") : (String) existing.get("action");
        String note   = body.containsKey("note")   ? body.get("note").toString()  : (String) existing.get("note");
        int active;
        if (body.containsKey("active")) {
            Object v = body.get("active");
            active = (Boolean.TRUE.equals(v) || "true".equals(v.toString()) || "1".equals(v.toString())) ? 1 : 0;
        } else {
            active = ((Number) existing.get("active")).intValue();
        }
        db.update("UPDATE path_rules SET action = ?, note = ?, active = ? WHERE id = ?", action, note, active, id);
        io.guardus.admin.util.CacheInvalidator.invalidate();
        return Map.of("ok", true);
    }

    /** DELETE /me/path-rules/:id */
    @DeleteMapping("/me/path-rules/{id}")
    public Map<String, Object> deleteRule(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @org.springframework.web.bind.annotation.PathVariable String id) {
        if (sessions.validate(auth) == null) return Map.of("error", "unauthorized");
        int n = db.update("DELETE FROM path_rules WHERE id = ?", id);
        if (n == 0) return Map.of("error", "not found");
        io.guardus.admin.util.CacheInvalidator.invalidate();
        return Map.of("ok", true);
    }

    // ── 봇 정책 (purpose policies) — 글로벌 ─────────────────────────

    /** GET /me/purpose-policies */
    @GetMapping("/me/purpose-policies")
    public Map<String, Object> listPolicies(@RequestHeader(value = "Authorization", required = false) String auth) {
        if (sessions.validate(auth) == null) return Map.of();
        List<Map<String, Object>> rows = db.queryForList("SELECT purpose, action FROM purpose_policies");
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) result.put((String) r.get("purpose"), r.get("action"));
        return result;
    }

    /** PATCH /me/purpose-policies/:purpose */
    @PatchMapping("/me/purpose-policies/{purpose}")
    public Map<String, Object> updatePolicy(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @org.springframework.web.bind.annotation.PathVariable String purpose,
            @RequestBody Map<String, Object> body) {
        if (sessions.validate(auth) == null) return Map.of("error", "unauthorized");
        String action = (String) body.get("action");
        if (action == null) return Map.of("error", "action 필수");
        db.update("""
                INSERT INTO purpose_policies (purpose, action) VALUES (?, ?)
                ON CONFLICT(purpose) DO UPDATE SET action = excluded.action
                """, purpose, action);
        io.guardus.admin.util.CacheInvalidator.invalidate();
        return Map.of("ok", true, "purpose", purpose, "action", action);
    }

    private long toLong(Object v) {
        if (v instanceof Number n) return n.longValue();
        return 0L;
    }
}
