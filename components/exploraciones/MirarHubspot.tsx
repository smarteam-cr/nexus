"use client";

/**
 * MirarHubspot — al abrir una preventa, mira si HubSpot tiene reuniones nuevas (las que se graban con
 * HubSpot no avisan cuando llegan; las de Meet sí). Si la lista cambió, el lienzo recarga; si el agente
 * salió a leer una reunión nueva, el lienzo la sigue. No pinta nada. El servidor decide si hace falta
 * mirar (como mucho una vez cada media hora): lib/exploraciones/reuniones-de-hubspot.ts.
 */
import { useEffect, useRef } from "react";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

export function MirarHubspot() {
  const { exp, recargar } = useLienzo();
  const { seguir } = useCorrida();
  const mirada = useRef<string | null>(null);

  useEffect(() => {
    if (exp.estado.archivada || mirada.current === exp.id) return;
    mirada.current = exp.id;
    fetch(`/api/sales/exploraciones/${exp.id}/hubspot`, { method: "POST" })
      .then((r) => (r.ok ? (r.json() as Promise<{ cambio?: boolean; lanzada?: boolean }>) : null))
      .then((d) => {
        if (d?.cambio) void recargar();
        if (d?.lanzada) void seguir();
      })
      .catch(() => {
        /* Sin HubSpot el lienzo sigue con lo que tenía. */
      });
  }, [exp.id, exp.estado.archivada, recargar, seguir]);

  return null;
}
