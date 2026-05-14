package io.guardus.admin.service;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 세션 토큰 → 사용자 검증.
 * Authorization: Bearer <token> 헤더에서 토큰을 받아 sessions + users 조인.
 *
 * 캐시: "sessions" (TTL 5m) — 매 /me/* 요청에서 RDS hit 제거.
 * 로그아웃 시 AuthController 가 invalidate(token) 호출하여 캐시도 무효화 (필수).
 */
@Service
public class SessionService {

    private final JdbcTemplate db;

    public SessionService(JdbcTemplate db) {
        this.db = db;
    }

    /**
     * @return 유효한 세션이면 사용자 Map(id, email, name, active), 아니면 null
     *
     * unless="#result == null" : 미인증 / 만료 케이스는 캐시하지 않음 (만료 직후 즉시 재검증).
     * key: Bearer prefix 제거한 raw token (헤더 형식 변형으로 키 충돌 회피)
     */
    @Cacheable(value = "sessions", key = "T(io.guardus.admin.service.SessionService).keyOf(#bearerHeader)",
               unless = "#result == null")
    public Map<String, Object> validate(String bearerHeader) {
        String token = keyOf(bearerHeader);
        if (token == null) return null;

        List<Map<String, Object>> rows = db.queryForList("""
                SELECT s.token, u.id, u.email, u.name, u.active
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
                """, token);

        if (rows.isEmpty()) return null;
        Map<String, Object> row = rows.get(0);
        // active = 1 (SQLite integer) or true (Postgres boolean)
        Object active = row.get("active");
        boolean isActive = active instanceof Number n ? n.intValue() == 1 : Boolean.TRUE.equals(active);
        return isActive ? row : null;
    }

    /** 로그아웃 시 호출 — 캐시에서 즉시 제거 */
    @CacheEvict(value = "sessions", key = "T(io.guardus.admin.service.SessionService).keyOf(#bearerHeader)")
    public void invalidate(String bearerHeader) {
        // DB 의 sessions row 삭제는 AuthController 가 별도 수행
    }

    /** Bearer prefix 제거. null/blank → null */
    public static String keyOf(String bearerHeader) {
        if (bearerHeader == null || bearerHeader.isBlank()) return null;
        String t = bearerHeader.replaceAll("(?i)^Bearer\\s+", "");
        return t.isBlank() ? null : t;
    }
}
