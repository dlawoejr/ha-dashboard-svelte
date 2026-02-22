const CACHE_NAME = 'ha-dashboard-v3';
const ASSETS = [
    './',
    './images/icon-192.png',
    './images/icon-512.png'
];

// Install event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event - clear old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch event (Network first, fallback to cache)
self.addEventListener('fetch', (event) => {
    // Skip WebSocket requests and API calls
    if (event.request.url.includes('/api/') || event.request.url.startsWith('ws')) {
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
