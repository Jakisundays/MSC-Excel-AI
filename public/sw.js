// Service worker de Web Push (Fase 2, docs/notificaciones-push-plan.md).
// Sin build step, JS plano, servido tal cual desde /public/sw.js.
// Alcance intencionalmente acotado a push: NO agrega cacheo de assets ni
// convierte la app en una PWA offline-first, eso seria scope creep.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MSC Excel AI", body: "Tenes una notificacion nueva." };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "MSC Excel AI", {
      body: data.body || "",
      data: { url: data.url || "/dashboard" },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsArr) => {
        const url = (event.notification.data && event.notification.data.url) || "/dashboard";
        const existing = clientsArr.find((c) => c.url.includes(url));
        if (existing) return existing.focus();
        return clients.openWindow(url);
      }),
  );
});
