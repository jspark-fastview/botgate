/**
 * GuardUs Portal Service Worker — Network-first 전략.
 *
 * 정적 자원 (portal-app.html / bg-*.jsx / *.css) 항상 네트워크 우선,
 * 오프라인 시만 cache fallback. 새 deploy 후 사용자 stale cache 방지.
 *
 * 새 SW 가 등록되면 controllerchange 이벤트 → 페이지 자동 reload.
 *
 * Build hash: 빌드 시점에 sed 또는 환경변수로 교체 가능. 현재는 timestamp.
 */

const BUILD_HASH = self.location.search.replace(/^\?v=/, '') || 'dev';
const CACHE_NAME = 'guardus-portal-' + BUILD_HASH;
const NETWORK_FIRST_PATTERNS = [
  /\/portal-app\.html/,
  /\/bg-.*\.jsx$/,
  /\/portal\.css$/,
  /\/botgate-marketing\.css$/,
];

self.addEventListener('install', e => {
  // 새 SW 가 등록되면 기존 SW 대기 없이 즉시 활성
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  // 옛 cache 삭제 + 현재 페이지 즉시 take over
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => n.startsWith('guardus-portal-') && n !== CACHE_NAME)
           .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  const isStatic = NETWORK_FIRST_PATTERNS.some(p => p.test(url));
  if (!isStatic) return;  // 다른 요청은 default browser handling

  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request);
      // 성공 시 cache 업데이트 (오프라인 fallback 용)
      if (fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(e.request, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      // 네트워크 fail 시 cache fallback
      const cached = await caches.match(e.request);
      if (cached) return cached;
      throw err;
    }
  })());
});
