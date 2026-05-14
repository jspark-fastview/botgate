package io.guardus.admin.controller;

import io.guardus.admin.service.LokiStatsService;
import io.guardus.admin.util.DomainCondition;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * /admin/stats/* — KPI endpoints (excluding summary and operator-view which are in SummaryController)
 *
 * Loki 활성 (K8s) 환경에서는 LokiStatsService 위임.
 * SQLite (EC2) 환경에서는 기존 SQL 그대로.
 */
@RestController
public class StatsController {

    private final JdbcTemplate     db;
    private final LokiStatsService lokiStats;

    public StatsController(JdbcTemplate db, LokiStatsService lokiStats) {
        this.db        = db;
        this.lokiStats = lokiStats;
    }

    /** domain 파라미터 → Loki 멀티 selector 입력. null=전체 */
    private static List<String> domList(String domain) {
        if (domain == null || domain.isBlank() || "all".equals(domain)) return null;
        return List.of(domain);
    }

    // ── billing ──────────────────────────────────────────────────────────────

    /** GET /admin/stats/billing?domain= */
    @GetMapping("/admin/stats/billing")
    public Map<String, Object> billing(@RequestParam(required = false) String domain) {
        if (lokiStats.isEnabled()) return lokiStats.billing(domList(domain));
        DomainCondition dc = DomainCondition.of(domain);
        List<String> conds  = new ArrayList<>(List.of("category = 'bot'"));
        List<Object> params = new ArrayList<>();
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }
        String where = "WHERE " + String.join(" AND ", conds);

        Map<String, Object> row = queryMapOrEmpty(
                "SELECT COUNT(*) AS total, SUM(CASE WHEN billed = 1 THEN 1 ELSE 0 END) AS billed " +
                "FROM access_logs " + where, params.toArray());
        long billed = toLong(row.get("billed"));
        long total  = toLong(row.get("total"));
        int  unit   = 2;
        return Map.of("total", total, "billed", billed, "unit_price", unit,
                "estimated_amount", billed * unit);
    }

    // ── bots (UA stats) ──────────────────────────────────────────────────────

    /** GET /admin/stats/bots?domain=&category=bot */
    @GetMapping("/admin/stats/bots")
    public List<Map<String, Object>> statsBots(
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category) {
        if (lokiStats.isEnabled()) return lokiStats.bots(domList(domain), category, 50);

        List<String> conds  = new ArrayList<>();
        List<Object> params = new ArrayList<>();
        if (!"all".equals(category) && !category.isBlank()) { conds.add("category = ?"); params.add(category); }
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }

        boolean useBotName = "bot".equals(category) || "other_bot".equals(category);
        String groupCol = useBotName ? "COALESCE(NULLIF(bot_name,''), bot_ua)" : "bot_ua";
        if (useBotName) conds.add("bot_name IS NOT NULL AND bot_name != ''");

        String where = conds.isEmpty() ? "" : "WHERE " + String.join(" AND ", conds);
        return db.queryForList(
                "SELECT " + groupCol + " AS bot_ua, COUNT(*) AS count " +
                "FROM access_logs " + where +
                " GROUP BY " + groupCol + " ORDER BY count DESC",
                params.toArray());
    }

    // ── domains ──────────────────────────────────────────────────────────────

    /** GET /admin/stats/domains */
    @GetMapping("/admin/stats/domains")
    public List<Map<String, Object>> statsDomains() {
        if (lokiStats.isEnabled()) return lokiStats.statsDomains(null);
        return db.queryForList(
                "SELECT domain, COUNT(*) AS count FROM access_logs GROUP BY domain ORDER BY count DESC");
    }

    // ── daily ────────────────────────────────────────────────────────────────

    /** GET /admin/stats/daily?domain=&category=bot&billed= */
    @GetMapping("/admin/stats/daily")
    public List<Map<String, Object>> statsDaily(
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category,
            @RequestParam(required = false) String billed) {
        if (lokiStats.isEnabled()) return lokiStats.daily(domList(domain), category, billed);

        List<String> conds  = new ArrayList<>(List.of("ts >= datetime('now', '-30 days')"));
        List<Object> params = new ArrayList<>();
        if (!"all".equals(category) && !category.isBlank()) { conds.add("category = ?"); params.add(category); }
        if ("1".equals(billed)) conds.add("billed = 1");
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }

        String where = "WHERE " + String.join(" AND ", conds);
        return db.queryForList(
                "SELECT DATE(ts) AS date, COUNT(*) AS count FROM access_logs " + where +
                " GROUP BY date ORDER BY date DESC", params.toArray());
    }

    /** GET /admin/stats/daily/bots?domain=&category=bot */
    @GetMapping("/admin/stats/daily/bots")
    public List<Map<String, Object>> statsDailyBots(
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category) {
        if (lokiStats.isEnabled()) return lokiStats.dailyBots(domList(domain), category);

        List<String> conds  = new ArrayList<>(List.of("ts >= datetime('now', '-30 days')"));
        List<Object> params = new ArrayList<>();
        if (!"all".equals(category) && !category.isBlank()) { conds.add("category = ?"); params.add(category); }
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }

        String where = "WHERE " + String.join(" AND ", conds);
        return db.queryForList(
                "SELECT DATE(ts) AS date, COALESCE(NULLIF(bot_name,''), bot_ua) AS bot_name, COUNT(*) AS count " +
                "FROM access_logs " + where +
                " GROUP BY date, bot_name ORDER BY date, count DESC", params.toArray());
    }

    // ── hourly ───────────────────────────────────────────────────────────────

    /** GET /admin/stats/hourly?date=YYYY-MM-DD&domain=&category=bot */
    @GetMapping("/admin/stats/hourly")
    public ResponseEntity<Object> statsHourly(
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category) {

        if (date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) {
            return ResponseEntity.badRequest().body(Map.of("error", "date query param required (YYYY-MM-DD)"));
        }
        if (lokiStats.isEnabled()) return ResponseEntity.ok(lokiStats.hourly(domList(domain), date, category));

        List<String> conds  = new ArrayList<>(List.of("DATE(ts) = ?"));
        List<Object> params = new ArrayList<>(List.of(date));
        if (!"all".equals(category) && !category.isBlank()) { conds.add("category = ?"); params.add(category); }
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }

        String where = "WHERE " + String.join(" AND ", conds);
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT strftime('%H', ts) AS hour, COUNT(*) AS count FROM access_logs " + where +
                " GROUP BY hour ORDER BY hour", params.toArray());

        Map<String, Long> map = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) map.put((String) r.get("hour"), toLong(r.get("count")));

        List<Map<String, Object>> result = new ArrayList<>(24);
        for (int i = 0; i < 24; i++) {
            String h = String.format("%02d", i);
            result.add(Map.of("hour", h, "count", map.getOrDefault(h, 0L)));
        }
        return ResponseEntity.ok(result);
    }

    // ── category ─────────────────────────────────────────────────────────────

    /** GET /admin/stats/category?domain= */
    @GetMapping("/admin/stats/category")
    public Map<String, Object> statsCategory(@RequestParam(required = false) String domain) {
        if (lokiStats.isEnabled()) return lokiStats.category(domList(domain));
        DomainCondition dc = DomainCondition.of(domain);
        String where = dc.hasCondition() ? "WHERE " + dc.sql() : "";
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT category, COUNT(*) AS count FROM access_logs " + where +
                " GROUP BY category", dc.asArray());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("malicious", 0L);
        result.put("bot", 0L);
        result.put("other_bot", 0L);
        result.put("user", 0L);
        for (Map<String, Object> r : rows) result.put((String) r.get("category"), r.get("count"));
        return result;
    }

    // ── purpose ──────────────────────────────────────────────────────────────

    /** GET /admin/stats/purpose?domain= */
    @GetMapping("/admin/stats/purpose")
    public List<Map<String, Object>> statsPurpose(@RequestParam(required = false) String domain) {
        if (lokiStats.isEnabled()) return lokiStats.purpose(domList(domain));
        List<String> conds  = new ArrayList<>(List.of("category != 'user'"));
        List<Object> params = new ArrayList<>();
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }
        String where = "WHERE " + String.join(" AND ", conds);
        return db.queryForList(
                "SELECT bot_purpose, COUNT(*) AS count, COUNT(DISTINCT bot_name) AS unique_bots " +
                "FROM access_logs " + where + " GROUP BY bot_purpose ORDER BY count DESC",
                params.toArray());
    }

    // ── malicious ────────────────────────────────────────────────────────────

    /** GET /admin/stats/malicious?domain= */
    @GetMapping("/admin/stats/malicious")
    public List<Map<String, Object>> statsMalicious(@RequestParam(required = false) String domain) {
        if (lokiStats.isEnabled()) return lokiStats.malicious(domList(domain));
        List<String> conds  = new ArrayList<>(List.of("category = 'malicious'"));
        List<Object> params = new ArrayList<>();
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }
        String where = "WHERE " + String.join(" AND ", conds);
        return db.queryForList(
                "SELECT bot_name, bot_vendor, COUNT(*) AS count, MAX(ts) AS last_seen " +
                "FROM access_logs " + where + " GROUP BY bot_name, bot_vendor ORDER BY count DESC",
                params.toArray());
    }

    // ── bot-names ────────────────────────────────────────────────────────────

    /** GET /admin/stats/bot-names?domain=&purpose= */
    @GetMapping("/admin/stats/bot-names")
    public List<Map<String, Object>> statsBotNames(
            @RequestParam(required = false) String domain,
            @RequestParam(required = false) String purpose) {
        if (lokiStats.isEnabled()) return lokiStats.botNames(domList(domain), purpose);

        List<String> conds  = new ArrayList<>(List.of("category != 'user'", "bot_name IS NOT NULL", "bot_name != ''"));
        List<Object> params = new ArrayList<>();
        if (purpose != null && !purpose.isBlank()) { conds.add("bot_purpose = ?"); params.add(purpose); }
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }
        String where = "WHERE " + String.join(" AND ", conds);
        return db.queryForList(
                "SELECT bot_name, bot_purpose, COUNT(*) AS count " +
                "FROM access_logs " + where + " GROUP BY bot_name ORDER BY count DESC",
                params.toArray());
    }

    // ── pages ────────────────────────────────────────────────────────────────

    /** GET /admin/stats/pages?domain=&category=&limit=50 */
    @GetMapping("/admin/stats/pages")
    public List<Map<String, Object>> statsPages(
            @RequestParam(required = false) String domain,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "50") int limit) {
        if (lokiStats.isEnabled()) return lokiStats.pages(domList(domain), category, limit);

        List<String> conds  = new ArrayList<>();
        List<Object> params = new ArrayList<>();
        if (category != null && !"all".equals(category) && !category.isBlank()) {
            conds.add("category = ?"); params.add(category);
        }
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }
        params.add(Math.min(limit, 200));
        String where = conds.isEmpty() ? "" : "WHERE " + String.join(" AND ", conds);
        return db.queryForList(
                "SELECT path, COUNT(*) AS count FROM access_logs " + where +
                " GROUP BY path ORDER BY count DESC LIMIT ?", params.toArray());
    }

    /** GET /admin/stats/pages/bots?path=&domain=&category=bot */
    @GetMapping("/admin/stats/pages/bots")
    public ResponseEntity<Object> statsPageBots(
            @RequestParam(required = false) String path,
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category) {

        if (path == null || path.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "path required"));
        }
        if (lokiStats.isEnabled()) return ResponseEntity.ok(lokiStats.pageBots(domList(domain), path, category));

        List<String> conds  = new ArrayList<>(List.of("path = ?"));
        List<Object> params = new ArrayList<>(List.of(path));
        if (!"all".equals(category) && !category.isBlank()) { conds.add("category = ?"); params.add(category); }
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) { conds.add(dc.sql()); params.addAll(dc.params()); }
        String where = "WHERE " + String.join(" AND ", conds);
        return ResponseEntity.ok(db.queryForList(
                "SELECT COALESCE(NULLIF(bot_name,''), bot_ua) AS bot_name, COUNT(*) AS count " +
                "FROM access_logs " + where +
                " GROUP BY bot_name ORDER BY count DESC LIMIT 10", params.toArray()));
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Map<String, Object> queryMapOrEmpty(String sql, Object[] params) {
        try {
            return db.queryForMap(sql, params);
        } catch (Exception e) {
            return Map.of();
        }
    }

    private long toLong(Object v) {
        if (v instanceof Number n) return n.longValue();
        return 0L;
    }
}
