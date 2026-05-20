package io.guardus.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Cloudflare DNS 자동 관리.
 *
 * 채널 CRUD 시:
 *   create -> addCnameToEndpoint(domain) : CNAME domain -> guardus-endpoint.viewus.co (DNS only)
 *   delete -> deleteRecord(domain) : 같은 zone 의 record 찾아 삭제
 *
 * apex 도메인 (pikle.io 같은 경우):
 *   Cloudflare 가 CNAME at apex 자동 flatten (proxied=true 필요). 우리는 DNS only 라 일부 거부될 수 있음.
 *   거부 시 폴백: A record + 새 ALB IP (호환성 우선). 또는 사용자에게 명시.
 *
 * 환경변수 CLOUDFLARE_API_TOKEN 없으면 service 비활성 (legacy / EC2 호환).
 */
@Service
public class CloudflareDnsService {

    private static final Logger log = LoggerFactory.getLogger(CloudflareDnsService.class);
    private static final String CF_API_BASE = "https://api.cloudflare.com/client/v4";
    private static final String DEFAULT_CNAME_TARGET = "guardus-endpoint.viewus.co";

    private final String apiToken;
    private final String cnameTarget;
    private final HttpClient http;
    private final ObjectMapper json = new ObjectMapper();

    // zone 캐시 — domain registrable part -> zoneId (lookup 비용 절감)
    private final Map<String, String> zoneCache = new ConcurrentHashMap<>();

    public CloudflareDnsService(
            @Value("${CLOUDFLARE_API_TOKEN:}") String apiToken,
            @Value("${CLOUDFLARE_CNAME_TARGET:" + DEFAULT_CNAME_TARGET + "}") String cnameTarget) {
        this.apiToken = apiToken == null ? "" : apiToken.trim();
        this.cnameTarget = cnameTarget == null || cnameTarget.isBlank()
                ? DEFAULT_CNAME_TARGET : cnameTarget.trim();
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        if (this.apiToken.isEmpty()) {
            log.warn("[cloudflare] CLOUDFLARE_API_TOKEN not set — DNS auto-management disabled");
        } else {
            log.info("[cloudflare] DNS auto-management enabled, CNAME target: {}", this.cnameTarget);
        }
    }

    public boolean isEnabled() {
        return !apiToken.isEmpty();
    }

    /**
     * 채널 생성 시: domain 에 대해 CNAME -> guardus-endpoint.viewus.co 추가.
     * 이미 존재하면 skip (idempotent).
     * 실패해도 throw 안 함 — 채널 CRUD 자체는 성공 (DNS 만 별도 알림 / 재시도).
     */
    public Result addCnameToEndpoint(String domain) {
        if (!isEnabled()) return Result.disabled();
        try {
            String zoneId = findZoneId(domain);
            if (zoneId == null) return Result.error("zone not found for domain: " + domain);

            // 이미 존재 검색
            String existing = findRecordId(zoneId, domain);
            if (existing != null) {
                return Result.skipped("record already exists");
            }

            // CNAME 생성
            String body = json.writeValueAsString(Map.of(
                    "type", "CNAME",
                    "name", domain,
                    "content", cnameTarget,
                    "proxied", false,
                    "ttl", 1   // 1 = automatic (Cloudflare 자동 TTL)
            ));
            HttpResponse<String> res = post("/zones/" + zoneId + "/dns_records", body);
            if (res.statusCode() == 200 || res.statusCode() == 201) {
                log.info("[cloudflare] CNAME created: {} -> {}", domain, cnameTarget);
                return Result.ok("CNAME created");
            }
            // apex CNAME 거부될 수 있음. 일부 zone 은 거부.
            return Result.error("Cloudflare API status=" + res.statusCode() + " body=" + truncate(res.body()));
        } catch (Exception e) {
            log.error("[cloudflare] addCname fail for {}: {}", domain, e.toString());
            return Result.error("exception: " + e.getMessage());
        }
    }

    /**
     * 채널 삭제 시: domain 의 record 삭제.
     * 없으면 skip.
     */
    public Result deleteRecord(String domain) {
        if (!isEnabled()) return Result.disabled();
        try {
            String zoneId = findZoneId(domain);
            if (zoneId == null) return Result.error("zone not found for domain: " + domain);

            String recordId = findRecordId(zoneId, domain);
            if (recordId == null) return Result.skipped("record not found");

            HttpResponse<String> res = delete("/zones/" + zoneId + "/dns_records/" + recordId);
            if (res.statusCode() == 200) {
                log.info("[cloudflare] record deleted: {}", domain);
                return Result.ok("record deleted");
            }
            return Result.error("Cloudflare API status=" + res.statusCode() + " body=" + truncate(res.body()));
        } catch (Exception e) {
            log.error("[cloudflare] deleteRecord fail for {}: {}", domain, e.toString());
            return Result.error("exception: " + e.getMessage());
        }
    }

    // ── 내부 helpers ──────────────────────────────────────────────

    /** domain 의 Cloudflare zone ID. apex 부터 단계적으로 검색 (e.g. www.foo.com -> foo.com). */
    private String findZoneId(String domain) throws Exception {
        String d = domain.toLowerCase().trim();
        // www. 같은 prefix 떼고 점 단위로 truncate 하면서 zone 검색
        String candidate = d.startsWith("www.") ? d.substring(4) : d;
        while (candidate.contains(".")) {
            String cached = zoneCache.get(candidate);
            if (cached != null) return cached;
            HttpResponse<String> res = get("/zones?name=" + URLEncoder.encode(candidate, StandardCharsets.UTF_8));
            if (res.statusCode() == 200) {
                JsonNode root = json.readTree(res.body());
                JsonNode result = root.path("result");
                if (result.isArray() && result.size() > 0) {
                    String id = result.get(0).path("id").asText();
                    zoneCache.put(candidate, id);
                    return id;
                }
            }
            int dot = candidate.indexOf('.');
            if (dot < 0) break;
            candidate = candidate.substring(dot + 1);
        }
        return null;
    }

    private String findRecordId(String zoneId, String name) throws Exception {
        HttpResponse<String> res = get("/zones/" + zoneId + "/dns_records?name=" + URLEncoder.encode(name, StandardCharsets.UTF_8));
        if (res.statusCode() == 200) {
            JsonNode root = json.readTree(res.body());
            JsonNode result = root.path("result");
            if (result.isArray() && result.size() > 0) {
                return result.get(0).path("id").asText();
            }
        }
        return null;
    }

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(
                HttpRequest.newBuilder(URI.create(CF_API_BASE + path))
                        .timeout(Duration.ofSeconds(5))
                        .header("Authorization", "Bearer " + apiToken)
                        .header("Content-Type", "application/json")
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> post(String path, String body) throws Exception {
        return http.send(
                HttpRequest.newBuilder(URI.create(CF_API_BASE + path))
                        .timeout(Duration.ofSeconds(5))
                        .header("Authorization", "Bearer " + apiToken)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> delete(String path) throws Exception {
        return http.send(
                HttpRequest.newBuilder(URI.create(CF_API_BASE + path))
                        .timeout(Duration.ofSeconds(5))
                        .header("Authorization", "Bearer " + apiToken)
                        .DELETE()
                        .build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private String truncate(String s) {
        if (s == null) return "";
        return s.length() <= 300 ? s : s.substring(0, 300) + "...";
    }

    /** CRUD 결과 reporting — UI 에서 사용자에게 알림. */
    public record Result(String status, String message) {
        public static Result ok(String msg)       { return new Result("ok", msg); }
        public static Result skipped(String msg)  { return new Result("skipped", msg); }
        public static Result error(String msg)    { return new Result("error", msg); }
        public static Result disabled()           { return new Result("disabled", "Cloudflare API token not configured"); }
        public Map<String, Object> toMap() {
            Map<String, Object> m = new HashMap<>();
            m.put("status", status);
            m.put("message", message);
            return m;
        }
    }
}
