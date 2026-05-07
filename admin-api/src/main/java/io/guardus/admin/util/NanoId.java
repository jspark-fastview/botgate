package io.guardus.admin.util;

import java.security.SecureRandom;

public final class NanoId {
    private static final SecureRandom RANDOM = new SecureRandom();
    // nanoid default alphabet (64 chars)
    private static final String ALPHABET =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    private NanoId() {}

    /** 21-character nanoid (default size) */
    public static String generate() {
        return generate(21);
    }

    public static String generate(int size) {
        StringBuilder sb = new StringBuilder(size);
        for (int i = 0; i < size; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
