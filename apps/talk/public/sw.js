// Minimal service worker: makes the app installable and reopens the shell without a network.
const CACHE = "talk-shell-v2";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/", "/icon.svg", "/icon-192.png", "/manifest.webmanifest"])));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("talk-shell-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((hit) => hit || caches.match("/"))));
});
