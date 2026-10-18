// La versión llega en la URL de registro (/sw.js?v=<versión>): cada build nuevo usa otra caché
const BUILD_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `vrntas-pos-cache-${BUILD_VERSION}`;
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

  // La API nunca pasa por la caché: respuestas viejas (precios, configuración) o datos de otro
  // usuario no deben servirse desde aquí. El modo offline vive en la app (cola + catálogo local).
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Handle navigation requests (SPA fallback)
  if (req.mode === "navigate" || (req.method === "GET" && req.headers.get("accept")?.includes("text/html"))) {
    event.respondWith(
      fetch(req).catch(async () => {
        // caches.match devuelve una promesa: "||" nunca llegaba al respaldo
        return (await caches.match("/")) ?? (await caches.match("/index.html")) ?? Response.error();
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
