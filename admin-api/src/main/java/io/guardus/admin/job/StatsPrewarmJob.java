package io.guardus.admin.job;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Stats 캐시 prewarm — 사용자 cache miss latency 제거.
 *
 * 1시간마다 valid session 각각으로 자주 호출되는 stats endpoint 들을
 * self-HTTP 호출 → controller @Cacheable 가 결과 Redis 에 채움.
 * TTL 70m (1h cycle + 10m 안전마진) 이라 사용자는 항상 cache hit.
 *
 * GUARDUS_PREWARM_ENABLED=true (기본 K8s 만) 에서 활성.
 */
@Service
@ConditionalOnProperty(prefix = "guardus.prewarm", name = "enabled", havingValue = "true")
public class StatsPrewarmJob {

    private static final Logger log = LoggerFactory.getLogger(StatsPrewarmJob.class);

    /** prewarm 대상 /me/* endpoints */
    private static final List<String> ENDPOINTS = List.of(
            "/me/channels",
            "/me/stats/channels",
            "/me/stats/category",
            "/me/stats/domains",
            "/me/stats/billing",
            "/me/stats/purpose",
            "/me/stats/malicious",
            "/me/stats/bot-names",
            "/me/stats/bots?category=bot",
            "/me/stats/bots?category=other_bot",
            "/me/stats/daily?category=bot",
            "/me/stats/daily?category=user",
            "/me/stats/daily/bots",
            "/me/stats/pages?category=bot",
            "/me/channels/dns-status"
    );

    private final JdbcTemplate db;
    private final RestTemplate http;
    private final String selfUrl;

    public StatsPrewarmJob(JdbcTemplate db,
                           @Value("${server.port:3002}") String port) {
        this.db = db;
        this.selfUrl = "http://localhost:" + port;
        // 짧은 timeout — prewarm 이 admin-api 자체 지연 유발 방지
        org.springframework.http.client.SimpleClientHttpRequestFactory rf =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(30).toMillis());
        this.http = new RestTemplate(rf);
    }

    /** 1시간 마다. 시작 후 30s 대기 (app 부팅 직후 부하 회피) */
    @Scheduled(fixedRate = 3_600_000L, initialDelay = 30_000L)
    public void prewarm() {
        long t0 = System.currentTimeMillis();
        List<Map<String, Object>> sessions;
        try {
            // valid session 중 user 별 가장 최근 1개씩 (multi-user 대비)
            sessions = db.queryForList(
                    "SELECT DISTINCT ON (user_id) token, user_id " +
                    "FROM sessions WHERE expires_at > CURRENT_TIMESTAMP " +
                    "ORDER BY user_id, created_at DESC");
        } catch (Exception e) {
            log.warn("[prewarm] sessions 조회 실패: {}", e.getMessage());
            return;
        }
        if (sessions.isEmpty()) {
            log.info("[prewarm] valid session 없음 — skip");
            return;
        }

        int ok = 0, fail = 0;
        for (Map<String, Object> s : sessions) {
            String token = (String) s.get("token");
            HttpHeaders h = new HttpHeaders();
            h.setBearerAuth(token);
            HttpEntity<Void> req = new HttpEntity<>(h);
            for (String ep : ENDPOINTS) {
                try {
                    http.exchange(selfUrl + ep, HttpMethod.GET, req, String.class);
                    ok++;
                } catch (Exception e) {
                    fail++;
                }
            }
        }
        long ms = System.currentTimeMillis() - t0;
        log.info("[prewarm] {} users × {} endpoints — ok={} fail={} ({} ms)",
                sessions.size(), ENDPOINTS.size(), ok, fail, ms);
    }
}
