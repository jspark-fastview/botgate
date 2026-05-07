package io.guardus.admin.controller;

import io.guardus.admin.service.DnsService;
import io.guardus.admin.util.CacheInvalidator;
import io.guardus.admin.util.NanoId;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.CompletableFuture;

/**
 * /admin/channels  — CRUD + DNS status
 * /admin/stats/channels — channel-level aggregate stats
 */
@RestController
public class ChannelAdminController {

    private static final String STATS_SQL = """
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
            LEFT JOIN access_logs l ON
              l.domain = c.domain
              OR l.domain = 'www.' || c.domain
              OR l.domain = REPLACE(c.domain, 'www.', '')
            GROUP BY c.id
            ORDER BY (bot_total + other_bot_total + user_total) DESC
            """;

    private final JdbcTemplate db;
    private final DnsService   dns;

    public ChannelAdminController(JdbcTemplate db, DnsService dns) {
        this.db  = db;
        this.dns = dns;
    }

    /** GET /admin/stats/channels */
    @GetMapping("/admin/stats/channels")
    public List<Map<String, Object>> statsByChannel() {
        return db.queryForList(STATS_SQL);
    }

    /** GET /admin/channels */
    @GetMapping("/admin/channels")
    public List<Map<String, Object>> listChannels() {
        return db.queryForList(
                "SELECT id, name, domain, upstream, active, created_at FROM channels ORDER BY created_at DESC");
    }

    /** POST /admin/channels */
    @PostMapping("/admin/channels")
    public ResponseEntity<Map<String, Object>> createChannel(@RequestBody Map<String, Object> body) {
        String name     = (String) body.get("name");
        String domain   = (String) body.get("domain");
        String upstream = (String) body.get("upstream");
        if (name == null || domain == null || upstream == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "name, domain, upstream 필수"));
        }
        String id = "ch_" + NanoId.generate(8);
        try {
            db.update("INSERT INTO channels (id, name, domain, upstream) VALUES (?, ?, ?, ?)",
                    id, name, domain, upstream);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE")) {
                return ResponseEntity.status(409).body(Map.of("error", "domain already exists"));
            }
            throw e;
        }
        CacheInvalidator.invalidate();
        return ResponseEntity.status(201).body(
                Map.of("id", id, "name", name, "domain", domain, "upstream", upstream, "active", 1));
    }

    /** PATCH /admin/channels/:id */
    @PatchMapping("/admin/channels/{id}")
    public ResponseEntity<Map<String, Object>> updateChannel(@PathVariable String id,
                                                              @RequestBody Map<String, Object> body) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM channels WHERE id = ?", id);
        if (rows.isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "not found"));
        Map<String, Object> existing = rows.get(0);

        String name     = body.containsKey("name")     ? (String) body.get("name")     : (String) existing.get("name");
        String domain   = body.containsKey("domain")   ? (String) body.get("domain")   : (String) existing.get("domain");
        String upstream = body.containsKey("upstream") ? (String) body.get("upstream") : (String) existing.get("upstream");
        int active;
        if (body.containsKey("active")) {
            Object v = body.get("active");
            active = (Boolean.TRUE.equals(v) || "true".equals(v.toString())) ? 1 : 0;
        } else {
            active = toInt(existing.get("active"));
        }
        db.update("UPDATE channels SET name = ?, domain = ?, upstream = ?, active = ? WHERE id = ?",
                name, domain, upstream, active, id);
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** DELETE /admin/channels/:id */
    @DeleteMapping("/admin/channels/{id}")
    public ResponseEntity<Void> deleteChannel(@PathVariable String id) {
        int changed = db.update("DELETE FROM channels WHERE id = ?", id);
        if (changed == 0) return ResponseEntity.notFound().build();
        CacheInvalidator.invalidate();
        return ResponseEntity.noContent().build();
    }

    /** GET /admin/channels/dns-status — bulk DNS check */
    @GetMapping("/admin/channels/dns-status")
    public List<Map<String, Object>> dnsStatus() {
        List<Map<String, Object>> channels = db.queryForList(
                "SELECT id, name, domain FROM channels");
        List<CompletableFuture<Map<String, Object>>> futures = channels.stream()
                .map(c -> CompletableFuture.supplyAsync(() -> {
                    Map<String, Object> r = new LinkedHashMap<>(dns.checkDns((String) c.get("domain")));
                    r.put("id", c.get("id"));
                    return r;
                }))
                .toList();
        return futures.stream().map(CompletableFuture::join).toList();
    }

    /** GET /admin/channels/:id/dns-check */
    @GetMapping("/admin/channels/{id}/dns-check")
    public ResponseEntity<Map<String, Object>> dnsCheck(@PathVariable String id) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM channels WHERE id = ?", id);
        if (rows.isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "not found"));
        String domain = (String) rows.get(0).get("domain");
        Map<String, Object> result = new LinkedHashMap<>(dns.checkDns(domain));
        result.put("id", id);
        return ResponseEntity.ok(result);
    }

    private int toInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof Boolean b) return b ? 1 : 0;
        return 0;
    }
}
