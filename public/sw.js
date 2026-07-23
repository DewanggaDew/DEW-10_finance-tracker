// Kanto service worker: app-shell caching so the capture sheet opens offline.
// Static assets are cache-first (Next hashes them); navigations are
// network-first with cache fallback. API calls are untouched — the client-side
// queue in the quick-add sheet handles offline writes.
const STATIC_CACHE = "kanto-static-v1";
const PAGE_CACHE = "kanto-pages-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          const hit = await caches.match(request);
          return hit ?? (await caches.match("/add")) ?? Response.error();
        }
      })(),
    );
  }
});
