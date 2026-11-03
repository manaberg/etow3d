// The service worker: keeps every file of the game in the browser's cache, so
// once it has loaded on a device it plays there without a network (a phone's
// home-screen app on a plane). Not bundled: the build (vite.config.js,
// offlinePlugin) fills in the version and the list of the build's files and
// writes it to dist/sw.js. Every build with any change is a new version.
//
// - Install: fetches every file into a cache of its own version, all or
//   nothing, so an installed worker means the whole game is there.
// - The game's own files are served from that cache first, with or without
//   a network. Opening the page does the same, whatever its query (the menu,
//   ?mode=...), so a plane's captive Wi-Fi portal cannot stand in for it.
// - A new version installs in the background and waits, so a game in progress
//   keeps the files it started with; the page offers to reload into it
//   (src/core/offline.js), which posts 'update' here. Its activation drops
//   the caches of older versions.
// - Anything else (the score backend, other sites) goes to the network as
//   usual.

const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'etow3d-' + VERSION;
const KEPT = new Set(FILES);
// the game's one page, which every address of it opens
const PAGE = '/index.html';
const PAGES = new Set(['/', '/index.html']);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // past the browser's HTTP cache, so no stale page is kept
    await cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('etow3d-') && key !== CACHE) {
        await caches.delete(key);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'update') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  const page = request.mode === 'navigate' && PAGES.has(url.pathname);
  if (!page && !KEPT.has(url.pathname)) {
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(page ? PAGE : url.pathname);
    return hit || fetch(request);
  })());
});
