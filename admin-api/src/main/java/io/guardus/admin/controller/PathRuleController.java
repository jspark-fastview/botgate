package io.guardus.admin.controller;

import io.guardus.admin.util.CacheInvalidator;
import io.guardus.admin.util.NanoId;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * /admin/path-rules — CRUD
 */
@RestController
public class PathRuleController {

    private final JdbcTemplate db;

    public PathRuleController(JdbcTemplate db) {
        this.db = db;
    }

    /** GET /admin/path-rules */
    @GetMapping("/admin/path-rules")
    public List<Map<String, Object>> listRules() {
        return db.queryForList(
                "SELECT id, pattern, action, note, active, created_at FROM path_rules ORDER BY created_at ASC");
    }

    /** POST /admin/path-rules */
    @PostMapping("/admin/path-rules")
    public ResponseEntity<Map<String, Object>> createRule(@RequestBody Map<String, Object> body) {
        String pattern = (String) body.get("pattern");
        String action  = (String) body.get("action");
        if (pattern == null || pattern.isBlank() || action == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "pattern, action 필수"));
        }
        String note = body.getOrDefault("note", "").toString();
        String id = "pr_" + NanoId.generate(8);
        try {
            db.update("INSERT INTO path_rules (id, pattern, action, note) VALUES (?, ?, ?, ?)",
                    id, pattern, action, note);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE")) {
                return ResponseEntity.status(409).body(Map.of("error", "pattern already exists"));
            }
            throw e;
        }
        CacheInvalidator.invalidate();
        return ResponseEntity.status(201).body(Map.of("id", id, "pattern", pattern, "action", action,
                "note", note, "active", 1));
    }

    /** PATCH /admin/path-rules/:id */
    @PatchMapping("/admin/path-rules/{id}")
    public ResponseEntity<Map<String, Object>> updateRule(@PathVariable String id,
                                                           @RequestBody Map<String, Object> body) {
        List<Map<String, Object>> rows = db.queryForList("SELECT * FROM path_rules WHERE id = ?", id);
        if (rows.isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "not found"));
        Map<String, Object> existing = rows.get(0);

        String action = body.containsKey("action") ? (String) body.get("action")
                                                    : (String) existing.get("action");
        String note   = body.containsKey("note")   ? body.get("note").toString()
                                                    : (String) existing.get("note");
        int active;
        if (body.containsKey("active")) {
            Object v = body.get("active");
            active = (Boolean.TRUE.equals(v) || "true".equals(v.toString())) ? 1 : 0;
        } else {
            active = toInt(existing.get("active"));
        }
        db.update("UPDATE path_rules SET action = ?, note = ?, active = ? WHERE id = ?",
                action, note, active, id);
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** DELETE /admin/path-rules/:id */
    @DeleteMapping("/admin/path-rules/{id}")
    public ResponseEntity<Map<String, Object>> deleteRule(@PathVariable String id) {
        int changed = db.update("DELETE FROM path_rules WHERE id = ?", id);
        if (changed == 0) return ResponseEntity.status(404).body(Map.of("error", "not found"));
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private int toInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof Boolean b) return b ? 1 : 0;
        return 0;
    }
}
