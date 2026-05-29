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

    // initialDelay 늘림 — Loki/CoreDNS/Cilium 안정화 대기.
    // 짧으면 cold-call timeout → 빈 응답 → @Cacheable unless 가 막아주긴 하지만
    // 그래도 첫 호출에서 fresh 가 들어오게 하는 게 빠름.
    //
    // 단, admin-api 재시작 후엔 ApplicationReadyEvent 가 즉시 prewarm 1회 트리거 (onAppReady).
    // 그래서 사용자 portal 진입 시 cache 비어있는 시간 = 부팅 후 ~10초.

    /** admin-api 부팅 완료 직후 — 즉시 prewarm 1회 (Tomcat ready 시점). */
    @org.springframework.context.event.EventListener(
        org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void onAppReady() {
        // 별도 thread 로 띄움 — Spring 이 ApplicationReadyEvent 처리 차단되지 않게.
        Thread t = new Thread(() -> {
            // Tomcat / Loki client / Redis 등 안정화 5초 대기
            try { Thread.sleep(5_000L); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); return; }
            log.info("[prewarm-startup] admin-api ready → 즉시 prewarm 1회");
            runForAllSessions("startup-fast",   buildFastEndpoints());
            runForAllSessions("startup-normal", NORMAL_ENDPOINTS);
            runForAllSessions("startup-slow",   SLOW_ENDPOINTS);
            log.info("[prewarm-startup] 완료");
        }, "prewarm-startup");
        t.setDaemon(true);
        t.start();
    }

    /** 5분 cycle — initialDelay 2분 */
    @Scheduled(fixedRate = 300_000L, initialDelay = 120_000L)
    public void prewarmFast() {
        runForAllSessions("fast", buildFastEndpoints());
    }

    /** 15분 cycle — initialDelay 3분 */
    @Scheduled(fixedRate = 900_000L, initialDelay = 180_000L)
    public void prewarmNormal() {
        runForAllSessions("normal", NORMAL_ENDPOINTS);
    }

    /** 1시간 cycle — initialDelay 4분 */
    @Scheduled(fixedRate = 3_600_000L, initialDelay = 240_000L)
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

    /** prewarm self-HTTP 전용 ExecutorService — concurrency 2 제한.
     *  이전 8 → 2 로 줄임. Loki 가 7d 윈도우 무거운 query 동시 처리 시 queueTime 폭증.
     *  prewarm 은 background 라 동시성 낮춰도 OK (5분 cycle 안에 모든 호출 끝나기만 하면 됨). */
    private final java.util.concurrent.ExecutorService executor =
            java.util.concurrent.Executors.newFixedThreadPool(2,
                    r -> {
                        Thread t = new Thread(r, "prewarm");
                        t.setDaemon(true);
                        return t;
                    });

    private void runForAllSessions(String tier, List<String> endpoints) {
        long t0 = System.currentTimeMillis();
        List<Map<String, Object>> sessions;
        try {
            sessions = db.queryForList(
                    "SELECT token, user_id FROM sessions " +
                    "WHERE expires_at > CURRENT_TIMESTAMP " +
                    "ORDER BY created_at DESC LIMIT 10");
        } catch (Exception e) {
            log.warn("[prewarm-{}] sessions 조회 실패: {}", tier, e.getMessage());
            return;
        }
        if (sessions.isEmpty()) return;

        // 병렬 호출 — concurrency 8 로 admin-api thread pool 부담 적게
        java.util.concurrent.atomic.AtomicInteger ok   = new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicInteger fail = new java.util.concurrent.atomic.AtomicInteger();
        java.util.List<java.util.concurrent.CompletableFuture<Void>> futures = new java.util.ArrayList<>();
        for (Map<String, Object> s : sessions) {
            String token = (String) s.get("token");
            HttpHeaders h = new HttpHeaders();
            h.setBearerAuth(token);
            HttpEntity<Void> req = new HttpEntity<>(h);
            for (String ep : endpoints) {
                futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                    try {
                        http.exchange(selfUrl + ep, HttpMethod.GET, req, String.class);
                        ok.incrementAndGet();
                    } catch (Exception e) {
                        fail.incrementAndGet();
                    }
                }, executor));
            }
        }
        java.util.concurrent.CompletableFuture.allOf(
                futures.toArray(new java.util.concurrent.CompletableFuture[0])).join();

        long ms = System.currentTimeMillis() - t0;
        log.info("[prewarm-{}] {} users × {} eps — ok={} fail={} ({} ms, parallel)",
                tier, sessions.size(), endpoints.size(), ok.get(), fail.get(), ms);
    }

    /**
     * 로그인 직후 그 유저 token 으로 즉시 prewarm (on-demand).
     * AuthController.login 이 비동기 호출 — 사용자가 첫 화면 그릴 때 cache 이미 채워짐.
     * fast + normal + slow 모든 endpoint (portal 대시보드 전부).
     */
    public void prewarmToken(String token) {
        long t0 = System.currentTimeMillis();
        List<String> all = new java.util.ArrayList<>(buildFastEndpoints());
        all.addAll(NORMAL_ENDPOINTS);
        all.addAll(SLOW_ENDPOINTS);

        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(token);
        HttpEntity<Void> req = new HttpEntity<>(h);

        java.util.concurrent.atomic.AtomicInteger ok   = new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicInteger fail = new java.util.concurrent.atomic.AtomicInteger();
        java.util.List<java.util.concurrent.CompletableFuture<Void>> futures = new java.util.ArrayList<>();
        for (String ep : all) {
            futures.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    http.exchange(selfUrl + ep, HttpMethod.GET, req, String.class);
                    ok.incrementAndGet();
                } catch (Exception e) {
                    fail.incrementAndGet();
                }
            }, executor));
        }
        java.util.concurrent.CompletableFuture.allOf(
                futures.toArray(new java.util.concurrent.CompletableFuture[0])).join();

        long ms = System.currentTimeMillis() - t0;
        log.info("[prewarm-login] 1 user × {} eps — ok={} fail={} ({} ms)",
                all.size(), ok.get(), fail.get(), ms);
    }
}
