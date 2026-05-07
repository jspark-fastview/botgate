package io.guardus.admin.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 세션 토큰 → 사용자 검증.
 * Authorization: Bearer <token> 헤더에서 토큰을 받아 sessions + users 조인.
 */
@Service
public class SessionService {

    private final JdbcTemplate db;

    public SessionService(JdbcTemplate db) {
        this.db = db;
    }

    /**
     * @return 유효한 세션이면 사용자 Map(id, email, name, active), 아니면 null
     */
    public Map<String, Object> validate(String bearerHeader) {
        if (bearerHeader == null || bearerHeader.isBlank()) return null;
        String token = bearerHeader.replaceAll("(?i)^Bearer\\s+", "");
        if (token.isBlank()) return null;

        List<Map<String, Object>> rows = db.queryForList("""
                SELECT s.token, u.id, u.email, u.name, u.active
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > datetime('now')
                """, token);

        if (rows.isEmpty()) return null;
        Map<String, Object> row = rows.get(0);
        // active = 1 (SQLite integer)
        Object active = row.get("active");
        boolean isActive = active instanceof Number n ? n.intValue() == 1 : Boolean.TRUE.equals(active);
        return isActive ? row : null;
    }
}
