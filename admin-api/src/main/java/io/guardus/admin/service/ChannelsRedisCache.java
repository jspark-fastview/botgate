package io.guardus.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * OpenResty 가 직접 GET 할 수 있도록 channels JSON 을 Redis 에 영구 저장.
 *
 * 목적: admin-api 가 죽어도 OpenResty 가 새 pod cold start 시 Redis 에서
 * channels 받음 → admin-api 결합도 분리.
 *
 * 동기화 시점:
 *  1) admin-api 시작 직후 (PostConstruct)
 *  2) 5분마다 (drift 방지)
 *  3) 채널 CRUD 직후 (ChannelAdminController / UserController 가 sync() 호출)
 *
 * Key: guardus:channels:json
 *   value = JSON array (예: [{"id":"ch_x", "domain":"...", "upstream":"...", ...}])
 *   TTL 없음 — 영구 보존. 변경 시 덮어쓰기.
 */
@Service
@ConditionalOnProperty(prefix = "guardus.redis", name = "enabled", havingValue = "true")
public class ChannelsRedisCache {

    private static final Logger log = LoggerFactory.getLogger(ChannelsRedisCache.class);
    public static final String KEY = "guardus:channels:json";

    private final JdbcTemplate db;
    private final StringRedisTemplate redis;
    private final ObjectMapper json = new ObjectMapper();

    public ChannelsRedisCache(JdbcTemplate db, StringRedisTemplate redis) {
        this.db = db;
        this.redis = redis;
    }

    @PostConstruct
    public void onStartup() {
        // app 부팅 직후 1회 sync — RDS 가 살아있으면 Redis 채움
        try { sync(); } catch (Exception e) { log.warn("[channels-redis] startup sync fail: {}", e.getMessage()); }
    }

    /** 5분마다 drift 검증 — RDS 값으로 Redis 덮어쓰기 */
    @Scheduled(fixedRate = 300_000L, initialDelay = 300_000L)
    public void scheduled() {
        try { sync(); } catch (Exception e) { log.warn("[channels-redis] scheduled sync fail: {}", e.getMessage()); }
    }

    /**
     * RDS channels → Redis JSON.
     * OpenResty 가 같은 format 으로 사용. /admin/channels GET 응답 형식과 동일.
     */
    public synchronized void sync() {
        List<Map<String, Object>> rows = db.queryForList(
                "SELECT id, name, domain, domain_canonical, upstream, active, owner_id, " +
                "  site_key_hash, verify_token, verified_at, verification_method, integration_mode " +
                "FROM channels WHERE active = 1");
        try {
            String payload = json.writeValueAsString(rows);
            redis.opsForValue().set(KEY, payload);
            log.info("[channels-redis] synced {} channels ({} bytes)", rows.size(), payload.length());
        } catch (Exception e) {
            log.warn("[channels-redis] serialize/set fail: {}", e.getMessage());
        }
    }
}
