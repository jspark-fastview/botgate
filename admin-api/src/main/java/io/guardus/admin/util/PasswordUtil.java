package io.guardus.admin.util;

import org.bouncycastle.crypto.generators.SCrypt;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;

/**
 * scrypt 패스워드 해시 유틸 — Node.js crypto.scrypt 기본값(N=16384,r=8,p=1) 과 호환.
 *
 * Node.js 저장 포맷:
 *   salt  = randomBytes(16).toString('hex')   →  32자 소문자 hex 문자열
 *   hash  = scrypt(pw, salt_string, 64)       →  scrypt 에 salt_string 의 UTF-8 바이트 사용
 *   저장값 = "${salt}:${hash.toString('hex')}"
 */
public final class PasswordUtil {

    private static final int N       = 16384;
    private static final int R       = 8;
    private static final int P       = 1;
    private static final int KEY_LEN = 64;
    private static final HexFormat HEX = HexFormat.of();
    private static final SecureRandom RANDOM = new SecureRandom();

    private PasswordUtil() {}

    public static String hash(String password) {
        byte[] saltBytes = new byte[16];
        RANDOM.nextBytes(saltBytes);
        String salt = HEX.formatHex(saltBytes);          // 32자 hex 문자열
        byte[] derived = SCrypt.generate(
                password.getBytes(StandardCharsets.UTF_8),
                salt.getBytes(StandardCharsets.UTF_8),   // Node.js 방식: hex 문자열을 UTF-8 바이트로
                N, R, P, KEY_LEN);
        return salt + ":" + HEX.formatHex(derived);
    }

    /** 타이밍-세이프 검증 */
    public static boolean verify(String password, String stored) {
        if (stored == null) return false;
        String[] parts = stored.split(":", 2);
        if (parts.length != 2) return false;
        String salt = parts[0];
        byte[] storedHash;
        try { storedHash = HEX.parseHex(parts[1]); } catch (Exception e) { return false; }

        byte[] derived = SCrypt.generate(
                password.getBytes(StandardCharsets.UTF_8),
                salt.getBytes(StandardCharsets.UTF_8),
                N, R, P, KEY_LEN);
        return MessageDigest.isEqual(storedHash, derived);  // constant-time compare
    }
}
