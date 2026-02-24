const CACHE_NAME = 'alnoor-cache-v1';
const assets = [
  'index.html',
  'quran-simple.xml',
  'manifest.json',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Reem+Kufi:wght@400;700&display=swap',
  'https://www.transparenttextures.com/patterns/islamic-art.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(assets))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
