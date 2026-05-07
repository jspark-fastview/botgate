package io.guardus.admin.controller;

import io.guardus.admin.util.DomainCondition;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * /admin/logs — recent log viewer
 * /admin/logs/export — CSV-style bulk export
 */
@RestController
public class LogsController {

    private final JdbcTemplate db;

    public LogsController(JdbcTemplate db) {
        this.db = db;
    }

    /** GET /admin/logs?domain=&category=bot&limit=100 */
    @GetMapping("/admin/logs")
    public List<Map<String, Object>> getLogs(
            @RequestParam(required = false) String domain,
            @RequestParam(defaultValue = "bot") String category,
            @RequestParam(defaultValue = "100") int limit) {

        int cap = Math.min(limit, 500);
        List<String> conds  = new ArrayList<>();
        List<Object> params = new ArrayList<>();

        if (!"all".equals(category) && category != null && !category.isBlank()) {
            conds.add("category = ?");
            params.add(category);
        }
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) {
            conds.add(dc.sql());
            params.addAll(dc.params());
        }
        params.add(cap);

        String where = conds.isEmpty() ? "" : "WHERE " + String.join(" AND ", conds);
        return db.queryForList(
                "SELECT id, token, bot_ua, domain, ip, path, verified, billed, category, bot_purpose, bot_name, ts " +
                "FROM access_logs " + where + " ORDER BY id DESC LIMIT ?",
                params.toArray());
    }

    /** GET /admin/logs/export?period=day|week|month&domain=&category= */
    @GetMapping("/admin/logs/export")
    public List<Map<String, Object>> exportLogs(
            @RequestParam(defaultValue = "day") String period,
            @RequestParam(required = false) String domain,
            @RequestParam(required = false) String category) {

        String interval = switch (period) {
            case "week"  -> "-7 days";
            case "month" -> "-30 days";
            default      -> "-1 days";
        };
        List<String> conds  = new ArrayList<>();
        List<Object> params = new ArrayList<>();

        conds.add("ts >= datetime('now', '" + interval + "')");
        if (category != null && !"all".equals(category) && !category.isBlank()) {
            conds.add("category = ?");
            params.add(category);
        }
        DomainCondition dc = DomainCondition.of(domain);
        if (dc.hasCondition()) {
            conds.add(dc.sql());
            params.addAll(dc.params());
        }

        String where = "WHERE " + String.join(" AND ", conds);
        return db.queryForList(
                "SELECT id, bot_ua, domain, ip, path, verified, billed, category, bot_purpose, bot_name, bot_vendor, blocked, ts " +
                "FROM access_logs " + where + " ORDER BY id DESC LIMIT 100000",
                params.toArray());
    }
}
