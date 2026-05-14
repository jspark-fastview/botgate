package io.guardus.admin.service;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.InitialDirContext;
import java.net.InetAddress;
import java.util.*;

/**
 * DNS lookup service — checks if a channel domain resolves to our ALB.
 * Mirrors checkChannelDns() in admin.js.
 *
 * Result 캐시 — DNS query 매번 수행하면 채널 페이지 로드 시 4 채널 × ~200ms = 1s.
 * TTL 은 stats 와 동일 5m (CacheConfig). 운영자가 DNS 바꾸고 5분 기다리면 갱신.
 */
@Service
public class DnsService {

    @Cacheable(value = "stats", key = "'dns:' + #domain", unless = "#result == null")
    public Map<String, Object> checkDns(String domain) {
        String expected = System.getenv().getOrDefault("ALB_HOSTNAME", "").trim();
        String cname = null;
        List<String> ips = new ArrayList<>();

        // CNAME lookup via JNDI DNS provider
        try {
            Properties props = new Properties();
            props.put("java.naming.factory.initial", "com.sun.jndi.dns.DnsContextFactory");
            props.put("java.naming.provider.url", "dns:");
            InitialDirContext ctx = new InitialDirContext(props);
            Attributes attrs = ctx.getAttributes(domain, new String[]{"CNAME"});
            Attribute cAttr = attrs.get("CNAME");
            if (cAttr != null && cAttr.size() > 0) {
                cname = cAttr.get(0).toString().replaceAll("\\.$", "");
            }
            ctx.close();
        } catch (Exception ignored) {}

        // A record lookup
        try {
            InetAddress[] addrs = InetAddress.getAllByName(domain);
            for (InetAddress addr : addrs) ips.add(addr.getHostAddress());
        } catch (Exception ignored) {}

        String status = "unresolved";
        if (cname != null || !ips.isEmpty()) {
            status = "resolved";
        }

        if (!expected.isBlank() && (cname != null || !ips.isEmpty())) {
            boolean matched = cname != null && cname.toLowerCase().contains(expected.toLowerCase());
            if (!matched && !ips.isEmpty()) {
                try {
                    InetAddress[] albAddrs = InetAddress.getAllByName(expected);
                    Set<String> albIps = new HashSet<>();
                    for (InetAddress a : albAddrs) albIps.add(a.getHostAddress());
                    matched = ips.stream().anyMatch(albIps::contains);
                } catch (Exception ignored) {}
            }
            status = matched ? "connected" : "mismatch";
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("domain", domain);
        result.put("status", status);
        result.put("cname", cname);
        result.put("ips", ips);
        result.put("expected", expected.isBlank() ? null : expected);
        return result;
    }
}
