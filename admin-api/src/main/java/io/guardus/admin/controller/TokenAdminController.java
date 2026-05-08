package io.guardus.admin.controller;

import io.guardus.admin.util.NanoId;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * /admin/tokens — CRUD
 */
@RestController
public class TokenAdminController {

    private final JdbcTemplate db;

    public TokenAdminController(JdbcTemplate db) {
        this.db = db;
    }

    /** GET /admin/tokens */
    @GetMapping("/admin/tokens")
    public List<Map<String, Object>> listTokens() {
        return db.queryForList(
                "SELECT id, token, owner, plan, active, created_at, expires_at FROM tokens ORDER BY created_at DESC");
    }

    /** POST /admin/tokens */
    @PostMapping("/admin/tokens")
    public ResponseEntity<Map<String, Object>> createToken(@RequestBody Map<String, Object> body) {
        String owner = (String) body.get("owner");
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "owner 필수"));
        }
        String plan  = body.getOrDefault("plan", "paid").toString();
        String id    = NanoId.generate();
        String token = "bg_" + NanoId.generate(32);
        db.update("INSERT INTO tokens (id, token, owner, plan) VALUES (?, ?, ?, ?)", id, token, owner, plan);
        return ResponseEntity.status(201).body(Map.of("id", id, "token", token, "owner", owner, "plan", plan));
    }

    /** PATCH /admin/tokens/:id */
    @PatchMapping("/admin/tokens/{id}")
    public ResponseEntity<Map<String, Object>> setActive(@PathVariable String id,
                                                          @RequestBody Map<String, Object> body) {
        Object activeVal = body.get("active");
        if (activeVal == null) return ResponseEntity.badRequest().body(Map.of("error", "active 필수"));
        boolean active = Boolean.TRUE.equals(activeVal) || "true".equals(activeVal.toString());
        int changed = db.update("UPDATE tokens SET active = ? WHERE id = ?", active ? 1 : 0, id);
        if (changed == 0) return ResponseEntity.status(404).body(Map.of("error", "not found"));
        io.guardus.admin.util.CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** DELETE /admin/tokens/:id */
    @DeleteMapping("/admin/tokens/{id}")
    public ResponseEntity<Void> deleteToken(@PathVariable String id) {
        // null-out log references first (FK safety)
        db.update("UPDATE access_logs SET token = NULL WHERE token = (SELECT token FROM tokens WHERE id = ?)", id);
        int changed = db.update("DELETE FROM tokens WHERE id = ?", id);
        if (changed == 0) return ResponseEntity.notFound().build();
        io.guardus.admin.util.CacheInvalidator.invalidate();
        return ResponseEntity.noContent().build();
    }
}
