package io.guardus.internal.service;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 토큰 검증 결과 캐싱. @Cacheable 은 self-invocation 시 작동 X 라
 * 별도 service 로 분리하여 controller 에서 호출.
 *
 * TTL: 1m (CacheConfig). 토큰 revoke 시 최대 1분 lag.
 *
 * 빈 결과 (invalid token) 는 캐시하지 않음 — unless 절. 매번 RDS 재확인.
 * → revoke 즉시 차단 + 유효 토큰만 캐시 hit ratio ↑
 */
@Service
public class TokenLookupService {

    private final JdbcTemplate jdbc;

    public TokenLookupService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @return valid 토큰이면 {id, plan} map, invalid 면 null
     */
    @Cacheable(value = "tokens", key = "#token", unless = "#result == null")
    public Map<String, Object> findValid(String token) {
        if (token == null || token.isBlank()) return null;
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, plan FROM tokens " +
                "WHERE token = ? AND active = 1 " +
                "  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)",
                token);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
