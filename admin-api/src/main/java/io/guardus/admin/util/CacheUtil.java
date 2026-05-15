package io.guardus.admin.util;

import java.util.Collection;
import java.util.Map;

/**
 * @Cacheable 의 unless 조건용 — "결과가 비어있으면 cache 하지 않음" 판단.
 *
 * 배경: prewarm/cold-start 시 Loki 가 timeout 되면 LokiClient 가 silent 빈 응답
 * → 응답 자체는 정상이지만 모든 값이 0/empty → Spring 이 70m 동안 그 0 을 캐시
 * → 정상 데이터 와도 portal 이 70m 동안 0 만 보임 (negative caching).
 *
 * SpEL 사용 예:
 *   @Cacheable(value = "stats", key = "...",
 *              unless = "T(io.guardus.admin.util.CacheUtil).isEmpty(#result)")
 */
public final class CacheUtil {
    private CacheUtil() {}

    /**
     * 다음 중 하나면 true (= cache 안 함):
     *  - null
     *  - 빈 Collection / Map
     *  - Map 의 모든 value 가 Number 이면서 합이 0
     *  - List 의 모든 element 가 Map 이면서 'count' (또는 'total') 합이 0
     */
    public static boolean isEmpty(Object o) {
        if (o == null) return true;

        if (o instanceof Collection<?> c) {
            if (c.isEmpty()) return true;
            // 각 element 가 {count|total: 0} 인 Map 이면 전체 0
            long sum = 0;
            for (Object item : c) {
                if (item instanceof Map<?,?> m) {
                    Number n = pickNumber(m, "count", "total", "requests");
                    if (n != null) sum += n.longValue();
                }
            }
            return sum == 0 && allCountMaps(c);
        }

        if (o instanceof Map<?,?> m) {
            if (m.isEmpty()) return true;
            // 모든 value 가 Number 면서 합 0
            long sum = 0;
            int numCount = 0;
            for (Object v : m.values()) {
                if (v instanceof Number n) { sum += n.longValue(); numCount++; }
            }
            return numCount == m.size() && sum == 0;
        }

        return false;
    }

    private static Number pickNumber(Map<?,?> m, String... keys) {
        for (String k : keys) {
            Object v = m.get(k);
            if (v instanceof Number n) return n;
        }
        return null;
    }

    private static boolean allCountMaps(Collection<?> c) {
        for (Object item : c) {
            if (!(item instanceof Map<?,?> m)) return false;
            if (pickNumber(m, "count", "total", "requests") == null) return false;
        }
        return true;
    }
}
