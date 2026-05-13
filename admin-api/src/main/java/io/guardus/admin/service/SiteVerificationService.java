package io.guardus.admin.service;

import org.springframework.stereotype.Service;

import javax.naming.Context;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Hashtable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 도메인 소유 검증.
 * 두 가지 방법 시도 — 하나라도 통과하면 verified.
 *
 *   1. DNS TXT  — `_guardus-verify.<domain>` 의 TXT 값이 verifyToken 과 일치
 *   2. well-known — `https://<domain>/.well-known/guardus-verify.txt` 내용이 verifyToken 과 일치
 *
 * 기존 DnsService 의 "ALB 가리키나" 체크와는 다른 목적 — 이건 소유 증명.
 */
@Service
public class SiteVerificationService {

    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    private final HttpClient http = HttpClient.newBuilder()
            // 검증은 해당 도메인에 직접 — 리다이렉트 따라가지 않음
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(TIMEOUT)
            .build();

    /**
     * 검증 시도.
     * @return  {method: "dns_txt"|"well_known"|null, verified: true/false, detail: "..."}
     */
    public Map<String, Object> verify(String domain, String verifyToken) {
        Map<String, Object> out = new LinkedHashMap<>();

        // 1) DNS TXT
        String dnsErr = null;
        try {
            if (checkDnsTxt(domain, verifyToken)) {
                out.put("verified", true);
                out.put("method",   "dns_txt");
                out.put("detail",   "DNS TXT match");
                return out;
            }
        } catch (Exception e) {
            dnsErr = e.getMessage();
        }

        // 2) well-known
        String httpErr = null;
        try {
            if (checkWellKnown(domain, verifyToken)) {
                out.put("verified", true);
                out.put("method",   "well_known");
                out.put("detail",   "well-known match");
                return out;
            }
        } catch (Exception e) {
            httpErr = e.getMessage();
        }

        out.put("verified", false);
        out.put("method",   null);
        out.put("detail",   "neither check matched — dns: " +
                (dnsErr != null ? dnsErr : "no TXT match") +
                " | well-known: " +
                (httpErr != null ? httpErr : "no body match"));
        return out;
    }

    private boolean checkDnsTxt(String domain, String token) throws Exception {
        Hashtable<String, String> env = new Hashtable<>();
        env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.dns.DnsContextFactory");
        DirContext ctx = new InitialDirContext(env);
        try {
            Attributes attrs = ctx.getAttributes(
                    "_guardus-verify." + domain, new String[]{"TXT"});
            Attribute txt = attrs.get("TXT");
            if (txt == null) return false;
            for (int i = 0; i < txt.size(); i++) {
                String value = (String) txt.get(i);
                // JNDI 결과는 따옴표 포함된 형태로 올 수 있음
                if (value == null) continue;
                String cleaned = value.replace("\"", "").trim();
                if (cleaned.equals(token)) return true;
            }
            return false;
        } finally {
            ctx.close();
        }
    }

    private boolean checkWellKnown(String domain, String token) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("https://" + domain + "/.well-known/guardus-verify.txt"))
                .timeout(TIMEOUT)
                .GET()
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) return false;
        return res.body() != null && res.body().trim().equals(token);
    }
}
