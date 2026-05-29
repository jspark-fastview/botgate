package io.guardus.admin.controller;

import io.guardus.admin.service.LokiClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Loki 기반 통계 — 점진 마이그레이션 중. 현행 SQL 기반 /admin/stats/* 와 병행.
 * 검증 완료되면 기존 SummaryController/MyStatsController 등을 Loki 로 교체.
 *
 * EC2: LokiClient.isEnabled() == false 라 빈 응답. SQL 쪽 계속 사용.
 * K8s: LOKI_URL=http://loki.monitoring.svc:3100 → 실제 Loki 쿼리.
 */
@RestController
public class LokiStatsController {

    private final LokiClient loki;

    public LokiStatsController(LokiClient loki) { this.loki = loki; }

    /** GET /admin/loki/health — Loki 가 활성인지 + 기본 라벨 보임 */
    @GetMapping("/admin/loki/health")
    public Map<String, Object> health() {
        return Map.of("enabled", loki.isEnabled());
    }

    /**
     * GET /admin/loki/top-bots?range=24h — 최근 N 시간 봇별 요청 수 top 10.
     * LogQL: topk(10, sum by (bot_name, bot_purpose) (count_over_time({...}|json|category!="user"|bot_name!=""[Xh])))
     */
    @GetMapping("/admin/loki/top-bots")
    public List<Map<String, Object>> topBots(
            @RequestParam(defaultValue = "24h") String range) {
        if (!loki.isEnabled()) return List.of();
        Duration d = parseRange(range);
        String logql = "topk(10, sum by (bot_name, bot_purpose) ("
                + "count_over_time(" + loki.streamMatcher() + " "
                + "| json | category != `user` | bot_name != `` "
                + "[" + range + "])))";
        List<Map<String, Object>> rows = loki.instantQuery(logql);
        return rows.stream().map(r -> {
            @SuppressWarnings("unchecked")
            Map<String, String> labels = (Map<String, String>) r.get("labels");
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("name",     labels.getOrDefault("bot_name", ""));
            out.put("purpose",  labels.getOrDefault("bot_purpose", "generic"));
            out.put("requests", ((Number) r.getOrDefault("value", 0)).longValue());
            return out;
        }).toList();
    }

    /**
     * GET /admin/loki/actions?range=24h — action 별 집계 (pass/meter/block/...)
     */
    @GetMapping("/admin/loki/actions")
    public Map<String, Long> actions(@RequestParam(defaultValue = "24h") String range) {
        if (!loki.isEnabled()) return Map.of();
        String logql = "sum by (action) ("
                + "count_over_time(" + loki.streamMatcher() + " "
                + "| json | __error__=`` "
                + "[" + range + "]))";
        List<Map<String, Object>> rows = loki.instantQuery(logql);
        Map<String, Long> out = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            @SuppressWarnings("unchecked")
            Map<String, String> labels = (Map<String, String>) r.get("labels");
            String action = labels.getOrDefault("action", "unknown");
            long count = ((Number) r.getOrDefault("value", 0)).longValue();
            out.merge(action, count, Long::sum);
        }
        return out;
    }

    private static Duration parseRange(String s) {
        if (s.endsWith("h")) return Duration.ofHours(Long.parseLong(s.substring(0, s.length()-1)));
        if (s.endsWith("d")) return Duration.ofDays(Long.parseLong(s.substring(0, s.length()-1)));
        if (s.endsWith("m")) return Duration.ofMinutes(Long.parseLong(s.substring(0, s.length()-1)));
        return Duration.ofHours(24);
    }
}
