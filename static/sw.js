const CACHE_NAME = 'ha-dashboard-v5';
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
    const url = new URL(event.request.url);

    // Skip non-HTTP(S) requests (like chrome-extension://)
    if (!url.protocol.startsWith('http')) return;

    // Skip WebSocket, API calls, and Vite Dev Server internals
    if (
        url.pathname.includes('/api/') ||
        url.protocol === 'ws:' ||
        url.protocol === 'wss:' ||
        url.pathname.includes('@fs/') ||
        url.pathname.includes('@vite/') ||
        url.pathname.includes('node_modules/') ||
        url.pathname.includes('.svelte-kit/')
    ) {
        return; // Let the browser handle these normally without interception
    }

    event.respondWith(
        fetch(event.request).catch(async () => {
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) {
                return cachedResponse;
            }
            // If network fails AND it's not in cache, we MUST return a valid Response object
            // to prevent "TypeError: Failed to convert value to 'Response'"
            return new Response('Network error happened', {
                status: 408,
                headers: { 'Content-Type': 'text/plain' },
            });
        })
    );
});
