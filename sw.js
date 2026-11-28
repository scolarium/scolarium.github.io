// Service worker Școlarium: быстрые статические файлы и страница «нет связи».
// Данные журнала (Supabase) сюда не попадают: оценки всегда берутся свежими из сети.
const V = "scolarium-v1", PAGES = V + "-pages", STATIC = V + "-static", OFFLINE = "/offline.html", MAX_STATIC = 120;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(PAGES).then(c => c.addAll([OFFLINE, "/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(V)) await caches.delete(k);   // чистим кэши старых версий
    await self.clients.claim();
  })());
});

async function swr(req){   // отдаём из кэша сразу, а свежую копию докачиваем в фоне
  const cache = await caches.open(STATIC), hit = await cache.match(req);
  const net = fetch(req).then(async res => {
    if (res.ok && res.type === "basic"){
      await cache.put(req, res.clone());
      const keys = await cache.keys(); if (keys.length > MAX_STATIC) await Promise.all(keys.slice(0, keys.length - MAX_STATIC).map(k => cache.delete(k)));
    }
    return res;
  }).catch(() => hit);
  return hit || net;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                      // Supabase, шрифты и библиотеки: напрямую из сети
  if (req.mode === "navigate"){                                    // страницы: всегда свежие, без сети — страница «нет связи»
    e.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }
  if (/\.(?:css|js|png|jpe?g|svg|webp|ico)$/i.test(url.pathname) && url.pathname !== "/sw.js") e.respondWith(swr(req));
});

self.addEventListener("notificationclick", e => {   // пригодится для push-уведомлений
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(list => list.length ? list[0].focus() : self.clients.openWindow("/cabinet/")));
});
