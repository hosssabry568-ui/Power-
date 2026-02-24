const CACHE_NAME = "alnoor-cache-v4";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./quran-simple.xml",
  "./icon.png",
  "./manifest.json"
];

// Install - cache static assets
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Activate - clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch - network first for API, cache first for static
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Block requests to disallowed origins for security
  const allowedOrigins = [
    self.location.origin,
    "https://api.alquran.cloud",
    "https://api.aladhan.com",
    "https://server7.mp3quran.net",
    "https://server8.mp3quran.net",
    "https://server10.mp3quran.net",
    "https://server11.mp3quran.net",
    "https://download.tvquran.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://www.gstatic.com",
    "https://www.transparenttextures.com",
    "https://quranapp-9c312-default-rtdb.firebaseio.com"
  ];

  if (!allowedOrigins.some(o => event.request.url.startsWith(o))) return;

  // API requests: network first, then cache
  if (url.hostname.includes("api.") || url.hostname.includes("aladhan")) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static: cache first
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      return res;
    }))
  );
});

// Push Notifications
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "مصحف النور";
  const options = {
    body: data.body || "حان وقت الصلاة",
    icon: "./icon.png",
    badge: "./icon.png",
    dir: "rtl",
    lang: "ar",
    vibrate: [200, 100, 200],
    tag: data.tag || "prayer-notification",
    data: { url: data.url || "./" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(cls => {
      if (cls.length) return cls[0].focus();
      return clients.openWindow(event.notification.data.url || "./");
    })
  );
});

// Background Sync for prayer reminders
self.addEventListener("sync", event => {
  if (event.tag === "prayer-check") {
    event.waitUntil(checkPrayerTime());
  }
});

async function checkPrayerTime() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const resp = await cache.match("prayer-times-data");
    if (!resp) return;
    const data = await resp.json();
    const now = new Date();
    const prayers = { Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء" };
    for (const [k, name] of Object.entries(prayers)) {
      if (!data[k]) continue;
      const [h, m] = data[k].split(":");
      const pt = new Date(); pt.setHours(+h, +m, 0, 0);
      const diff = Math.abs(now - pt);
      if (diff < 60000) {
        await self.registration.showNotification("🕌 حان وقت " + name, {
          body: "الصلاة خير من النوم",
          icon: "./icon.png",
          vibrate: [300, 100, 300, 100, 300],
          dir: "rtl"
        });
      }
    }
  } catch (e) {}
}
