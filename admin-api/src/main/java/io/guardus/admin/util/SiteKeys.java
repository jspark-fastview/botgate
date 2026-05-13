package io.guardus.admin.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Site API key 생성/해시.
 *
 * 형식: gk_live_<32 random base62>
 * 저장: 평문 X — sha256 hex 만 DB 에 저장
 * 노출: 발급 시점 한 번만 사용자에게 평문 반환 (Stripe 패턴)
 */
public final class SiteKeys {
    private SiteKeys() {}

    public static String generate() {
        return "gk_live_" + NanoId.generate(32);
    }

    public static String hash(String plain) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(plain.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);   // SHA-256 없는 JVM 은 없음
        }
    }

    /** 외부에서 받은 key 와 DB 의 hash 비교. timing-safe. */
    public static boolean matches(String plain, String hash) {
        if (plain == null || hash == null) return false;
        return MessageDigest.isEqual(
                hash(plain).getBytes(StandardCharsets.UTF_8),
                hash.getBytes(StandardCharsets.UTF_8));
    }
}
