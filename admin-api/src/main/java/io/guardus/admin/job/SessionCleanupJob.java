package io.guardus.admin.job;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 만료된 세션 일괄 정리.
 *
 * AuthController.login 의 cleanup 은 같은 user 의 expired 만 처리.
 * 다른 user 의 잔류 expired 가 쌓이면 prewarm cost / cache 분산 증가.
 * 매일 1회 글로벌 cleanup 으로 자연 정리.
 *
 * 부수효과: prewarm 이 valid session 만 보므로 expired token cache
 * miss 자동 해소.
 */
@Service
public class SessionCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(SessionCleanupJob.class);

    private final JdbcTemplate db;

    public SessionCleanupJob(JdbcTemplate db) { this.db = db; }

    /** 매일 UTC 18:30 = KST 03:30 (저트래픽 시간) */
    @Scheduled(cron = "0 30 18 * * *")
    public void cleanup() {
        try {
            int n = db.update("DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP");
            log.info("[session-cleanup] deleted {} expired rows", n);
        } catch (Exception e) {
            log.warn("[session-cleanup] failed: {}", e.getMessage());
        }
    }
}
