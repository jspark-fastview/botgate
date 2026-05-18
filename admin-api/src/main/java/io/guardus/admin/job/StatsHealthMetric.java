package io.guardus.admin.job;

import io.guardus.admin.service.LokiStatsService;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Stats 응답 건강성 metric — Prometheus 가 scrape.
 *
 * 의도: portal /me/stats/* 가 0/empty 응답을 70m 캐시하는 negative caching 사고를
 *      "사용자 발견 전" 에 잡아내기 위함.
 *
 * 측정값:
 *   - guardus.stats.category.sum  : 전체 4-way 합 (24h, 도메인 필터 없음).
 *     정상이면 수만~수십만. 0 이 10분 지속되면 alert (PrometheusRule 참조).
 *   - guardus.stats.category.user/bot/other/malicious : 카테고리 별
 *
 * 1분 cycle — Spring @Scheduled. 부담 작음 (Loki cache hit 면 ~0.04s).
 */
@Component
@ConditionalOnProperty(prefix = "guardus.health-metric", name = "enabled", havingValue = "true", matchIfMissing = true)
public class StatsHealthMetric {

    private static final Logger log = LoggerFactory.getLogger(StatsHealthMetric.class);

    private final LokiStatsService lokiStats;
    private final AtomicLong sumTotal     = new AtomicLong(0);
    private final AtomicLong sumUser      = new AtomicLong(0);
    private final AtomicLong sumBot       = new AtomicLong(0);
    private final AtomicLong sumOtherBot  = new AtomicLong(0);
    private final AtomicLong sumMalicious = new AtomicLong(0);
    private final AtomicLong lastError    = new AtomicLong(0);   // 0 = ok, 1 = err

    public StatsHealthMetric(LokiStatsService lokiStats, MeterRegistry registry) {
        this.lokiStats = lokiStats;
        // gauge — Prometheus 가 scrape 시 현재 AtomicLong 값을 읽음
        registry.gauge("guardus.stats.category.sum",        sumTotal);
        registry.gauge("guardus.stats.category.user",       sumUser);
        registry.gauge("guardus.stats.category.bot",        sumBot);
        registry.gauge("guardus.stats.category.other_bot",  sumOtherBot);
        registry.gauge("guardus.stats.category.malicious",  sumMalicious);
        registry.gauge("guardus.stats.health.error",        lastError);
    }

    /** 1분마다 — Loki 부하 미미 (cache hit 면 ~ms) */
    @Scheduled(fixedRate = 60_000L, initialDelay = 60_000L)
    public void measure() {
        if (!lokiStats.isEnabled()) return;
        try {
            Map<String, Object> r = lokiStats.category(null);   // 전체 (도메인 무관)
            long user      = longOf(r.get("user"));
            long bot       = longOf(r.get("bot"));
            long otherBot  = longOf(r.get("other_bot"));
            long malicious = longOf(r.get("malicious"));
            long total     = user + bot + otherBot + malicious;
            sumUser.set(user);
            sumBot.set(bot);
            sumOtherBot.set(otherBot);
            sumMalicious.set(malicious);
            sumTotal.set(total);
            lastError.set(0);
        } catch (Exception e) {
            // 측정 실패 — alert 용 별도 gauge
            lastError.set(1);
            log.warn("[stats-health] measure 실패: {}", e.getMessage());
        }
    }

    private static long longOf(Object o) {
        return (o instanceof Number n) ? n.longValue() : 0L;
    }
}
