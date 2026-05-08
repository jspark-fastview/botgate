package io.guardus.admin.job;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 90일 초과 access_logs 를 access_logs_archive 로 이관 후 원본에서 삭제.
 * 매일 새벽 3:30 KST 실행.
 *
 * - 보존 기간 변경: RETENTION_DAYS 상수
 * - 한 번에 옮기는 청크 크기: BATCH_LIMIT (lock 시간 제한용)
 */
@Component
public class AccessLogArchiveJob {

    private static final Logger LOG = LoggerFactory.getLogger(AccessLogArchiveJob.class);
    private static final int RETENTION_DAYS = 90;
    private static final int BATCH_LIMIT    = 50000;

    private final JdbcTemplate db;

    public AccessLogArchiveJob(JdbcTemplate db) {
        this.db = db;
    }

    /** 매일 03:30 (KST) — UTC 18:30 — 새벽 트래픽 가장 적을 때 */
    @Scheduled(cron = "0 30 18 * * *")
    public void archive() {
        try {
            ensureArchiveTable();

            int totalMoved = 0;
            while (true) {
                int moved = archiveBatch();
                if (moved == 0) break;
                totalMoved += moved;
                if (totalMoved >= 1_000_000) break; // 안전 한도
            }
            if (totalMoved > 0) {
                LOG.info("[archive] {} 행 이관 완료 (보존 {}일)", totalMoved, RETENTION_DAYS);
                db.execute("PRAGMA wal_checkpoint(FULL)");
            }
        } catch (Exception e) {
            LOG.error("[archive] 실패: {}", e.getMessage(), e);
        }
    }

    /** 같은 schema 의 archive 테이블 생성 (id를 INTEGER PRIMARY KEY 그대로 유지) */
    private void ensureArchiveTable() {
        db.execute("""
                CREATE TABLE IF NOT EXISTS access_logs_archive AS
                SELECT * FROM access_logs WHERE 0
                """);
        db.execute("""
                CREATE INDEX IF NOT EXISTS idx_access_logs_archive_domain_ts
                ON access_logs_archive(domain, ts)
                """);
    }

    /** 청크 단위 이관: BATCH_LIMIT 행씩, 트랜잭션으로 INSERT+DELETE */
    private int archiveBatch() {
        Long maxId = db.queryForObject(
                "SELECT MAX(id) FROM (SELECT id FROM access_logs " +
                "WHERE ts < datetime('now', '-" + RETENTION_DAYS + " days') " +
                "ORDER BY id LIMIT " + BATCH_LIMIT + ")",
                Long.class);
        if (maxId == null) return 0;

        int inserted = db.update(
                "INSERT INTO access_logs_archive SELECT * FROM access_logs WHERE id <= ?",
                maxId);
        if (inserted > 0) {
            db.update("DELETE FROM access_logs WHERE id <= ?", maxId);
        }
        return inserted;
    }
}
