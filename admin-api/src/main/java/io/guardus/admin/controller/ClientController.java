package io.guardus.admin.controller;

import io.guardus.admin.util.NanoId;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 봇 운영자(AI회사) 향 공개 API
 *   POST /tokens              — 토큰 발급 신청
 *   GET  /tokens/:token/usage — 사용량 조회
 */
@RestController
public class ClientController {

    private final JdbcTemplate db;

    public ClientController(JdbcTemplate db) {
        this.db = db;
    }

    /** POST /tokens */
    @PostMapping("/tokens")
    public ResponseEntity<Map<String, Object>> issueToken(@RequestBody Map<String, Object> body) {
        String owner = (String) body.get("owner");
        if (owner == null || owner.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "owner 필수"));
        }
        String plan  = body.getOrDefault("plan", "free").toString();
        String id    = NanoId.generate();
        String token = "bg_" + NanoId.generate(32);
        db.update("INSERT INTO tokens (id, token, owner, plan) VALUES (?, ?, ?, ?)", id, token, owner, plan);
        return ResponseEntity.status(201).body(Map.of("token", token, "plan", plan));
    }

    /** GET /tokens/:token/usage */
    @GetMapping("/tokens/{token}/usage")
    public ResponseEntity<Map<String, Object>> tokenUsage(@PathVariable String token) {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT id, owner, plan, active, created_at, expires_at FROM tokens WHERE token = ?", token);
        if (rows.isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "token not found"));

        Map<String, Object> row = rows.get(0);
        Map<String, Object> usage = db.queryForMap(
                "SELECT COUNT(*) AS total," +
                " COUNT(CASE WHEN verified=1 THEN 1 END) AS verified," +
                " COUNT(CASE WHEN DATE(ts)=DATE('now') THEN 1 END) AS today" +
                " FROM access_logs WHERE token = ?", token);

        Map<String, Object> result = new java.util.LinkedHashMap<>(row);
        result.put("usage", usage);
        return ResponseEntity.ok(result);
    }
}
