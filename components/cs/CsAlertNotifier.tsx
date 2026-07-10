"use client";

/**
 * components/cs/CsAlertNotifier.tsx
 *
 * Poller de alertas HIGH del watchdog para la LÍDER de CS: cada ~90s consulta
 * las alertas OPEN de severidad alta detectadas después del watermark (localStorage)
 * y avisa por DOS canales, para que una alerta HIGH nunca se consuma en silencio:
 *   - notificación de navegador (si hay permiso y la pestaña NO está en foco);
 *   - toast in-app como fallback (usuario mirando Nexus, o sin permiso OS).
 * El watermark usa lastDetectedAt (no createdAt): el dedup del watchdog escala
 * severidad sobre la fila existente sin tocar createdAt.
 * Montado en AppShell SOLO para roles CSL / SUPER_ADMIN (gate acá + guard
 * seeAllClients en la API). Render null — no pinta nada.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { notifyCsAlert } from "@/lib/notifications/client";
import type { CsAlertRow } from "@/lib/cs/load-panel";

const POLL_MS = 90_000;
const WATERMARK_KEY = "nexus.cs.alerts.watermark";

export default function CsAlertNotifier({ role }: { role: string | null }) {
  const busy = useRef(false);
  const toast = useToast();
  const router = useRouter();
  // Refs para no re-armar el intervalo si cambian las identidades de toast/router.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (role !== "CSL" && role !== "SUPER_ADMIN") return;

    async function tick() {
      if (busy.current) return;
      busy.current = true;
      try {
        let watermark: string | null = null;
        try {
          watermark = localStorage.getItem(WATERMARK_KEY);
        } catch {
          /* localStorage no disponible */
        }
        // Primera vez: fijar el watermark en "ahora" sin notificar el backlog.
        if (!watermark) {
          try {
            localStorage.setItem(WATERMARK_KEY, new Date().toISOString());
          } catch { /* no-op */ }
          return;
        }
        const res = await fetch(
          `/api/cs/alerts?status=OPEN&severity=HIGH&since=${encodeURIComponent(watermark)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { alerts?: CsAlertRow[] };
        const fresh = data.alerts ?? [];
        if (fresh.length === 0) return;
        for (const a of fresh) {
          const outcome = await notifyCsAlert({
            alertId: a.id,
            title: a.title,
            clientName: a.clientName,
            url: "/customer-success",
          });
          // La OS no mostró nada (usuario en foco, o sin permiso) → toast in-app,
          // así la alerta nunca avanza el watermark sin haberse visto por ALGÚN canal.
          if (outcome !== "shown") {
            toastRef.current.info(`🚨 ${a.clientName}: ${a.title}`, {
              duration: 0, // sticky: una alerta HIGH no se auto-descarta
              action: { label: "Ver panel", onClick: () => routerRef.current.push("/customer-success") },
            });
          }
        }
        const maxDetected = fresh.map((a) => a.lastDetectedAt).sort().at(-1);
        if (maxDetected) {
          try {
            localStorage.setItem(WATERMARK_KEY, maxDetected);
          } catch { /* no-op */ }
        }
      } catch {
        /* red caída → el próximo tick reintenta */
      } finally {
        busy.current = false;
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [role]);

  return null;
}
