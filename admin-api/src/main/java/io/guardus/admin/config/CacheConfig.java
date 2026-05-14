package io.guardus.admin.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Cache 구성 — Redis 우선, 없으면 Caffeine fallback.
 *
 * 캐시 이름별 TTL:
 *  - stats     : 30s  (집계 결과)
 *  - sessions  : 5m   (어드민 세션 검증 — RDS hit 제거)
 *  - tokens    : 1m   (예약. internal-api 가 추후 사용)
 *
 * 환경 분기:
 *  - K8s: SPRING_DATA_REDIS_URL 설정 + GUARDUS_REDIS_ENABLED=true → RedisCacheManager
 *  - EC2: GUARDUS_REDIS_ENABLED 비설정/false → CaffeineCacheManager (단일 pod 충분)
 */
@Configuration
@EnableCaching
@EnableScheduling
public class CacheConfig {

    /**
     * Redis CacheManager — guardus.redis.enabled=true 이고 RedisConnectionFactory 있을 때만 활성.
     * Spring auto-config 가 spring.data.redis.url 로 LettuceConnectionFactory 자동 생성.
     */
    @Bean
    @ConditionalOnProperty(prefix = "guardus.redis", name = "enabled", havingValue = "true")
    public CacheManager redisCacheManager(RedisConnectionFactory cf) {
        RedisCacheConfiguration base = RedisCacheConfiguration.defaultCacheConfig()
                .disableCachingNullValues()
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer()))
                .prefixCacheNameWith("guardus:");

        Map<String, RedisCacheConfiguration> perCache = new HashMap<>();
        perCache.put("stats",    base.entryTtl(Duration.ofSeconds(30)));
        perCache.put("sessions", base.entryTtl(Duration.ofMinutes(5)));
        perCache.put("tokens",   base.entryTtl(Duration.ofMinutes(1)));

        return RedisCacheManager.builder(cf)
                .cacheDefaults(base.entryTtl(Duration.ofSeconds(30)))
                .withInitialCacheConfigurations(perCache)
                .build();
    }

    /**
     * Caffeine fallback — Redis 빈 없을 때 (EC2 환경 or Redis 비활성).
     */
    @Bean
    @ConditionalOnMissingBean(CacheManager.class)
    public CacheManager caffeineCacheManager() {
        CaffeineCacheManager mgr = new CaffeineCacheManager("stats", "sessions", "tokens");
        mgr.setCaffeine(Caffeine.newBuilder()
                .expireAfterWrite(30, TimeUnit.SECONDS)
                .maximumSize(2000));
        return mgr;
    }
}
