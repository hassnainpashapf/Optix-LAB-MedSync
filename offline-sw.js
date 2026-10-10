/* Cache only the static app shell; patient and staff API responses are never cached here. */
'use strict';

var CACHE_PREFIX = 'optix-app-shell-';
var CACHE_NAME = CACHE_PREFIX + '225';
var APP_ROOT = new URL('./', self.registration.scope);

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var response = await fetch(new URL('./', self.registration.scope), { cache: 'reload' });
    if (!response.ok) throw new Error('Could not cache the app shell.');
    var html = await response.clone().text();
    var urls = [new URL('./', self.registration.scope).href];
    var matches = html.match(/(?:src|href):?\s*['"]?(assets\/[^'"?\s)]+)|(?:src|href)=['"]([^'"]+)['"]/g) || [];
    matches.forEach(function (match) {
      var path = /assets\/[^'"?\s)]+/.exec(match);
      if (path) urls.push(new URL(path[0], self.registration.scope).href);
    });
    (html.match(/assets\/js\/[A-Za-z0-9._-]+\.js/g) || []).forEach(function (path) {
      urls.push(new URL(path, self.registration.scope).href);
    });
    var cache = await caches.open(CACHE_NAME);
    await cache.put(new URL('./', self.registration.scope), response);
    await Promise.all(Array.from(new Set(urls)).map(async function (url) {
      try {
        var asset = await fetch(url, { cache: 'reload' });
        if (asset.ok && new URL(url).origin === self.location.origin) await cache.put(url, asset);
      } catch (e) {
        /* Optional assets can be unavailable; the cached app entry remains usable. */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
    }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var request = event.request, url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(new URL('api/', APP_ROOT).pathname) === 0 ||
      request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(function (response) {
      if (response.ok) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(new URL('./', APP_ROOT), copy); });
      }
      return response;
    }).catch(async function () {
      return (await caches.match(new URL('./', APP_ROOT))) ||
        new Response('Offline. Reconnect to load the app.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }));
    return;
  }
  if (url.pathname.indexOf(new URL('./assets/', APP_ROOT).pathname) === 0) {
    event.respondWith(caches.match(request).then(function (cached) {
      var update = fetch(request).then(function (response) {
        if (response.ok) caches.open(CACHE_NAME).then(function (cache) { cache.put(request, response.clone()); });
        return response;
      });
      if (cached) update.catch(function () {});
      return cached || update;
    }));
  }
});
