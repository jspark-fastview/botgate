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
