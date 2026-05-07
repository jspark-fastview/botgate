package io.guardus.admin.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Fires a fire-and-forget cache invalidation request to OpenResty.
 * Failures are silently ignored — OpenResty cache expires in ~60 s anyway.
 */
public final class CacheInvalidator {
    private static final Logger log = LoggerFactory.getLogger(CacheInvalidator.class);
    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();

    private CacheInvalidator() {}

    public static void invalidate() {
        String host = System.getenv().getOrDefault("OPENRESTY_HOST", "openresty");
        String port = System.getenv().getOrDefault("OPENRESTY_PORT", "80");
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("http://" + host + ":" + port + "/_internal/cache/invalidate"))
                    .GET()
                    .timeout(Duration.ofSeconds(2))
                    .build();
            CLIENT.sendAsync(req, HttpResponse.BodyHandlers.discarding())
                  .exceptionally(e -> { log.debug("[cache] invalidate error: {}", e.getMessage()); return null; });
        } catch (Exception e) {
            log.debug("[cache] invalidate failed: {}", e.getMessage());
        }
    }
}
