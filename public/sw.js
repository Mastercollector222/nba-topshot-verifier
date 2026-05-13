const CACHE_NAME = "tsv-shell-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  "/",
  "/dashboard",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  const isApi = url.pathname.startsWith("/api/");
  const isStaticAsset =
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff");

  if (isApi) {
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        const clone = res.clone();
        if (res.ok) {
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const offline = await caches.match(OFFLINE_URL);
        return offline ?? new Response("Offline", { status: 503 });
      })
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Top Shot Verifier", body: event.data.text(), href: "/dashboard" };
  }

  const title = data.title ?? "Top Shot Verifier";
  const options = {
    body: data.body ?? "",
    icon: data.icon ?? "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { href: data.href ?? "/dashboard" },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href ?? "/dashboard";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            client.focus();
            client.navigate(href);
            return;
          }
        }
        return clients.openWindow(href);
      }),
  );
});
