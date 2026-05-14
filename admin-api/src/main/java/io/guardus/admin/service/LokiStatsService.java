package io.guardus.admin.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Loki 기반 stats 서비스. MyStatsController / StatsController /
 * ChannelAdminController 의 access_logs SQL 을 LogQL 로 대체.
 *
 * 정책:
 *  - 모든 윈도우 30d 통일 (access_logs 30일 retention 가정)
 *  - domain (List) → host=~ 정규식, null/empty → 전체
 *  - category=all|null|blank → 카테고리 무필터
 *  - Loki retention 60d 라 30d 안전. 더 길게 가려면 retention 조정 필요.
 *
 * EC2 (LOKI_URL 미설정) 환경에서는 호출되지 않음. 컨트롤러가 분기.
 */
@Service
public class LokiStatsService {

    /** 기본 윈도우 — 7d. 30d 는 Loki multi-host regex 스캔이 너무 무거움
     *  (host 가 stream label 이 아닌 JSON 추출 label 이라 chunk 마다 parse).
     *  Alloy 에서 host stream-label promote 후 30d 복원 검토. */
    public static final String RANGE_30D = "7d";
    public static final String RANGE_7D = "7d";

    private final LokiClient loki;

    public LokiStatsService(LokiClient loki) { this.loki = loki; }

    public boolean isEnabled() { return loki.isEnabled(); }

    // ── selector 빌더 ─────────────────────────────────────────────────

    private String sel(List<String> domains, String category) {
        String base = (domains == null) ? loki.baseSelector(null)
                                        : loki.baseSelectorMulti(domains);
        return base + loki.catFilter(category);
    }

    // ── /me/stats/category, /admin/stats/category ─────────────────────

    public Map<String, Object> category(List<String> domains) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("malicious", 0L);
        out.put("bot",       0L);
        out.put("other_bot", 0L);
        out.put("user",      0L);
        if (domains != null && domains.isEmpty()) return out;
        Map<String, Long> agg = loki.sumByLabel("category", sel(domains, null), RANGE_30D);
        for (Map.Entry<String, Long> e : agg.entrySet()) {
            if (out.containsKey(e.getKey())) out.put(e.getKey(), e.getValue());
        }
        return out;
    }

    // ── /me/stats/daily, /admin/stats/daily ───────────────────────────

    public List<Map<String, Object>> daily(List<String> domains, String category, String billed) {
        if (domains != null && domains.isEmpty()) return List.of();
        String selector = sel(domains, category);
        if ("1".equals(billed)) selector += " | billed=`1`";
        return loki.dateBuckets(selector, 7);
    }

    // ── /me/stats/bots, /admin/stats/bots ─────────────────────────────

    public List<Map<String, Object>> bots(List<String> domains, String category, int limit) {
        if (domains != null && domains.isEmpty()) return List.of();
        String selector = sel(domains, category);
        // bot_name 우선, 없으면 bot_ua. LogQL 로는 COALESCE 어려워 bot_name 만.
        Map<String, Long> agg = loki.sumByLabel("bot_name", selector, RANGE_30D);
        return agg.entrySet().stream()
                .filter(e -> !e.getKey().isEmpty())
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .limit(Math.min(limit, 50))
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("bot_ua", e.getKey());
                    m.put("count", e.getValue());
                    return m;
                }).toList();
    }

    // ── /me/stats/purpose, /admin/stats/purpose ───────────────────────

    public List<Map<String, Object>> purpose(List<String> domains) {
        if (domains != null && domains.isEmpty()) return List.of();
        // category != user AND bot_purpose != ""
        String selector = sel(domains, null) + " | category!=`user` | bot_purpose!=``";
        Map<String, Long> agg = loki.sumByLabel("bot_purpose", selector, RANGE_30D);

        // unique_bots: count(count by (bot_name) (... | bot_purpose=`X`))
        Map<String, Long> unique = new LinkedHashMap<>();
        for (String p : agg.keySet()) {
            String selByP = selector + " | bot_purpose=`" + LokiClient.esc(p) + "`";
            Map<String, Long> bots = loki.sumByLabel("bot_name", selByP, RANGE_30D);
            unique.put(p, (long) bots.size());
        }

        return agg.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("bot_purpose", e.getKey());
                    m.put("count",       e.getValue());
                    m.put("unique_bots", unique.getOrDefault(e.getKey(), 0L));
                    return m;
                }).toList();
    }

    // ── /me/stats/malicious, /admin/stats/malicious ───────────────────

    public List<Map<String, Object>> malicious(List<String> domains) {
        if (domains != null && domains.isEmpty()) return List.of();
        String selector = sel(domains, "malicious");
        // 7d 윈도우 — sum by 2 labels 무거움, 봇 카탈로그 표시용엔 7d 충분
        return loki.sumByTwoLabels("bot_name", "bot_vendor", selector, RANGE_7D).stream()
                .sorted((a, b) -> Long.compare(toL(b.get("count")), toL(a.get("count"))))
                .limit(20)
                .toList();
    }

    // ── /me/stats/billing, /admin/stats/billing ───────────────────────

    public Map<String, Object> billing(List<String> domains) {
        Map<String, Object> empty = Map.of("total", 0L, "billed", 0L, "unit_price", 2, "estimated_amount", 0L);
        if (domains != null && domains.isEmpty()) return empty;
        String selector = sel(domains, "bot");
        long total  = loki.count(selector, RANGE_30D);
        long billed = loki.count(selector + " | billed=`1`", RANGE_30D);
        int unit = 2;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total", total);
        m.put("billed", billed);
        m.put("unit_price", unit);
        m.put("estimated_amount", billed * unit);
        return m;
    }

    // ── /me/stats/daily/bots, /admin/stats/daily/bots ─────────────────

    public List<Map<String, Object>> dailyBots(List<String> domains, String category) {
        if (domains != null && domains.isEmpty()) return List.of();
        String selector = sel(domains, category) + " | bot_name!=``";
        // dateBucketsByLabel returns {date, bot_name, count}
        return loki.dateBucketsByLabel("bot_name", selector, 7);
    }

    // ── /me/stats/hourly, /admin/stats/hourly ─────────────────────────

    public List<Map<String, Object>> hourly(List<String> domains, String date, String category) {
        if (domains != null && domains.isEmpty()) return emptyHourly();
        String selector = sel(domains, category);
        return loki.hourBuckets(selector, date);
    }

    public static List<Map<String, Object>> emptyHourly() {
        List<Map<String, Object>> out = new ArrayList<>(24);
        for (int i = 0; i < 24; i++) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("hour", String.format("%02d", i));
            m.put("count", 0L);
            out.add(m);
        }
        return out;
    }

    // ── /me/stats/pages, /admin/stats/pages ───────────────────────────

    public List<Map<String, Object>> pages(List<String> domains, String category, int limit) {
        if (domains != null && domains.isEmpty()) return List.of();
        String selector = sel(domains, category);
        Map<String, Long> agg = loki.sumByLabel("path", selector, RANGE_30D);
        return agg.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .limit(Math.min(limit, 200))
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("path", e.getKey());
                    m.put("count", e.getValue());
                    return m;
                }).toList();
    }

    // ── /me/stats/pages/bots, /admin/stats/pages/bots ─────────────────

    public List<Map<String, Object>> pageBots(List<String> domains, String path, String category) {
        if (domains != null && domains.isEmpty() || path == null) return List.of();
        String selector = sel(domains, category) + " | path=`" + LokiClient.esc(path) + "` | bot_name!=``";
        Map<String, Long> agg = loki.sumByLabel("bot_name", selector, RANGE_30D);
        return agg.entrySet().stream()
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .limit(10)
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("bot_name", e.getKey());
                    m.put("count", e.getValue());
                    return m;
                }).toList();
    }

    // ── /me/stats/bot-names, /admin/stats/bot-names ───────────────────

    public List<Map<String, Object>> botNames(List<String> domains, String purpose) {
        if (domains != null && domains.isEmpty()) return List.of();
        String selector = sel(domains, null) + " | category!=`user` | bot_name!=``";
        if (purpose != null && !purpose.isBlank()) {
            selector += " | bot_purpose=`" + LokiClient.esc(purpose) + "`";
        }
        // 7d 윈도우 — bot-names 도 sum by 2 labels 라 30d 면 ~10s. 봇 카탈로그 카운트 표시용엔 7d 충분
        return loki.sumByTwoLabels("bot_name", "bot_purpose", selector, RANGE_7D).stream()
                .sorted((a, b) -> Long.compare(toL(b.get("count")), toL(a.get("count"))))
                .toList();
    }

    // ── /me/stats/domains, /admin/stats/domains ───────────────────────

    public List<Map<String, Object>> statsDomains(List<String> domains) {
        if (domains != null && domains.isEmpty()) return List.of();
        String selector = sel(domains, null);
        Map<String, Long> agg = loki.sumByLabel("host", selector, RANGE_30D);
        return agg.entrySet().stream()
                .filter(e -> isRealDomain(e.getKey()))
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("domain", e.getKey());
                    m.put("count",  e.getValue());
                    return m;
                }).toList();
    }

    // ── /me/stats/channels, /admin/stats/channels ─────────────────────
    /**
     * channels 테이블 join 결과를 도메인 → Loki 메트릭으로 보강.
     * 입력: SQL 에서 가져온 channel row (id, name, domain, ...)
     * 출력: 동일 row + bot_total/other_bot_total/user_total/malicious_total/
     *               verified/lenient_pass/blocked/bot_types
     */
    public List<Map<String, Object>> enrichChannelStats(List<Map<String, Object>> channels) {
        List<String> domains = channels.stream()
                .map(c -> (String) c.get("domain"))
                .filter(d -> d != null && !d.isBlank())
                .toList();
        if (domains.isEmpty()) return channels;
        String base = loki.baseSelectorMulti(domains);

        // 5개 Loki 쿼리를 병렬로 실행 (직렬 1.8s → 병렬 max(~400ms))
        java.util.concurrent.CompletableFuture<List<Map<String, Object>>> fHostCat =
                java.util.concurrent.CompletableFuture.supplyAsync(() ->
                        loki.sumByTwoLabels("host", "category", base, RANGE_30D));
        java.util.concurrent.CompletableFuture<Map<String, Long>> fVerified =
                java.util.concurrent.CompletableFuture.supplyAsync(() ->
                        loki.sumByLabel("host", base + " | category=`bot` | verified=`1`", RANGE_30D));
        java.util.concurrent.CompletableFuture<Map<String, Long>> fBlocked =
                java.util.concurrent.CompletableFuture.supplyAsync(() ->
                        loki.sumByLabel("host", base + " | category=`bot` | blocked=`1`", RANGE_30D));
        java.util.concurrent.CompletableFuture<Map<String, Long>> fTotal =
                java.util.concurrent.CompletableFuture.supplyAsync(() ->
                        loki.sumByLabel("host", base + " | category=`bot`", RANGE_30D));
        java.util.concurrent.CompletableFuture<List<Map<String, Object>>> fBotTypes =
                java.util.concurrent.CompletableFuture.supplyAsync(() ->
                        loki.sumByTwoLabels("host", "bot_name",
                                base + " | category=`bot` | bot_name!=``", RANGE_30D));
        java.util.concurrent.CompletableFuture.allOf(fHostCat, fVerified, fBlocked, fTotal, fBotTypes).join();

        // host × category
        Map<String, Map<String, Long>> hostCat = new LinkedHashMap<>();
        for (Map<String, Object> r : fHostCat.join()) {
            String host = (String) r.get("host");
            String cat  = (String) r.get("category");
            long  cnt   = toL(r.get("count"));
            hostCat.computeIfAbsent(host, k -> new LinkedHashMap<>()).merge(cat, cnt, Long::sum);
        }
        Map<String, Long> verified = fVerified.join();
        Map<String, Long> blocked  = fBlocked.join();
        Map<String, Long> total    = fTotal.join();

        // bot_types: host 별 bot_name distinct count
        Map<String, Long> botTypes = new LinkedHashMap<>();
        for (Map<String, Object> r : fBotTypes.join()) {
            String host = (String) r.get("host");
            botTypes.merge(host, 1L, Long::sum);
        }

        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> c : channels) {
            String d = (String) c.get("domain");
            Map<String, Long> cat = hostCat.getOrDefault(d, Map.of());
            long bot = cat.getOrDefault("bot", 0L);
            long ob  = cat.getOrDefault("other_bot", 0L);
            long us  = cat.getOrDefault("user", 0L);
            long mal = cat.getOrDefault("malicious", 0L);
            long ver = verified.getOrDefault(d, 0L);
            long blk = blocked.getOrDefault(d, 0L);
            long tot = total.getOrDefault(d, 0L);
            long lenient = Math.max(0, tot - ver - blk);

            Map<String, Object> m = new LinkedHashMap<>(c);
            m.put("bot_total",       bot);
            m.put("other_bot_total", ob);
            m.put("user_total",      us);
            m.put("malicious_total", mal);
            m.put("verified",        ver);
            m.put("lenient_pass",    lenient);
            m.put("blocked",         blk);
            m.put("bot_types",       botTypes.getOrDefault(d, 0L));
            out.add(m);
        }
        // bot+other_bot+user DESC
        out.sort((a, b) -> Long.compare(
                toL(b.get("bot_total")) + toL(b.get("other_bot_total")) + toL(b.get("user_total")),
                toL(a.get("bot_total")) + toL(a.get("other_bot_total")) + toL(a.get("user_total"))));
        return out;
    }

    // ── utils ────────────────────────────────────────────────────────

    private static long toL(Object v) {
        if (v instanceof Number n) return n.longValue();
        return 0L;
    }

    private static boolean isRealDomain(String h) {
        return h != null && !h.isEmpty() && !h.equals("healthz")
                && !h.matches("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d+)?$");
    }
}
