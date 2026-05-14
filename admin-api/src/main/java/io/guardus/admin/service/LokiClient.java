package io.guardus.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Loki HTTP API 클라이언트. LogQL 쿼리 → 결과.
 *
 * EC2 환경: LOKI_URL 미설정 → 모든 쿼리 빈 결과 반환 (SQL access_logs 동작에 영향 X).
 * K8s 환경: LOKI_URL=http://loki.monitoring.svc:3100 로 설정 (deployment env 에서).
 */
@Service
public class LokiClient {

    private final String baseUrl;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public LokiClient(@Value("${loki.url:}") String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public boolean isEnabled() { return baseUrl != null && !baseUrl.isBlank(); }

    // ──────────────────────────────────────────────────────────────────
    // Stats helpers — admin-api 통계 컨트롤러용 LogQL 빌더 + 실행
    // 기본 selector: {namespace="guardus", app="openresty"} | json | __error__=``
    // ──────────────────────────────────────────────────────────────────

    /** 공통 base selector. domain != null 이면 host 필터 추가 */
    public String baseSelector(String domain) {
        String hostFilter = (domain != null && !domain.isBlank())
                ? " | host=`" + esc(domain) + "`" : "";
        return "{namespace=\"guardus\", app=\"openresty\"} | json | __error__=``" + hostFilter;
    }

    /** 여러 도메인을 host=~ 정규식으로 묶음. 비어있으면 매치 0 인 selector */
    public String baseSelectorMulti(List<String> domains) {
        if (domains == null || domains.isEmpty()) {
            return "{namespace=\"guardus\", app=\"openresty\"} | host=`__NONE__`"; // 매치 0
        }
        String regex = String.join("|", domains.stream().map(LokiClient::esc).toList());
        return "{namespace=\"guardus\", app=\"openresty\"} | json | __error__=`` | host=~`" + regex + "`";
    }

    /** category line filter (all/null/blank → 빈 문자열) */
    public String catFilter(String category) {
        if (category == null || category.isBlank() || "all".equals(category)) return "";
        return " | category=`" + esc(category) + "`";
    }

    /** 단일 selector 의 총 카운트 */
    public long count(String selector, String range) {
        if (!isEnabled()) return 0;
        String logql = "sum(count_over_time(" + selector + " [" + range + "]))";
        for (Map<String, Object> r : instantQuery(logql)) {
            return ((Number) r.getOrDefault("value", 0)).longValue();
        }
        return 0;
    }

    /** sum by (label) — label 별 카운트 */
    public Map<String, Long> sumByLabel(String label, String selector, String range) {
        if (!isEnabled()) return Map.of();
        String logql = "sum by (" + label + ") (count_over_time(" + selector + " [" + range + "]))";
        Map<String, Long> out = new LinkedHashMap<>();
        for (Map<String, Object> r : instantQuery(logql)) {
            @SuppressWarnings("unchecked")
            Map<String, String> lbl = (Map<String, String>) r.get("labels");
            String key = lbl.getOrDefault(label, "");
            long n = ((Number) r.getOrDefault("value", 0)).longValue();
            out.merge(key, n, Long::sum);
        }
        return out;
    }

    /** sum by (a, b) — 2-label 그룹 카운트. key = a + "|" + b */
    public List<Map<String, Object>> sumByTwoLabels(String labelA, String labelB,
                                                    String selector, String range) {
        if (!isEnabled()) return List.of();
        String logql = "sum by (" + labelA + ", " + labelB + ") (count_over_time(" + selector + " [" + range + "]))";
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : instantQuery(logql)) {
            @SuppressWarnings("unchecked")
            Map<String, String> lbl = (Map<String, String>) r.get("labels");
            Map<String, Object> row = new LinkedHashMap<>();
            row.put(labelA, lbl.getOrDefault(labelA, ""));
            row.put(labelB, lbl.getOrDefault(labelB, ""));
            row.put("count", ((Number) r.getOrDefault("value", 0)).longValue());
            out.add(row);
        }
        return out;
    }

    /** 일별 카운트 (최근 N 일). [{date: "YYYY-MM-DD", count: N}, ...] DESC */
    public List<Map<String, Object>> dateBuckets(String selector, int days) {
        if (!isEnabled()) return List.of();
        // [5m]/step=5m → Java 에서 date 별 합산. step=1d 는 split 경계로 0 나옴
        String logql = "sum(count_over_time(" + selector + " [5m]))";
        Map<String, Long> agg = new LinkedHashMap<>();
        for (Map<String, Object> r : rangeQuery(logql, Duration.ofDays(days), "5m")) {
            @SuppressWarnings("unchecked")
            List<double[]> series = (List<double[]>) r.get("series");
            if (series == null) continue;
            for (double[] p : series) {
                String date = Instant.ofEpochSecond((long) p[0])
                        .atZone(java.time.ZoneOffset.UTC).toLocalDate().toString();
                agg.merge(date, (long) p[1], Long::sum);
            }
        }
        return agg.entrySet().stream()
                .sorted((a, b) -> b.getKey().compareTo(a.getKey()))
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("date", e.getKey());
                    m.put("count", e.getValue());
                    return m;
                }).toList();
    }

    /** 시간별 카운트 (특정 date). [{hour: "HH", count: N} ...24] ASC */
    public List<Map<String, Object>> hourBuckets(String selector, String date) {
        List<Map<String, Object>> out = new ArrayList<>(24);
        for (int i = 0; i < 24; i++) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("hour", String.format("%02d", i));
            m.put("count", 0L);
            out.add(m);
        }
        if (!isEnabled() || date == null || !date.matches("\\d{4}-\\d{2}-\\d{2}")) return out;

        // date 가 오늘이면 since=현재까지, 과거면 24h 윈도우
        java.time.LocalDate target = java.time.LocalDate.parse(date);
        java.time.LocalDate todayUtc = java.time.LocalDate.now(java.time.ZoneOffset.UTC);
        long endMs, startMs;
        if (target.equals(todayUtc)) {
            endMs   = Instant.now().toEpochMilli();
            startMs = target.atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli();
        } else {
            startMs = target.atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli();
            endMs   = startMs + 86_400_000L;
        }
        String logql = "sum(count_over_time(" + selector + " [5m]))";
        String path = "/loki/api/v1/query_range?query=" + enc(logql)
                + "&start=" + (startMs * 1_000_000L)
                + "&end="   + (endMs   * 1_000_000L)
                + "&step=5m";
        for (Map<String, Object> r : query(path)) {
            @SuppressWarnings("unchecked")
            List<double[]> series = (List<double[]>) r.get("series");
            if (series == null) continue;
            for (double[] p : series) {
                int h = Instant.ofEpochSecond((long) p[0])
                        .atZone(java.time.ZoneOffset.UTC).getHour();
                if (h < 0 || h >= 24) continue;
                Long cur = (Long) out.get(h).get("count");
                out.get(h).put("count", cur + (long) p[1]);
            }
        }
        return out;
    }

    /** 일별 + label (예: bot_name) 그룹 카운트 — daily/bots 용 */
    public List<Map<String, Object>> dateBucketsByLabel(String label, String selector, int days) {
        if (!isEnabled()) return List.of();
        String logql = "sum by (" + label + ") (count_over_time(" + selector + " [5m]))";
        // key = date|labelValue → count
        Map<String, Long> agg = new LinkedHashMap<>();
        for (Map<String, Object> r : rangeQuery(logql, Duration.ofDays(days), "5m")) {
            @SuppressWarnings("unchecked")
            Map<String, String> lbl = (Map<String, String>) r.get("labels");
            String v = lbl.getOrDefault(label, "");
            @SuppressWarnings("unchecked")
            List<double[]> series = (List<double[]>) r.get("series");
            if (series == null) continue;
            for (double[] p : series) {
                String date = Instant.ofEpochSecond((long) p[0])
                        .atZone(java.time.ZoneOffset.UTC).toLocalDate().toString();
                agg.merge(date + "|" + v, (long) p[1], Long::sum);
            }
        }
        return agg.entrySet().stream()
                .sorted((a, b) -> a.getKey().compareTo(b.getKey()))
                .map(e -> {
                    String[] parts = e.getKey().split("\\|", 2);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("date", parts[0]);
                    m.put(label, parts.length > 1 ? parts[1] : "");
                    m.put("count", e.getValue());
                    return m;
                }).toList();
    }

    /** LogQL 백틱 안에 들어가는 값 escape (백틱과 백슬래시 제거) */
    public static String esc(String s) {
        if (s == null) return "";
        return s.replace("`", "").replace("\\", "");
    }

    /**
     * Instant query — 한 시점의 집계값 (vector). 예: topk, sum.
     * @param logql  LogQL 표현식
     * @return       result rows. 빈 list 면 데이터 없거나 비활성.
     */
    public List<Map<String, Object>> instantQuery(String logql) {
        if (!isEnabled()) return List.of();
        return query("/loki/api/v1/query?query=" + enc(logql));
    }

    /**
     * Range query — 시간 윈도우에 걸친 시계열.
     * @param logql  LogQL
     * @param since  지금부터 이 기간 (예: Duration.ofHours(24))
     * @param step   샘플 간격 (예: "1h", "1m")
     */
    public List<Map<String, Object>> rangeQuery(String logql, Duration since, String step) {
        if (!isEnabled()) return List.of();
        long end   = Instant.now().toEpochMilli() * 1_000_000L;
        long start = (Instant.now().toEpochMilli() - since.toMillis()) * 1_000_000L;
        String path = "/loki/api/v1/query_range?query=" + enc(logql)
                + "&start=" + start + "&end=" + end + "&step=" + enc(step);
        return query(path);
    }

    /**
     * 결과를 [{metric: {labels...}, value: number} ...] 형태로 평탄화.
     * vector (instant): values 단일.
     * matrix (range): values 시계열 list — 호출자가 sum 등 처리.
     */
    private List<Map<String, Object>> query(String path) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + path))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) return List.of();
            JsonNode root = mapper.readTree(res.body());
            if (!"success".equals(root.path("status").asText())) return List.of();

            JsonNode data    = root.path("data");
            String resultType = data.path("resultType").asText();
            JsonNode result  = data.path("result");
            List<Map<String, Object>> out = new ArrayList<>();
            for (JsonNode row : result) {
                Map<String, Object> entry = new LinkedHashMap<>();
                Map<String, String> labels = new LinkedHashMap<>();
                row.path("metric").fields().forEachRemaining(e -> labels.put(e.getKey(), e.getValue().asText()));
                entry.put("labels", labels);

                if ("vector".equals(resultType)) {
                    // [ts, "value"]
                    JsonNode v = row.path("value");
                    if (v.isArray() && v.size() >= 2) {
                        entry.put("value", parseDouble(v.get(1).asText()));
                    }
                } else {
                    // matrix: values=[[ts, "v"], ...]
                    List<double[]> series = new ArrayList<>();
                    for (JsonNode v : row.path("values")) {
                        if (v.isArray() && v.size() >= 2) {
                            series.add(new double[]{ v.get(0).asDouble(), parseDouble(v.get(1).asText()) });
                        }
                    }
                    entry.put("series", series);
                }
                out.add(entry);
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    private static double parseDouble(String s) {
        try { return Double.parseDouble(s); } catch (Exception e) { return 0; }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
