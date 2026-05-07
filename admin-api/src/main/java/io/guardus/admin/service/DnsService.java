package io.guardus.admin.service;

import org.springframework.stereotype.Service;

import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.InitialDirContext;
import java.net.InetAddress;
import java.util.*;

/**
 * DNS lookup service — checks if a channel domain resolves to our ALB.
 * Mirrors checkChannelDns() in admin.js.
 */
@Service
public class DnsService {

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
