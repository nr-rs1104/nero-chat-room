const CACHE_NAME = "nero-sanctuary-v4";
const ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./nero_persona.js",
    "./nero_memory.js",
    "https://unpkg.com/@phosphor-icons/web",
    "https://cdn.jsdelivr.net/npm/marked/marked.min.js"
];

// Install Event: Cache Core Assets
self.addEventListener("install", (e) => {
    console.log("[Service Worker] Install (v4)");
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("[Service Worker] Caching all: app shell and content");
            return cache.addAll(ASSETS);
        })
    );
});

// Fetch Event: Serve from Cache, then Network (GET ONLY)
self.addEventListener("fetch", (e) => {
    // GASなどへのPOST通信はキャッシュを通さず確実にスルーする
    if (e.request.method !== "GET") {
        e.respondWith(fetch(e.request));
        return;
    }

    e.respondWith(
        caches.match(e.request).then((r) => {
            console.log("[Service Worker] Fetching resource: " + e.request.url);
            return r || fetch(e.request).then((response) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    // Cache new resources dynamically (optional, but good for fonts/icons)
                    if (e.request.url.startsWith("http")) {
                        cache.put(e.request, response.clone());
                    }
                    return response;
                });
            });
        })
    );
});

// Activate Event: Clean up old caches
self.addEventListener("activate", (e) => {
    console.log("[Service Worker] Activate (v4)");
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log("[Service Worker] Removing old cache", key);
                    return caches.delete(key);
                }
            }));
        })
    );
});
