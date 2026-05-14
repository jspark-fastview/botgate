package io.guardus.admin.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * UA → 봇 분류. OpenResty 의 bot_classifier.lua 와 동일 의미 — 둘이 분기되지 않도록 주의.
 *
 * 소스: bot_catalog 테이블 (60초 refresh).
 *   - is_malicious = 1 → 악성 (case-insensitive substring 매칭)
 *   - is_malicious = 0 → 일반 봇 (case-sensitive substring 매칭, Lua 와 동일)
 *
 * 휴리스틱 (DB 매칭 실패 시 "bot/", "crawl" 등 흔적으로 other_bot 추정) 만 코드 상수.
 */
@Service
public class BotClassifierService {

    public record Classification(
            String category,   // malicious | bot | other_bot | user
            String purpose,    // malicious | ai_training | ai_search | ... | user
            String name,
            String vendor) {}

    public record BotPattern(String name, String vendor, String purpose,
                             boolean malicious, List<String> patterns) {}

    private static final List<String> OTHER_BOT_HEURISTICS = List.of(
        "bot/", "bot ", "crawl", "spider", "slurp", "archive.org", "indexer", "scraper"
    );

    private final JdbcTemplate db;
    private final ObjectMapper mapper = new ObjectMapper();

    // 두 리스트로 분리해 매칭 비용↓ (malicious 먼저 평가)
    private final AtomicReference<List<BotPattern>> malicious = new AtomicReference<>(List.of());
    private final AtomicReference<List<BotPattern>> bots      = new AtomicReference<>(List.of());

    public BotClassifierService(JdbcTemplate db) { this.db = db; }

    @PostConstruct
    public void init() { refresh(); }

    /** 60초마다 bot_catalog refresh. 어드민에서 봇 추가/수정 시 1분 내 반영. */
    @Scheduled(fixedDelay = 60_000)
    public void refresh() {
        List<Map<String, Object>> rows = db.queryForList(
            "SELECT name, vendor, purpose, patterns, is_malicious " +
            "FROM bot_catalog WHERE enabled = 1");
        List<BotPattern> mal = new ArrayList<>();
        List<BotPattern> normal = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            // SQLite 는 TEXT (String), Postgres JSONB 는 PGobject — 양쪽 호환 위해 toString.
            Object patternsRaw = r.get("patterns");
            String patternsJson = patternsRaw == null ? null : patternsRaw.toString();
            List<String> patterns;
            try {
                patterns = patternsJson != null
                    ? mapper.readValue(patternsJson, new TypeReference<List<String>>(){})
                    : List.of();
            } catch (Exception e) {
                patterns = List.of();
            }
            boolean isMal = toInt(r.get("is_malicious")) == 1;
            BotPattern bp = new BotPattern(
                (String) r.get("name"),
                (String) (r.getOrDefault("vendor", "")),
                (String) (r.getOrDefault("purpose", "generic")),
                isMal,
                patterns
            );
            (isMal ? mal : normal).add(bp);
        }
        malicious.set(mal);
        bots.set(normal);
    }

    public Classification classify(String ua) {
        if (ua == null || ua.isEmpty()) {
            return new Classification("malicious", "malicious", "(empty UA)", "Unknown");
        }
        String uaLower = ua.toLowerCase();

        // 1. 악성 — case-insensitive substring
        for (BotPattern b : malicious.get()) {
            for (String p : b.patterns) {
                if (p != null && !p.isEmpty() && uaLower.contains(p)) {
                    return new Classification("malicious", "malicious", b.name, b.vendor);
                }
            }
        }

        // 2. 알려진 봇 — case-sensitive substring (Lua 와 동일)
        for (BotPattern b : bots.get()) {
            for (String p : b.patterns) {
                if (p != null && !p.isEmpty() && ua.contains(p)) {
                    String cat = switch (b.purpose) {
                        case "ai_training", "ai_search", "ai_assistant" -> "bot";
                        default -> "other_bot";
                    };
                    return new Classification(cat, b.purpose, b.name, b.vendor);
                }
            }
        }

        // 3. 미등록 봇 휴리스틱
        for (String p : OTHER_BOT_HEURISTICS) {
            if (uaLower.contains(p)) {
                return new Classification("other_bot", "generic", "Unknown Bot", "");
            }
        }

        // 4. 사용자
        return new Classification("user", "user", "", "");
    }

    private static int toInt(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof Boolean b) return b ? 1 : 0;
        return 0;
    }
}
