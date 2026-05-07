package io.guardus.admin.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * /admin/users — list / toggle / delete
 */
@RestController
public class UserAdminController {

    private final JdbcTemplate db;

    public UserAdminController(JdbcTemplate db) {
        this.db = db;
    }

    /** GET /admin/users */
    @GetMapping("/admin/users")
    public List<Map<String, Object>> listUsers() {
        return db.queryForList(
                "SELECT id, email, name, active, created_at FROM users ORDER BY created_at DESC");
    }

    /** PATCH /admin/users/:id */
    @PatchMapping("/admin/users/{id}")
    public ResponseEntity<Map<String, Object>> setActive(@PathVariable String id,
                                                          @RequestBody Map<String, Object> body) {
        Object activeVal = body.get("active");
        if (activeVal == null) return ResponseEntity.badRequest().body(Map.of("error", "active 필수"));
        boolean active = Boolean.TRUE.equals(activeVal) || "true".equals(activeVal.toString());
        int changed = db.update("UPDATE users SET active = ? WHERE id = ?", active ? 1 : 0, id);
        if (changed == 0) return ResponseEntity.status(404).body(Map.of("error", "not found"));
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** DELETE /admin/users/:id  (sessions CASCADE-deleted by FK) */
    @DeleteMapping("/admin/users/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable String id) {
        int changed = db.update("DELETE FROM users WHERE id = ?", id);
        if (changed == 0) return ResponseEntity.notFound().build();
        return ResponseEntity.noContent().build();
    }
}
