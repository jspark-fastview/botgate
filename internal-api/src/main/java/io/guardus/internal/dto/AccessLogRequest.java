package io.guardus.internal.dto;

public record AccessLogRequest(
    String bot_ua,
    String domain,
    String ip,
    String path,
    Boolean verified,
    Boolean billed,
    String category,
    String bot_purpose,
    String bot_name,
    String bot_vendor,
    Boolean blocked
) {}
