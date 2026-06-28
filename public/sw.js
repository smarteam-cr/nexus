/* Nexus Service Worker — notificaciones de "agente terminado".
 *
 * v1 (navegador abierto): solo maneja el click de la notificación (enfocar una ventana
 * de Nexus existente o abrir la URL). Las notificaciones las MUESTRA el cliente vía
 * registration.showNotification (ver lib/notifications/client.ts). NO hace caché/PWA.
 *
 * Estructurado para el upgrade futuro a Web Push real (pestaña cerrada): agregar acá
 * un handler `push` que lea event.data y llame self.registration.showNotification.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Si ya hay una ventana de Nexus abierta, enfocarla (y navegar si difiere).
      for (const w of wins) {
        if ("focus" in w) {
          if (url && "navigate" in w && new URL(w.url).pathname !== url) {
            return w.navigate(url).then((c) => c && c.focus());
          }
          return w.focus();
        }
      }
      // Si no, abrir una nueva.
      return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
    }),
  );
});

// Upgrade futuro (Web Push con navegador cerrado):
// self.addEventListener("push", (event) => {
//   const d = event.data ? event.data.json() : {};
//   event.waitUntil(self.registration.showNotification(d.title, { body: d.body, data: { url: d.url } }));
// });
