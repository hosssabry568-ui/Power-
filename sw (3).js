/* ============================================================
   مصحف النور — Service Worker v8 (محسّن للأذان في السكون)
   ✅ إشعارات في وضع السكون  ✅ صوت الأذان الحقيقي  ✅ كاش ذكي
============================================================ */
const CACHE_VERSION = "v8";
const CACHE_NAME = `alnoor-cache-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "./","./index.html","./quran-simple.xml","./icon.png","./manifest.json"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith("alnoor-cache-") && k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }).then(clients => {
        clients.forEach(c => c.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION }));
      }))
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const allowed = [
    self.location.origin,"https://api.alquran.cloud","https://cdn.islamic.network",
    "https://everyayah.com","https://api.aladhan.com","https://server7.mp3quran.net",
    "https://server8.mp3quran.net","https://server10.mp3quran.net","https://server11.mp3quran.net",
    "https://fonts.googleapis.com","https://fonts.gstatic.com","https://www.gstatic.com",
    "https://www.transparenttextures.com","https://quranapp-9c312-default-rtdb.firebaseio.com",
    "https://www.islamcan.com","https://nominatim.openstreetmap.org"
  ];
  if (!allowed.some(o => event.request.url.startsWith(o))) return;

  if (url.pathname.endsWith(".mp3") || url.hostname.includes("everyayah") || url.hostname.includes("mp3quran") || url.hostname.includes("islamcan")) {
    event.respondWith(fetch(event.request).catch(() => new Response("", { status: 503 })));
    return;
  }
  if (url.hostname.includes("firebaseio") || url.hostname.includes("gstatic")) {
    event.respondWith(fetch(event.request).catch(() => new Response("{}", { headers: { "Content-Type": "application/json" } })));
    return;
  }
  if (url.hostname.includes("api.") || url.hostname.includes("aladhan")) {
    event.respondWith(
      fetch(event.request).then(res => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE_NAME).then(ca => ca.put(event.request, c)); }
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE_NAME).then(ca => ca.put(event.request, c)); }
        return res;
      });
    })
  );
});

/* ============================================================
   نظام الإشعارات المحسّن - يعمل في وضع السكون
============================================================ */
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "مصحف النور 🕌", {
    body: data.body || "حان وقت الصلاة",
    icon: "./icon.png", badge: "./icon.png",
    dir: "rtl", lang: "ar",
    vibrate: [300, 100, 300, 100, 300],
    tag: data.tag || "prayer-notification",
    requireInteraction: true,
    silent: false,
    data: { url: data.url || "./" },
    actions: [
      { action: "open", title: "فتح التطبيق", icon: "./icon.png" },
      { action: "dismiss", title: "موافق" }
    ]
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(cls => {
      const app = cls.find(c => c.url.includes(self.location.origin) && "focus" in c);
      if (app) return app.focus();
      return clients.openWindow(event.notification.data?.url || "./");
    })
  );
});

self.addEventListener("sync", event => {
  if (event.tag === "prayer-check") event.waitUntil(checkPrayerTime());
});

self.addEventListener("periodicsync", event => {
  if (event.tag === "prayer-periodic-check") event.waitUntil(checkPrayerTimeAndSchedule());
});

self.addEventListener("message", event => {
  if (!event.data) return;
  if (event.data.type === "SAVE_PRAYER_TIMES") savePrayerTimesAndSchedule(event.data.times, event.data.city);
  if (event.data.type === "SCHEDULE_ADHAN") scheduleAdhanAlarms(event.data.times);
  if (event.data.type === "PING") event.ports?.[0]?.postMessage({ type: "PONG", version: CACHE_VERSION });
});

/* ============================================================
   جدولة الأذان المحسّنة - تضمن الإشعار حتى في السكون
============================================================ */
async function savePrayerTimesAndSchedule(times, city) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put("prayer-times-data", new Response(
      JSON.stringify({ times, city, savedAt: Date.now(), date: new Date().toDateString() }),
      { headers: { "Content-Type": "application/json" } }
    ));
    await scheduleAdhanAlarms(times);
  } catch (e) { console.warn("[SW] save error:", e); }
}

let _prayerTimers = [];

const PRAYER_INFO = {
  Fajr:    { name: "الفجر",   body: "الصلاة خير من النوم 🌙\nاللهم صلّ وسلّم على نبينا محمد" },
  Dhuhr:   { name: "الظهر",   body: "حي على الصلاة، حي على الفلاح ☀️\nاللهم صلّ وسلّم على نبينا محمد" },
  Asr:     { name: "العصر",   body: "حي على الصلاة، حي على الفلاح 🌤️\nاللهم صلّ وسلّم على نبينا محمد" },
  Maghrib: { name: "المغرب",  body: "حي على الصلاة، حي على الفلاح 🌇\nاللهم صلّ وسلّم على نبينا محمد" },
  Isha:    { name: "العشاء",  body: "حي على الصلاة، حي على الفلاح 🌙\nاللهم صلّ وسلّم على نبينا محمد" }
};

async function scheduleAdhanAlarms(times) {
  // إلغاء الجدولة القديمة
  _prayerTimers.forEach(t => clearTimeout(t));
  _prayerTimers = [];
  if (!times) return;

  const now = new Date();
  for (const [k, info] of Object.entries(PRAYER_INFO)) {
    if (!times[k]) continue;
    const [h, m] = times[k].split(":");
    const pt = new Date(); pt.setHours(+h, +m, 0, 0);
    // إذا فات الوقت اليوم - جدّل ليوم غد
    if (pt <= now) pt.setDate(pt.getDate() + 1);
    const delay = pt - now;
    if (delay > 86400000) continue; // أكثر من يوم - تجاهل

    // ✅ تنبيه ١٥ دقيقة قبل (هادئ)
    const pre15 = delay - 15 * 60000;
    if (pre15 > 0) {
      _prayerTimers.push(setTimeout(async () => {
        await self.registration.showNotification(`🕌 قريباً: صلاة ${info.name}`, {
          body: `باقي ١٥ دقيقة على أذان ${info.name}`,
          icon: "./icon.png", badge: "./icon.png",
          vibrate: [100, 50, 100],
          dir: "rtl", lang: "ar",
          tag: "pre15-" + k,
          requireInteraction: false,
          silent: true,
          data: { url: "./" }
        });
      }, pre15));
    }

    // ✅ تنبيه ٥ دقائق قبل (بصوت)
    const pre5 = delay - 5 * 60000;
    if (pre5 > 0) {
      _prayerTimers.push(setTimeout(async () => {
        await self.registration.showNotification(`🕌 قريباً: أذان ${info.name}`, {
          body: `باقي ٥ دقائق • استعد للصلاة`,
          icon: "./icon.png", badge: "./icon.png",
          vibrate: [200, 100, 200, 100, 200],
          dir: "rtl", lang: "ar",
          tag: "pre5-" + k,
          requireInteraction: false,
          silent: false,
          data: { url: "./" }
        });
      }, pre5));
    }

    // ✅ إشعار الأذان الرئيسي (عالي الأولوية - يعمل في السكون)
    _prayerTimers.push(setTimeout(async () => {
      // إشعار قوي يكسر السكون على معظم الأجهزة
      await self.registration.showNotification(`🕌 حان وقت صلاة ${info.name}`, {
        body: info.body,
        icon: "./icon.png",
        badge: "./icon.png",
        vibrate: [500, 100, 500, 100, 500, 100, 500, 100, 500, 200, 200, 100, 200],
        dir: "rtl",
        lang: "ar",
        tag: "adhan-" + k,
        requireInteraction: true,  // لا يختفي تلقائياً
        silent: false,             // يشغّل صوت الإشعار
        renotify: true,            // يُعيد الإشعار حتى لو نفس الـ tag
        data: {
          url: "./",
          prayerKey: k,
          prayerName: info.name,
          timestamp: Date.now()
        },
        actions: [
          { action: "open",    title: "🕌 فتح التطبيق" },
          { action: "dismiss", title: "✓ تم" }
        ]
      });

      // ✅ إرسال رسالة للتطبيق إذا كان مفتوحاً ليشغّل صوت الأذان
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      allClients.forEach(c => {
        c.postMessage({ type: "PLAY_ADHAN", prayerKey: k, prayerName: info.name });
      });

    }, delay));

    console.log(`[SW] جُدِّل ${info.name} بعد ${Math.round(delay/60000)} دقيقة (${new Date(Date.now()+delay).toLocaleTimeString('ar')})`);
  }
  
  console.log(`[SW] تم جدولة ${_prayerTimers.length} تنبيه بنجاح`);
}

/* التحقق الدوري وإعادة الجدولة */
async function checkPrayerTimeAndSchedule() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const resp = await cache.match("prayer-times-data");
    if (!resp) return;
    const data = await resp.json();
    // إذا البيانات من يوم مختلف - حدّث من الإنترنت
    if (data.date !== new Date().toDateString()) {
      try {
        const country = data.city === "Cairo" ? "Egypt" : "Saudi Arabia";
        const r = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${data.city||"Cairo"}&country=${country}&method=5`);
        const d = await r.json();
        if (d.data?.timings) {
          await savePrayerTimesAndSchedule(d.data.timings, data.city);
          return;
        }
      } catch (e) {}
    }
    await scheduleAdhanAlarms(data.times);
  } catch (e) { console.warn("[SW] periodic error:", e); }
}

async function checkPrayerTime() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const resp = await cache.match("prayer-times-data");
    if (!resp) return;
    const data = await resp.json();
    const times = data.times || data;
    const now = new Date();
    for (const [k, info] of Object.entries(PRAYER_INFO)) {
      if (!times[k]) continue;
      const [h, m] = times[k].split(":");
      const pt = new Date(); pt.setHours(+h, +m, 0, 0);
      if (Math.abs(now - pt) < 90000) { // ١.٥ دقيقة
        await self.registration.showNotification(`🕌 حان وقت صلاة ${info.name}`, {
          body: info.body,
          icon: "./icon.png",
          vibrate: [500,100,500,100,500],
          dir: "rtl", tag: "prayer-" + k,
          requireInteraction: true,
          silent: false,
          renotify: true
        });
      }
    }
  } catch (e) { console.warn("[SW] checkPrayer error:", e); }
}
