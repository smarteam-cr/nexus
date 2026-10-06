"use client";

/**
 * components/cs/DisparoDelVigia.tsx — pide la revisión del agente vigía al abrir un cliente (D14,
 * Elías 2026-10-05: «que se actualice cada vez que alguien entra al cliente y tenga más de 2 días sin
 * correr para ese cliente»). No pinta nada y no espera nada: el servidor contesta enseguida y decide
 * él si toca (POST /api/cs/watchdog/al-entrar → lib/cs/vigia-por-cliente.ts).
 *
 * Lo montan la ficha del cliente (`app/(shell)/clients/[id]/WorkspaceClient.tsx`) y su cuenta en
 * Éxito del cliente (`app/(shell)/customer-success/[clientId]/page.tsx`). Un pedido por cliente y
 * montaje; un error se queda en silencio (es de fondo, nadie lo pidió).
 */
import { useEffect, useRef } from "react";

/** Diferido tras los syncs de fondo de la ficha (HubSpot ~1,5 s, Google ~2,5 s): no compite por el pool al montar. */
const ESPERA_MS = 4_000;

export default function DisparoDelVigia({ clientId }: { clientId: string }) {
  const pedido = useRef<string | null>(null);
  useEffect(() => {
    if (pedido.current === clientId) return;
    const t = setTimeout(() => {
      pedido.current = clientId;
      fetch("/api/cs/watchdog/al-entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      }).catch(() => {});
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [clientId]);
  return null;
}
