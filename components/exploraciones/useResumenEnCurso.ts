"use client";

/**
 * useResumenEnCurso — la corrida de «Armar el Resumen» / «Rehacer con IA» de La escala, seguida por su fase (24 nov).
 *
 * UN seguimiento por exploración (lib/exploraciones/corrida-del-resumen.ts), que comparten la página de La escala
 * (PaginaDeLaEscala.tsx) y la cuenta regresiva de una nota (rehacer-la-escala.ts): con las dos esperando hay una sola
 * consulta cada 3 s, y la página ve la corrida que lanzó la cuenta regresiva (o otra pestaña, o la que seguía al recargar).
 * `armar` arranca la corrida (o sigue la que ya corre) y espera a que termine; `mirar` vuelve a consultar (después de
 * que la red se cortó un buen rato: `sinSaber`).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  crearSeguimientoDelResumen,
  type CorridaDelResumen,
  type CorridaTerminada,
  type FotoDelResumen,
  type RespuestaDeLaRuta,
  type SeguimientoDelResumen,
} from "@/lib/exploraciones/corrida-del-resumen";

const seguimientos = new Map<string, SeguimientoDelResumen>();

async function pedir(id: string, method: "GET" | "POST"): Promise<RespuestaDeLaRuta> {
  const r = await fetch(`/api/sales/exploraciones/${id}/escala/resumen`, { method, cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { corrida?: CorridaDelResumen | null; terminada?: CorridaTerminada | null; error?: string };
  return {
    status: r.status,
    ...(j.corrida !== undefined ? { corrida: j.corrida } : {}),
    ...(j.terminada !== undefined ? { terminada: j.terminada } : {}),
    ...(j.error ? { error: j.error } : {}),
  };
}

/** El seguimiento de esta exploración (uno por pestaña). */
export function seguimientoDelResumen(id: string): SeguimientoDelResumen {
  let s = seguimientos.get(id);
  if (!s) {
    s = crearSeguimientoDelResumen({
      consultar: () => pedir(id, "GET"),
      arrancar: () => pedir(id, "POST"),
      esperar: (ms) => new Promise((r) => window.setTimeout(r, ms)),
    });
    seguimientos.set(id, s);
  }
  return s;
}

const SIN_CORRIDA: FotoDelResumen = Object.freeze({ corrida: null, terminada: null, lanzando: false, sinSaber: false });

/**
 * El fallo de «Rehacer con IA» que la persona cerró, recordado en ESTE navegador por exploración (segunda revisión del 24 nov:
 * volvía al cambiar de vista o recargar). Es de quien mira, como la elección de áreas: no va a la exploración. Sin
 * almacenamiento (ventana privada), se olvida al salir; no rompe nada.
 */
export function useFalloCerrado(id: string): [string | null, (falloId: string) => void] {
  const clave = `nexus:resumen-de-la-escala:fallo-cerrado:${id}`;
  const [cerrado, setCerrado] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(clave);
    } catch {
      return null;
    }
  });
  const cerrar = (falloId: string) => {
    setCerrado(falloId);
    try {
      window.localStorage.setItem(clave, falloId);
    } catch {
      /* sin almacenamiento: queda cerrado en esta visita */
    }
  };
  return [cerrado, cerrar];
}

export function useResumenEnCurso(id: string) {
  const s = seguimientoDelResumen(id);
  const foto = useSyncExternalStore(s.suscribir, s.foto, () => SIN_CORRIDA);
  // Al montar, la última corrida: si sigue corriendo (se recargó la página, la lanzó otra pestaña), se retoma.
  useEffect(() => {
    void s.mirar();
  }, [s]);
  const corre = foto.corrida?.estado === "RUNNING" && !foto.corrida.detenida && !foto.sinSaber;
  return { ...foto, corriendo: foto.lanzando || corre, armar: s.armar, mirar: s.mirar };
}
