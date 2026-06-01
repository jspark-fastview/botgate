package io.guardus.admin.controller;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * /internal/* — 클러스터 내부 전용. AdminAuthFilter 가 /admin/* 만 보호하므로 무인증 통과.
 * ClusterIP 로만 노출(외부 ingress 미연결). bot-ingest-adapter 가 ingest_token → channel 매핑 sync 용.
 */
@RestController
public class InternalController {

    private final JdbcTemplate db;

    public InternalController(JdbcTemplate db) {
        this.db = db;
    }

    /**
     * GET /internal/cdn-channels — CDN(integration_mode=cdn_*) 채널의 ingest_token → {domain, owner_id}.
     * adapter 가 주기 sync 하여 Logpush 요청의 Bearer 토큰을 채널로 매핑·인증한다.
     */
    @GetMapping("/internal/cdn-channels")
    public List<Map<String, Object>> cdnChannels() {
        return db.queryForList(
                "SELECT domain, domain_canonical, ingest_token, owner_id " +
                "FROM channels " +
                "WHERE integration_mode LIKE 'cdn_%' AND ingest_token IS NOT NULL AND active = 1");
    }
}
