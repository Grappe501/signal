/* Service worker — offline app shell + cache visited chapters */
const CACHE_VERSION = "signal-reader-v7";
const SHELL = [
  "/",
  "/index.html",
  "/css/reader.css",
  "/vendor/marked.min.js",
  "/js/pagination.js",
  "/js/routes.js",
  "/js/prefetch.js",
  "/js/touch.js",
  "/js/listen-script.js",
  "/js/listen-presets.js",
  "/js/audio-sync.js",
  "/js/audio-cache.js",
  "/js/audio-timeline.js",
  "/js/hosted-audio.js",
  "/js/audio-session.js",
  "/js/listen-studio.js",
  "/js/bookmarks.js",
  "/js/search.js",
  "/js/share.js",
  "/js/tts.js",
  "/js/reader.js",
  "/book.json",
  "/manifest.json",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function isChapterAsset(pathname) {
  return pathname.startsWith("/content/") && pathname.endsWith(".md");
}

function isAudioAsset(pathname) {
  return pathname.startsWith("/audio/") && /\.(mp3|wav|json)$/i.test(pathname);
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) return;

  if (isAudioAsset(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (isChapterAsset(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok && url.pathname !== "/read") {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
          }
          return response;
        })
    )
  );
});
