package io.guardus.admin.controller;

import io.guardus.admin.util.CacheInvalidator;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * /admin/purpose-policies
 */
@RestController
public class PurposePolicyController {

    private final JdbcTemplate db;

    public PurposePolicyController(JdbcTemplate db) {
        this.db = db;
    }

    /** GET /admin/purpose-policies */
    @GetMapping("/admin/purpose-policies")
    public Map<String, Object> listPolicies() {
        List<Map<String, Object>> rows = db.queryForList("SELECT purpose, action FROM purpose_policies");
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) result.put((String) row.get("purpose"), row.get("action"));
        return result;
    }

    /** PATCH /admin/purpose-policies/:purpose */
    @PatchMapping("/admin/purpose-policies/{purpose}")
    public ResponseEntity<Map<String, Object>> updatePolicy(@PathVariable String purpose,
                                                             @RequestBody Map<String, Object> body) {
        String action = (String) body.get("action");
        if (action == null) return ResponseEntity.badRequest().body(Map.of("error", "action 필수"));
        db.update("""
                INSERT INTO purpose_policies (purpose, action) VALUES (?, ?)
                ON CONFLICT(purpose) DO UPDATE SET action = excluded.action
                """, purpose, action);
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true, "purpose", purpose, "action", action));
    }
}
