const CACHE_NAME = "vrntas-pos-cache-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Pre-caching core assets");
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Failed to pre-cache some assets during install:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[SW] Clearing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests and external resources (chrome extensions, analytics, etc)
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) {
    return;
  }

  // Handle API requests (Network-First)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          // Cache successful API responses if needed (optional, e.g., config query)
          if (response.status === 200 && url.pathname.includes("/config")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, copy);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(req);
        })
    );
    return;
  }

  // Handle navigation requests (SPA fallback)
  if (req.mode === "navigate" || (req.method === "GET" && req.headers.get("accept")?.includes("text/html"))) {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match("/") || caches.match("/index.html");
      })
    );
    return;
  }

  // Handle static assets (Stale-While-Revalidate)
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch((err) => {
          console.log("[SW] Network fetch failed for static asset:", url.pathname, err);
          throw err;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
