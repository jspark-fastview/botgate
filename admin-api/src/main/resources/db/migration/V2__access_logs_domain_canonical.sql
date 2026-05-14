-- 2026-05-14: access_logs.domain_canonical 컬럼 추가
-- 누락된 컬럼 — internal-api 의 logger.access INSERT 가 사용하는데 V1 에 없어
-- "column domain_canonical does not exist" 500 에러 발생.
-- SQLite 시절 Phase 3.5 에서 추가했던 컬럼인데 Postgres 포팅 시 빠짐.
--
-- apex/www 매칭용 (예: www.pure-beef.kr → pure-beef.kr).
-- access_logs 자체는 Loki 로 대체 예정 (Phase 3c) 이지만 그때까지는 RDS 도 채움.

ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS domain_canonical TEXT;
CREATE INDEX IF NOT EXISTS idx_access_logs_domain_canonical ON access_logs(domain_canonical);
