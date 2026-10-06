/*
 * Service worker de la tienda (app instalable).
 * - Páginas: primero la red; sin conexión, la última versión guardada o un aviso.
 * - Archivos de Next (/_next/static) y fotos (/marca): se guardan para abrir rápido.
 * - Nunca guarda el panel, las cuentas, los pagos ni las fotos de cédulas.
 * - Avisos push: muestra la notificación y abre la página indicada al tocarla.
 */
const VERSION = "gch-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#faf7fb;color:#1f1724;text-align:center;padding:24px}
button{margin-top:16px;border:0;border-radius:999px;padding:12px 24px;font-weight:600;background:#7B2F9E;color:#fff;font-size:16px}</style></head>
<body><main><p style="font-size:48px;margin:0">📶</p><h1>Estás sin conexión</h1><p>Revisa tus datos o el wifi y vuelve a intentarlo.</p>
<button onclick="location.reload()">Reintentar</button></main></body></html>`;

const PRIVATE = /^\/(admin|login|sin-acceso|mi-cuenta|checkout|credito\/(solicitud|fiador)|pedido)(\/|$)/;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(PAGES).then((c) => c.put("/__offline", new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Archivos con huella (no cambian): primero la caché.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/marca/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Páginas: primero la red. Las públicas se guardan para verlas sin conexión.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !PRIVATE.test(url.pathname)) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/__offline"))),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Aviso", body: "", url: "/mi-cuenta", tag: undefined };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icono/192",
      badge: "/icono/96",
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/mi-cuenta", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === target && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
