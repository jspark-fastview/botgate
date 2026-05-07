package io.guardus.internal.dto;

public record ValidateRequest(
    String token,
    String bot_ua,
    String domain,
    String ip,
    String path,
    Boolean billed,
    String bot_purpose,
    String bot_name,
    String bot_vendor
) {}
