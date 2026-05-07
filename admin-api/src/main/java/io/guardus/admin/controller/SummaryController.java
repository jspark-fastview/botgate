package io.guardus.admin.controller;

import io.guardus.admin.util.DomainCondition;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * /admin/stats/summary       — unified KPI for innerops / dashboard
 * /admin/stats/operator-view — multi-channel operator dashboard
 */
@RestController
public class SummaryController {

    // SQLite expression: bot display label (bot_name → UA-prefix fallback)
    private static final String BOT_LABEL =
            "COALESCE(NULLIF(bot_name,'')," +
            "CASE WHEN bot_ua IS NULL OR bot_ua='' THEN 'unknown'" +
            " WHEN instr(bot_ua,'/')>0 THEN substr(bot_ua,1,instr(bot_ua,'/')-1)" +
            " WHEN instr(bot_ua,' ')>0 THEN substr(bot_ua,1,instr(bot_ua,' ')-1)" +
            " ELSE bot_ua END)";

    private final JdbcTemplate db;

    public SummaryController(JdbcTemplate db) {
        this.db = db;
    }

    // ── /admin/stats/summary ─────────────────────────────────────────────────

    /**
     * GET /admin/stats/summary?domain=
     * One-call KPI for monitoring integrations (STATS_KEY accessible).
     */
    @GetMapping("/admin/stats/summary")
    public Map<String, Object> summary(@RequestParam(required = false) String domain) {
        DomainCondition dc = DomainCondition.of(domain);

        // baseWhere: used for all-time queries
        String baseWhere  = dc.hasCondition() ? "WHERE " + dc.sql() : "";
        Object[] basePrms = dc.asArray();

        // todayWhere: WHERE <domain?> AND DATE(ts)=DATE('now')
        String todayCond = (dc.hasCondition() ? dc.sql() + " AND " : "") + "DATE(ts) = DATE('now')";
        Object[] todayPrms = basePrms; // domain params only — date is in SQL

        // ── today 4-way ─────────────────────────────────────────────────────
        List<Map<String, Object>> todayCats = db.queryForList(
                "SELECT category, COUNT(*) AS count FROM access_logs WHERE " + todayCond +
                " GROUP BY category", todayPrms);
        Map<String, Long> today4way = new LinkedHashMap<>();
        today4way.put("user", 0L); today4way.put("bot", 0L);
        today4way.put("other_bot", 0L); today4way.put("malicious", 0L);
        for (Map<String, Object> r : todayCats) {
            String cat = (String) r.get("category");
            if (today4way.containsKey(cat)) today4way.put(cat, toLong(r.get("count")));
        }
        long todayTotal = today4way.values().stream().mapToLong(Long::longValue).sum();
        double botPct = todayTotal > 0
                ? (today4way.get("bot") + today4way.get("other_bot") + today4way.get("malicious")) / (double) todayTotal
                : 0.0;

        // ── today blocked ────────────────────────────────────────────────────
        Map<String, Object> blockedRow = queryMapOrEmpty(
                "SELECT COUNT(*) AS c FROM access_logs WHERE " + todayCond + " AND blocked = 1", todayPrms);
        long blockedToday = toLong(blockedRow.get("c"));

        // ── hourly (today, 4-way) ─────────────────────────────────────────────
        List<Map<String, Object>> hourlyRows = db.queryForList(
                "SELECT strftime('%H', ts) AS h, category, COUNT(*) AS count " +
                "FROM access_logs WHERE " + todayCond + " GROUP BY h, category", todayPrms);
        List<Map<String, Object>> hourlyMap = new ArrayList<>(24);
        for (int i = 0; i < 24; i++) {
            Map<String, Object> slot = new LinkedHashMap<>();
            slot.put("hour", String.format("%02d", i));
            slot.put("user", 0L); slot.put("bot", 0L); slot.put("other_bot", 0L); slot.put("malicious", 0L);
            hourlyMap.add(slot);
        }
        for (Map<String, Object> r : hourlyRows) {
            int idx = Integer.parseInt((String) r.get("h"));
            String cat = (String) r.get("category");
            if (idx >= 0 && idx < 24 && hourlyMap.get(idx).containsKey(cat)) {
                hourlyMap.get(idx).put(cat, toLong(r.get("count")));
            }
        }

        // ── botCategories top 10 ─────────────────────────────────────────────
        String botCatWhere = (dc.hasCondition() ? baseWhere + " AND" : "WHERE") +
                " category != 'user' AND bot_name IS NOT NULL AND bot_name != ''";
        List<Map<String, Object>> botCatsRaw = db.queryForList(
                "SELECT bot_name AS name, MAX(bot_purpose) AS purpose," +
                " SUM(CASE WHEN blocked=1 THEN 1 ELSE 0 END) AS blockedCount," +
                " SUM(CASE WHEN blocked=0 AND verified=1 THEN 1 ELSE 0 END) AS meterCount," +
                " SUM(CASE WHEN blocked=0 AND (verified=0 OR verified IS NULL) THEN 1 ELSE 0 END) AS passCount," +
                " COUNT(*) AS requests " +
                "FROM access_logs " + botCatWhere +
                " GROUP BY bot_name ORDER BY requests DESC LIMIT 10", basePrms);
        List<Map<String, Object>> botCategories = botCatsRaw.stream().map(b -> {
            long blocked = toLong(b.get("blockedCount"));
            long meter   = toLong(b.get("meterCount"));
            long pass    = toLong(b.get("passCount"));
            String action = (blocked > meter && blocked > pass) ? "block"
                          : (meter > pass) ? "meter" : "pass";
            return (Map<String, Object>) Map.of(
                    "name",     b.getOrDefault("name", ""),
                    "purpose",  b.getOrDefault("purpose", "generic"),
                    "requests", toLong(b.get("requests")),
                    "action",   action);
        }).toList();

        // ── purposes ─────────────────────────────────────────────────────────
        String purposeWhere = (dc.hasCondition() ? baseWhere + " AND" : "WHERE") +
                " category != 'user' AND bot_purpose IS NOT NULL";
        List<Map<String, Object>> purposeRows = db.queryForList(
                "SELECT bot_purpose AS purpose, COUNT(*) AS count FROM access_logs " +
                purposeWhere + " GROUP BY bot_purpose", basePrms);
        Map<String, Long> purposes = new LinkedHashMap<>();
        for (Map<String, Object> r : purposeRows) purposes.put((String) r.get("purpose"), toLong(r.get("count")));

        // ── actions (estimated from blocked/verified) ─────────────────────────
        Map<String, Object> actionRow = queryMapOrEmpty(
                "SELECT SUM(CASE WHEN blocked=1 THEN 1 ELSE 0 END) AS block," +
                " SUM(CASE WHEN blocked=0 AND verified=1 THEN 1 ELSE 0 END) AS meter," +
                " SUM(CASE WHEN blocked=0 AND (verified=0 OR verified IS NULL) THEN 1 ELSE 0 END) AS pass" +
                " FROM access_logs " + baseWhere, basePrms);
        Map<String, Object> actions = new LinkedHashMap<>();
        actions.put("pass",       toLong(actionRow.get("pass")));
        actions.put("meter",      toLong(actionRow.get("meter")));
        actions.put("verify",     0L);
        actions.put("token_only", 0L);
        actions.put("block",      toLong(actionRow.get("block")));
        actions.put("gone",       0L);

        // ── channels ─────────────────────────────────────────────────────────
        List<Map<String, Object>> channels = db.queryForList(
                "SELECT domain, COUNT(*) AS totalReq," +
                " SUM(CASE WHEN category!='user' THEN 1 ELSE 0 END) AS botReq," +
                " SUM(CASE WHEN blocked=1 THEN 1 ELSE 0 END) AS blockedReq" +
                " FROM access_logs " + baseWhere +
                " GROUP BY domain ORDER BY totalReq DESC LIMIT 20", basePrms);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("source",      "guardus");
        result.put("generatedAt", Instant.now().toString());
        result.put("totalToday",  todayTotal);
        result.put("botPctToday", botPct);
        result.put("blockedToday", blockedToday);
        result.put("today4way",   today4way);
        result.put("hourly",      hourlyMap);
        result.put("botCategories", botCategories);
        result.put("purposes",    purposes);
        result.put("actions",     actions);
        result.put("channels",    channels);
        return result;
    }

    // ── /admin/stats/operator-view ───────────────────────────────────────────

    /**
     * GET /admin/stats/operator-view?range=7d|30d|90d
     * Multi-channel operator dashboard with heatmap, trends, and alerts.
     */
    @GetMapping("/admin/stats/operator-view")
    public Map<String, Object> operatorView(
            @RequestParam(defaultValue = "7d") String range) {

        if (!Set.of("7d", "30d", "90d").contains(range)) range = "7d";
        int days  = "90d".equals(range) ? 90 : "30d".equals(range) ? 30 : 7;
        String since = Instant.now().minus(days, ChronoUnit.DAYS).toString();
        String baseWhere = "WHERE ts >= ?";
        Object[] basePrms = {since};

        // ── 1. totals ────────────────────────────────────────────────────────
        Map<String, Object> totalsRow = queryMapOrEmpty(
                "SELECT COUNT(*) AS totalReq," +
                " SUM(CASE WHEN category!='user' THEN 1 ELSE 0 END) AS botReq," +
                " SUM(CASE WHEN blocked=1 THEN 1 ELSE 0 END) AS blockedReq," +
                " COUNT(DISTINCT domain) AS channelCount," +
                " COUNT(DISTINCT " + BOT_LABEL + ") AS activeBotCount" +
                " FROM access_logs " + baseWhere, basePrms);
        long totalReq   = toLong(totalsRow.get("totalReq"));
        long botReq     = toLong(totalsRow.get("botReq"));
        long blockedReq = toLong(totalsRow.get("blockedReq"));
        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("totalReq",       totalReq);
        totals.put("botReq",         botReq);
        totals.put("blockedReq",     blockedReq);
        totals.put("botPct",         totalReq > 0 ? (double) botReq / totalReq : 0.0);
        totals.put("blockPct",       botReq > 0   ? (double) blockedReq / botReq : 0.0);
        totals.put("channelCount",   toLong(totalsRow.get("channelCount")));
        totals.put("activeBotCount", toLong(totalsRow.get("activeBotCount")));

        // ── 2. channels ──────────────────────────────────────────────────────
        List<Map<String, Object>> channelRows = db.queryForList(
                "SELECT domain, COUNT(*) AS totalReq," +
                " SUM(CASE WHEN category!='user' THEN 1 ELSE 0 END) AS botReq," +
                " SUM(CASE WHEN blocked=1 THEN 1 ELSE 0 END) AS blockedReq" +
                " FROM access_logs " + baseWhere +
                " GROUP BY domain ORDER BY totalReq DESC LIMIT 20", basePrms);

        List<Map<String, Object>> channels = channelRows.stream().map(c -> {
            long cTotal   = toLong(c.get("totalReq"));
            long cBot     = toLong(c.get("botReq"));
            long cBlocked = toLong(c.get("blockedReq"));
            // top 3 bots per channel
            List<Map<String, Object>> top = db.queryForList(
                    "SELECT " + BOT_LABEL + " AS name, COUNT(*) AS count" +
                    " FROM access_logs WHERE ts >= ? AND domain = ? AND category != 'user'" +
                    " GROUP BY name ORDER BY count DESC LIMIT 3", since, c.get("domain"));
            Map<String, Object> ch = new LinkedHashMap<>();
            ch.put("domain",     c.get("domain"));
            ch.put("totalReq",   cTotal);
            ch.put("botReq",     cBot);
            ch.put("blockedReq", cBlocked);
            ch.put("botPct",     cTotal > 0 ? (double) cBot / cTotal : 0.0);
            ch.put("blockPct",   cBot > 0   ? (double) cBlocked / cBot : 0.0);
            ch.put("topBots",    top.stream().map(t -> Map.of("name", t.get("name"), "count", t.get("count"))).toList());
            return ch;
        }).toList();

        // ── 3. heatmap (top 10 bots × top 10 channels) ──────────────────────
        List<String> topBotNames = db.queryForList(
                "SELECT " + BOT_LABEL + " AS name, COUNT(*) AS count" +
                " FROM access_logs " + baseWhere + " AND category != 'user'" +
                " GROUP BY name ORDER BY count DESC LIMIT 10", basePrms)
                .stream().map(r -> (String) r.get("name")).toList();

        List<String> topChannelNames = channelRows.stream()
                .limit(10).map(c -> (String) c.get("domain")).toList();

        List<List<Long>> cells = topBotNames.stream().map(bot ->
                topChannelNames.stream().map(ch -> {
                    Map<String, Object> r = queryMapOrEmpty(
                            "SELECT COUNT(*) AS c FROM access_logs WHERE ts >= ? AND " +
                            BOT_LABEL + " = ? AND domain = ? AND category != 'user'",
                            new Object[]{since, bot, ch});
                    return toLong(r.get("c"));
                }).toList()
        ).toList();

        Map<String, Object> matrix = Map.of("bots", topBotNames, "channels", topChannelNames, "cells", cells);

        // ── 4. daily trend ───────────────────────────────────────────────────
        List<Map<String, Object>> trend = db.queryForList(
                "SELECT DATE(ts) AS date, COUNT(*) AS total," +
                " SUM(CASE WHEN category!='user' THEN 1 ELSE 0 END) AS bot," +
                " SUM(CASE WHEN blocked=1 THEN 1 ELSE 0 END) AS blocked" +
                " FROM access_logs " + baseWhere +
                " GROUP BY DATE(ts) ORDER BY date ASC", basePrms);

        // ── 5. alerts (heuristic) ─────────────────────────────────────────────
        List<Map<String, Object>> alerts = new ArrayList<>();

        // 5-1. traffic spike (yesterday vs historical average)
        if (days >= 7) {
            String yesterday = Instant.now().minus(1, ChronoUnit.DAYS).toString().substring(0, 10);
            List<Map<String, Object>> ydRows = db.queryForList(
                    "SELECT domain, COUNT(*) AS yc FROM access_logs WHERE DATE(ts) = ? GROUP BY domain", yesterday);
            for (Map<String, Object> yr : ydRows) {
                String dom = (String) yr.get("domain");
                long yc = toLong(yr.get("yc"));
                Map<String, Object> avgRow = queryMapOrEmpty(
                        "SELECT AVG(c) AS avg FROM (" +
                        "SELECT DATE(ts) AS d, COUNT(*) AS c FROM access_logs" +
                        " WHERE ts >= ? AND ts < ? AND domain = ? GROUP BY DATE(ts))",
                        new Object[]{since, yesterday, dom});
                double avg = toDouble(avgRow.get("avg"));
                if (avg > 10 && yc > avg * 2) {
                    String severity = yc > avg * 5 ? "critical" : "warn";
                    int pct = (int) Math.round((yc / avg - 1) * 100);
                    alerts.add(Map.of("severity", severity, "type", "traffic_spike", "channel", dom,
                            "message", dom + ": 어제 " + yc + "건, 평균 " + Math.round(avg) + "건 (+" + pct + "%)"));
                }
            }
        }

        // 5-2. low block rate (bot% > 50%, block% < 5%)
        for (Map<String, Object> c : channels.stream().limit(10).toList()) {
            long cBot     = toLong(c.get("botReq"));
            double botPct = toDouble(c.get("botPct"));
            double blkPct = toDouble(c.get("blockPct"));
            if (cBot > 100 && botPct > 0.5 && blkPct < 0.05) {
                alerts.add(Map.of("severity", "info", "type", "low_block_rate",
                        "channel", c.get("domain"),
                        "message", c.get("domain") + ": 봇 비율 " + Math.round(botPct * 100) +
                                "% 인데 차단율 " + Math.round(blkPct * 100) + "% (정책 점검 필요?)"));
            }
        }

        // 5-3. new bots (appeared only in this range, ≥10 requests)
        if (days <= 30) {
            String earlierThan = since;
            List<Map<String, Object>> newBots = db.queryForList(
                    "SELECT " + BOT_LABEL + " AS name, COUNT(*) AS count" +
                    " FROM access_logs WHERE ts >= ? AND category != 'user'" +
                    " GROUP BY name HAVING COUNT(*) >= 10" +
                    " AND name NOT IN (SELECT DISTINCT " + BOT_LABEL +
                    " FROM access_logs WHERE ts < ?) ORDER BY count DESC LIMIT 5",
                    since, earlierThan);
            for (Map<String, Object> nb : newBots) {
                alerts.add(Map.of("severity", "info", "type", "new_bot",
                        "message", "신규 봇 발견: " + nb.get("name") + " (" + toLong(nb.get("count")) + "건, 최근 " + days + "일)"));
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("source",      "guardus-operator");
        result.put("range",       range);
        result.put("since",       since);
        result.put("generatedAt", Instant.now().toString());
        result.put("totals",      totals);
        result.put("channels",    channels);
        result.put("matrix",      matrix);
        result.put("trend",       trend);
        result.put("alerts",      alerts);
        return result;
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

    private double toDouble(Object v) {
        if (v instanceof Number n) return n.doubleValue();
        return 0.0;
    }
}
