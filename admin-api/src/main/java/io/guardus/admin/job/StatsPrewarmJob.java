package io.guardus.admin.job;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

/**
 * Stats 캐시 prewarm — 서비스별 차등 cycle.
 *
 * 1) Fast (5분) — 자주 바뀌는 값. KPI 카드 / 시간별 차트 / 일별 추이
 * 2) Normal (15분) — 봇 종류 / 경로 / 도메인 / 빌링 / purpose
 * 3) Slow (1시간) — 누적 통계 / 채널 메타 / 글로벌 설정 / DNS
 *
 * 실시간 트래픽 (/me/logs) 만 prewarm 제외 — 매 호출 fresh.
 *
 * GUARDUS_PREWARM_ENABLED=true (K8s 만) 에서 활성.
 */
@Service
@ConditionalOnProperty(prefix = "guardus.prewarm", name = "enabled", havingValue = "true")
public class StatsPrewarmJob {

    private static final Logger log = LoggerFactory.getLogger(StatsPrewarmJob.class);

    /** 5분 cycle — 자주 바뀌는 KPI / 차트 */
    private static final List<String> FAST_ENDPOINTS = List.of(
            "/me/stats/category",
            "/me/stats/channels",
            "/me/stats/daily?category=bot",
            "/me/stats/daily?category=user",
            "/me/stats/daily/bots"
            // hourly 는 prewarm 시점에 date 동적으로 추가
    );

    /** 15분 cycle — 누적 / 분류 */
    private static final List<String> NORMAL_ENDPOINTS = List.of(
            "/me/stats/bots?category=bot",
            "/me/stats/bots?category=other_bot",
            "/me/stats/pages?category=bot",
            "/me/stats/pages?category=other_bot",
            "/me/stats/billing",
            "/me/stats/domains",
            "/me/stats/purpose"
    );

    /** 1시간 cycle — 거의 안 변하는 메타 / 카탈로그 */
    private static final List<String> SLOW_ENDPOINTS = List.of(
            "/me/channels",
            "/me/stats/malicious",
            "/me/stats/bot-names",
            "/me/channels/dns-status",
            "/me/path-rules",
            "/me/purpose-policies",
            "/me/bot-catalog",
            "/me/tokens"
    );

    private final JdbcTemplate db;
    private final RestTemplate http;
    private final String selfUrl;

    public StatsPrewarmJob(JdbcTemplate db,
                           @Value("${server.port:3002}") String port) {
        this.db = db;
        this.selfUrl = "http://localhost:" + port;
        org.springframework.http.client.SimpleClientHttpRequestFactory rf =
                new org.springframework.http.client.SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(30).toMillis());
        this.http = new RestTemplate(rf);
    }

    /** 5분 — initialDelay 30s */
    @Scheduled(fixedRate = 300_000L, initialDelay = 30_000L)
    public void prewarmFast() {
        runForAllSessions("fast", buildFastEndpoints());
    }

    /** 15분 — initialDelay 60s */
    @Scheduled(fixedRate = 900_000L, initialDelay = 60_000L)
    public void prewarmNormal() {
        runForAllSessions("normal", NORMAL_ENDPOINTS);
    }

    /** 1시간 — initialDelay 90s */
    @Scheduled(fixedRate = 3_600_000L, initialDelay = 90_000L)
    public void prewarmSlow() {
        runForAllSessions("slow", SLOW_ENDPOINTS);
    }

    /** Fast endpoints + 동적 hourly?date=today (UTC) */
    private List<String> buildFastEndpoints() {
        String today = LocalDate.now(ZoneOffset.UTC).toString();
        List<String> all = new java.util.ArrayList<>(FAST_ENDPOINTS);
        all.add("/me/stats/hourly?date=" + today + "&category=bot");
        all.add("/me/stats/hourly?date=" + today + "&category=user");
        return all;
    }

    private void runForAllSessions(String tier, List<String> endpoints) {
        long t0 = System.currentTimeMillis();
        List<Map<String, Object>> sessions;
        try {
            sessions = db.queryForList(
                    "SELECT DISTINCT ON (user_id) token, user_id " +
                    "FROM sessions WHERE expires_at > CURRENT_TIMESTAMP " +
                    "ORDER BY user_id, created_at DESC");
        } catch (Exception e) {
            log.warn("[prewarm-{}] sessions 조회 실패: {}", tier, e.getMessage());
            return;
        }
        if (sessions.isEmpty()) return;

        int ok = 0, fail = 0;
        for (Map<String, Object> s : sessions) {
            String token = (String) s.get("token");
            HttpHeaders h = new HttpHeaders();
            h.setBearerAuth(token);
            HttpEntity<Void> req = new HttpEntity<>(h);
            for (String ep : endpoints) {
                try {
                    http.exchange(selfUrl + ep, HttpMethod.GET, req, String.class);
                    ok++;
                } catch (Exception e) {
                    fail++;
                }
            }
        }
        long ms = System.currentTimeMillis() - t0;
        log.info("[prewarm-{}] {} users × {} eps — ok={} fail={} ({} ms)",
                tier, sessions.size(), endpoints.size(), ok, fail, ms);
    }
}
