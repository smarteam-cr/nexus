"use client";

/**
 * agenda-navegable.ts — moverse por la agenda del inicio sin volver a pedir «Para ti» entero (2026-10-17).
 *
 * Antes, ‹ ›, «Hoy» y Día ↔ Semana eran enlaces: cada clic volvía a armar la página completa (la medición de «Para ti»,
 * las cuentas, las tareas… unos 6 segundos medidos). Ahora la agenda pide solo lo suyo a /api/para-ti/agenda, guarda lo
 * leído un minuto en la pestaña, y lo que se va a pedir se adelanta al pasar el mouse por los botones. La dirección se
 * actualiza con `history.replaceState`, así recargar abre donde estabas.
 *
 * Lo que viene de la página (al entrar, o con un `router.refresh()`) manda: reemplaza lo que la agenda tenía.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgendaDeHoy } from "@/lib/mi-dia/agenda-server";
import { diaQueSeVe, type VistaDeLaAgenda } from "@/lib/mi-dia/agenda-dias";

export interface AgendaQueSeVe {
  vista: VistaDeLaAgenda;
  /** El día que se ve, o el lunes en la semana. */
  dia: string;
  datos: AgendaDeHoy;
}

const VIDA_MS = 60_000;
const guardadas = new Map<string, { at: number; datos: AgendaDeHoy }>();
const enVuelo = new Map<string, Promise<AgendaDeHoy | null>>();
const clave = (correo: string, vista: VistaDeLaAgenda, dia: string) => `${correo.toLowerCase()}|${vista}|${dia}`;

function guardada(k: string): AgendaDeHoy | null {
  const g = guardadas.get(k);
  return g && Date.now() - g.at < VIDA_MS ? g.datos : null;
}

/** Pide la agenda de una vista (o devuelve la que ya se está pidiendo). null = no se pudo pedir. */
function pedir(correo: string, vista: VistaDeLaAgenda, dia: string): Promise<AgendaDeHoy | null> {
  const k = clave(correo, vista, dia);
  const ya = guardada(k);
  if (ya) return Promise.resolve(ya);
  const enCurso = enVuelo.get(k);
  if (enCurso) return enCurso;
  const p = fetch(`/api/para-ti/agenda?vista=${vista}&dia=${dia}`)
    .then(async (r) => {
      if (!r.ok) return null;
      const j = (await r.json().catch(() => null)) as { agenda?: AgendaDeHoy } | null;
      const datos = j?.agenda ?? null;
      if (datos?.estado === "ok") guardadas.set(k, { at: Date.now(), datos });
      return datos;
    })
    .catch(() => null)
    .finally(() => {
      enVuelo.delete(k);
    });
  enVuelo.set(k, p);
  return p;
}

/** Deja la dirección en el día y la vista que se ven, sin pedir la página. La semana es la de entrada: solo el día va. */
function fijarDireccion(vista: VistaDeLaAgenda, dia: string) {
  const u = new URL(window.location.href);
  u.searchParams.set("dia", dia);
  if (vista === "dia") u.searchParams.set("agenda", "dia");
  else u.searchParams.delete("agenda");
  u.searchParams.delete("vista");
  window.history.replaceState(null, "", `${u.pathname}${u.search}`);
}

export function useAgendaNavegable(inicial: AgendaQueSeVe | null, correo: string) {
  const [estado, setEstado] = useState<AgendaQueSeVe | null>(inicial);
  const [cargando, setCargando] = useState(false);
  // Lo que manda la página reemplaza lo que hay (se ajusta en el render, sin efecto).
  const [deLaPagina, setDeLaPagina] = useState(inicial);
  if (inicial !== deLaPagina) {
    setDeLaPagina(inicial);
    setEstado(inicial);
    setCargando(false);
  }
  useEffect(() => {
    if (inicial?.datos.estado === "ok") guardadas.set(clave(correo, inicial.vista, inicial.dia), { at: Date.now(), datos: inicial.datos });
  }, [inicial, correo]);

  const ultimo = useRef(0);
  const ir = useCallback(
    (vista: VistaDeLaAgenda, diaPedido: string) => {
      const dia = diaQueSeVe(vista, diaPedido);
      fijarDireccion(vista, dia);
      const n = ++ultimo.current;
      const ya = guardada(clave(correo, vista, dia));
      if (ya) {
        setEstado({ vista, dia, datos: ya });
        setCargando(false);
        return;
      }
      // Mientras llega, la grilla ya muestra el día nuevo (sin reuniones) y dice que está leyendo.
      setEstado({ vista, dia, datos: { estado: "ok", dia, reuniones: [] } });
      setCargando(true);
      void pedir(correo, vista, dia).then((datos) => {
        if (n !== ultimo.current) return;
        setEstado({ vista, dia, datos: datos ?? { estado: "error", dia, reuniones: [] } });
        setCargando(false);
      });
    },
    [correo],
  );

  /** Adelanta lo que se va a pedir (al pasar el mouse por ‹ › o «Semana»). */
  const precargar = useCallback(
    (vista: VistaDeLaAgenda, diaPedido: string) => {
      void pedir(correo, vista, diaQueSeVe(vista, diaPedido));
    },
    [correo],
  );

  return { agenda: estado, cargando, ir, precargar };
}
