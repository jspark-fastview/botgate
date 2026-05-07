package io.guardus.admin.controller;

import io.guardus.admin.util.CacheInvalidator;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * /admin/settings
 */
@RestController
public class SettingsController {

    private final JdbcTemplate db;

    public SettingsController(JdbcTemplate db) {
        this.db = db;
    }

    /** GET /admin/settings */
    @GetMapping("/admin/settings")
    public Map<String, Object> listSettings() {
        List<Map<String, Object>> rows = db.queryForList("SELECT key, value FROM settings");
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) result.put((String) row.get("key"), row.get("value"));
        return result;
    }

    /** PATCH /admin/settings/:key */
    @PatchMapping("/admin/settings/{key}")
    public ResponseEntity<Map<String, Object>> upsertSetting(@PathVariable String key,
                                                              @RequestBody Map<String, Object> body) {
        Object valueObj = body.get("value");
        if (valueObj == null) return ResponseEntity.badRequest().body(Map.of("error", "value 필수"));
        String value = valueObj.toString();
        db.update("""
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """, key, value);
        CacheInvalidator.invalidate();
        return ResponseEntity.ok(Map.of("ok", true, "key", key, "value", value));
    }
}
