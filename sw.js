/* ============================================================
   مصحف النور — Service Worker
   ⚠️ غيّر رقم الإصدار هنا في كل تحديث جديد
============================================================ */
const CACHE_VERSION = "v6";
const CACHE_NAME = `alnoor-cache-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./quran-simple.xml",
  "./icon.png",
  "./manifest.json"
];

/* ============================================================
   INSTALL — كاش الملفات الأساسية
============================================================ */
self.addEventListener("install", event => {
  // skipWaiting: يثبّت الـ SW الجديد فوراً بدون انتظار
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // addAll بشكل آمن — لو ملف مش موجود ما يوقفش كل حاجة
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    })
  );
});

/* ============================================================
   ACTIVATE — حذف الـ Cache القديم + السيطرة الفورية
============================================================ */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k.startsWith("alnoor-cache-") && k !== CACHE_NAME)
            .map(k => {
              console.log("[SW] حذف cache قديم:", k);
              return caches.delete(k);
            })
        )
      )
      .then(() => {
        // clients.claim: يخلي الـ SW الجديد يتحكم في كل التبويبات فوراً
        return self.clients.claim();
      })
      .then(() => {
        // أرسل رسالة لكل العملاء إن في تحديث جديد
        return self.clients.matchAll({ type: "window" }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
          });
        });
      })
  );
});

/* ============================================================
   FETCH — استراتيجية التحميل
============================================================ */
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Origins المسموح بيها فقط
  const allowedOrigins = [
    self.location.origin,
    "https://api.alquran.cloud",
    "https://cdn.islamic.network",
    "https://everyayah.com",
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

  // ملفات الصوت: Network Only (ملفات ضخمة ما نخزّنهاش)
  if (
    url.hostname.includes("cdn.islamic.network") ||
    url.hostname.includes("everyayah.com") ||
    url.pathname.endsWith(".mp3") ||
    url.hostname.includes("mp3quran.net")
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // لو مش موجود اتصال، رجّع مش موجود بدل ما يعلّق
        return new Response("", { status: 503, statusText: "Offline" });
      })
    );
    return;
  }

  // Firebase Realtime DB: Network Only
  if (url.hostname.includes("firebaseio.com")) {
    event.respondWith(fetch(event.request).catch(() => new Response("{}", { headers: { "Content-Type": "application/json" } })));
    return;
  }

  // طلبات الـ API: Network First ثم Cache كبديل
  if (url.hostname.includes("api.") || url.hostname.includes("aladhan")) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // الملفات الثابتة (HTML/CSS/JS/Icons): Cache First ثم Network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});

/* ============================================================
   PUSH NOTIFICATIONS
============================================================ */
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

/* ============================================================
   NOTIFICATION CLICK
============================================================ */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(cls => {
      // لو التطبيق مفتوح، ركّز عليه
      const app = cls.find(c => c.url.includes(self.location.origin));
      if (app) return app.focus();
      // لو مش مفتوح، افتحه
      return clients.openWindow(event.notification.data?.url || "./");
    })
  );
});

/* ============================================================
   BACKGROUND SYNC — مراجعة مواقيت الصلاة
============================================================ */
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
    const prayers = {
      Fajr: "الفجر",
      Dhuhr: "الظهر",
      Asr: "العصر",
      Maghrib: "المغرب",
      Isha: "العشاء"
    };
    for (const [k, name] of Object.entries(prayers)) {
      if (!data[k]) continue;
      const [h, m] = data[k].split(":");
      const pt = new Date();
      pt.setHours(+h, +m, 0, 0);
      const diff = Math.abs(now - pt);
      if (diff < 60000) {
        await self.registration.showNotification("🕌 حان وقت " + name, {
          body: "الصلاة خير من النوم",
          icon: "./icon.png",
          vibrate: [300, 100, 300, 100, 300],
          dir: "rtl",
          tag: "prayer-" + k
        });
      }
    }
  } catch (e) {
    console.warn("[SW] checkPrayerTime error:", e);
  }
}
