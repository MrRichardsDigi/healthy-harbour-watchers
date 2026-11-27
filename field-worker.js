const CACHE = 'hhw-field-v10';
const CORE = [
  'field.html', 'css/style.css?v=10', 'css/field.css?v=4', 'js/navigation.js?v=4',
  'js/field-auth.js?v=2', 'js/field.js?v=6', 'js/site-photo-upload.js', 'js/config.js', 'data/locations.json', 'assets/logo.png'
];
const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
const scope = new URL(self.registration.scope);
const coreUrls = new Set(CORE.map(path => new URL(path, scope).href));
const fieldUrl = new URL('field.html', scope).href;
const sitesUrl = new URL('data/locations.json', scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map(path => new URL(path, scope).href));
    try {
      await cache.add(SDK);
    } catch (error) {
      console.warn('Supabase library could not be cached for offline use:', error);
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('hhw-field-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate' && url.origin === scope.origin && url.pathname === new URL(fieldUrl).pathname) {
    event.respondWith((async () => {
      try {
        return await fetch(event.request);
      } catch (error) {
        const cached = await caches.match(fieldUrl);
        if (cached) return cached;
        throw error;
      }
    })());
  } else if (url.href === sitesUrl) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, response.clone()))
            .catch(error => console.error('Unable to update offline site list:', error)));
        }
        return response;
      } catch (error) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw error;
      }
    })());
  } else if (coreUrls.has(url.href) || url.href === SDK) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      return cached || fetch(event.request);
    })());
  }
});
