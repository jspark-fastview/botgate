package io.guardus.admin.util;

import java.util.*;

/**
 * Builds a SQL IN condition that matches apex and www variants of a domain.
 * Mirrors the JS domainCondition() helper in admin.js.
 *
 * Example:
 *   "example.com"     → "(domain IN (?,?))"  params=["example.com","www.example.com"]
 *   "www.example.com" → "(domain IN (?,?))"  params=["www.example.com","example.com"]
 */
public record DomainCondition(String sql, List<Object> params) {

    /** Empty condition — no domain filter */
    public static final DomainCondition EMPTY = new DomainCondition("", List.of());

    public static DomainCondition of(String domain) {
        if (domain == null || domain.isBlank()) return EMPTY;

        String stripped = domain.replaceFirst("^www\\.", "");
        List<String> variants = new ArrayList<>();
        variants.add(domain);
        variants.add(stripped);                         // may equal domain if no www
        if (stripped.equals(domain)) variants.add("www." + domain);  // add www if none

        List<Object> uniq = new ArrayList<>(new LinkedHashSet<>(variants));
        String placeholders = String.join(",", Collections.nCopies(uniq.size(), "?"));
        return new DomainCondition("(domain IN (" + placeholders + "))", uniq);
    }

    public boolean hasCondition() {
        return !sql.isEmpty();
    }

    public Object[] asArray() {
        return params.toArray();
    }

    /** Merge this condition with extra params into a flat Object[] */
    public Object[] merge(Object... extra) {
        Object[] all = new Object[params.size() + extra.length];
        int i = 0;
        for (Object p : params) all[i++] = p;
        for (Object p : extra)  all[i++] = p;
        return all;
    }

    /** Prepend extra params before domain params */
    public Object[] prepend(Object... prefix) {
        Object[] all = new Object[prefix.length + params.size()];
        int i = 0;
        for (Object p : prefix) all[i++] = p;
        for (Object p : params)  all[i++] = p;
        return all;
    }
}
