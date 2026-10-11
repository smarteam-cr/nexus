"use client";

/**
 * MirarCalendario — al abrir la exploración, mira en el calendario si las reuniones agendadas que se
 * unieron a una sesión se movieron o se cancelaron (etapa A, 2026-10-09). Si alguna cambió, el lienzo
 * recarga: la sesión toma la fecha nueva o dice que la cancelaron. No pinta nada. El servidor decide si
 * hace falta mirar (como mucho una vez cada 10 minutos): lib/exploraciones/calendario.ts. Copia de
 * MirarHubspot.
 */
import { useEffect, useRef } from "react";
import { useLienzo } from "./contexto";

export function MirarCalendario() {
  const { exp, recargar } = useLienzo();
  const mirada = useRef<string | null>(null);
  // Solo si hay alguna sesión unida a un evento que no se canceló: si no, no hay nada que mirar.
  const hayEventos = exp.estado.contenido.sesiones.some((s) => s.evento && !s.evento.cancelada);

  useEffect(() => {
    if (exp.estado.archivada || !hayEventos || mirada.current === exp.id) return;
    mirada.current = exp.id;
    fetch(`/api/sales/exploraciones/${exp.id}/calendario`, { method: "POST" })
      .then((r) => (r.ok ? (r.json() as Promise<{ cambio?: boolean }>) : null))
      .then((d) => {
        if (d?.cambio) void recargar();
      })
      .catch(() => {
        /* Sin el calendario, el lienzo sigue con lo que tenía. */
      });
  }, [exp.id, exp.estado.archivada, hayEventos, recargar]);

  return null;
}
