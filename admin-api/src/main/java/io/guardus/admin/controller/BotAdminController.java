package io.guardus.admin.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * /admin/bots      — CRUD
 * /admin/bots/catalog — full catalog with purpose_meta
 */
@RestController
public class BotAdminController {

    private static final Map<String, Object> PURPOSE_META;
    static {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ai_training",   Map.of("label", "AI Crawler",            "desc", "학습 데이터"));
        m.put("ai_search",     Map.of("label", "AI Search",             "desc", "RAG 인덱싱"));
        m.put("ai_assistant",  Map.of("label", "AI Assistant",          "desc", "사용자 트리거 fetch"));
        m.put("search_engine", Map.of("label", "Search Engine Crawler", "desc", "전통 검색엔진"));
        m.put("seo",           Map.of("label", "SEO Crawler",           "desc", "분석 도구"));
        m.put("social",        Map.of("label", "Social Preview",        "desc", "링크 미리보기"));
        m.put("generic",       Map.of("label", "Generic Bot",           "desc", "기타"));
        PURPOSE_META = Collections.unmodifiableMap(m);
    }

    private static final ObjectMapper OM = new ObjectMapper();
    private static final TypeReference<List<Object>> LIST_REF = new TypeReference<>() {};

    private final JdbcTemplate db;

    public BotAdminController(JdbcTemplate db) {
        this.db = db;
    }

    /** GET /admin/bots/catalog — bots + malicious + purpose_meta */
    @GetMapping("/admin/bots/catalog")
    public Map<String, Object> catalog() {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT * FROM bot_catalog ORDER BY is_malicious, purpose, name");
        List<Map<String, Object>> bots      = new ArrayList<>();
        List<Map<String, Object>> malicious = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> parsed = parsePats(row);
            if (toInt(row.get("is_malicious")) == 1) malicious.add(parsed);
            else                                      bots.add(parsed);
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("bots",         bots);
        resp.put("malicious",    malicious);
        resp.put("purpose_meta", PURPOSE_META);
        return resp;
    }

    /** GET /admin/bots — all bots (admin UI) */
    @GetMapping("/admin/bots")
    public List<Map<String, Object>> listBots() {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT * FROM bot_catalog ORDER BY is_malicious, purpose, name");
        return rows.stream().map(this::parsePats).toList();
    }

    /** POST /admin/bots */
    @PostMapping("/admin/bots")
    public ResponseEntity<Map<String, Object>> createBot(@RequestBody Map<String, Object> body) {
        String name    = (String) body.get("name");
        String vendor  = (String) body.get("vendor");
        String purpose = (String) body.get("purpose");
        if (name == null || vendor == null || purpose == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "name, vendor, purpose 필수"));
        }
        List<?> patterns = body.containsKey("patterns") ? (List<?>) body.get("patterns") : List.of();
        int isMalicious  = toInt(body.getOrDefault("is_malicious", 0));
        int enabled      = toInt(body.getOrDefault("enabled", 1));

        try {
            String patsJson = OM.writeValueAsString(patterns);
            db.update("""
                    INSERT INTO bot_catalog (name, vendor, purpose, patterns, is_malicious, enabled)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, name, vendor, purpose, patsJson, isMalicious, enabled);
            Long id = db.queryForObject("SELECT last_insert_rowid()", Long.class);
            return ResponseEntity.status(201).body(Map.of("id", id != null ? id : 0));
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE")) {
                return ResponseEntity.status(409).body(Map.of("error", "이미 존재하는 봇 이름"));
            }
            throw new RuntimeException(e);
        }
    }

    /** PUT /admin/bots/:id */
    @PutMapping("/admin/bots/{id}")
    public ResponseEntity<Map<String, Object>> updateBot(@PathVariable long id,
                                                          @RequestBody Map<String, Object> body) {
        List<Map<String, Object>> rows = db.queryForList("SELECT id FROM bot_catalog WHERE id = ?", id);
        if (rows.isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "봇 없음"));

        String name    = (String) body.get("name");
        String vendor  = (String) body.get("vendor");
        String purpose = (String) body.get("purpose");
        List<?> patterns  = body.containsKey("patterns") ? (List<?>) body.get("patterns") : List.of();
        int isMalicious   = toInt(body.getOrDefault("is_malicious", 0));
        int enabled       = toInt(body.getOrDefault("enabled", 1));

        try {
            String patsJson = OM.writeValueAsString(patterns);
            db.update("""
                    UPDATE bot_catalog
                    SET name=?, vendor=?, purpose=?, patterns=?, is_malicious=?, enabled=?,
                        updated_at=datetime('now')
                    WHERE id=?
                    """, name, vendor, purpose, patsJson, isMalicious, enabled, id);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** DELETE /admin/bots/:id */
    @DeleteMapping("/admin/bots/{id}")
    public Map<String, Object> deleteBot(@PathVariable long id) {
        db.update("DELETE FROM bot_catalog WHERE id = ?", id);
        return Map.of("ok", true);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Map<String, Object> parsePats(Map<String, Object> row) {
        Map<String, Object> result = new LinkedHashMap<>(row);
        String raw = row.getOrDefault("patterns", "[]").toString();
        try {
            result.put("patterns", OM.readValue(raw, LIST_REF));
        } catch (Exception e) {
            result.put("patterns", List.of());
        }
        return result;
    }

    private int toInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof Boolean b) return b ? 1 : 0;
        if (v instanceof String s) return "1".equals(s) || "true".equalsIgnoreCase(s) ? 1 : 0;
        return 0;
    }
}
