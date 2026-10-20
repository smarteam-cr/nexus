"use client";

/**
 * abrir-reunion.ts — «Preparar» abre el panel de la reunión en la agenda de «Para ti» (2026-10-20), sin pedir la
 * página otra vez. «Lo que importa hoy» pide abrirla; la agenda en pantalla lo escucha, va al día de la reunión y abre
 * su panel. Sin una agenda que escuche, el botón sigue su enlace (`/para-ti?dia=…&reunion=…`) y el inicio lo abre al
 * cargar.
 */

export interface ReunionPedida {
  eventoId: string;
  dia: string | null;
}

const oyentes = new Set<(r: ReunionPedida) => void>();

/** La agenda se anota para abrir reuniones; devuelve la función para cuando se va. */
export function escucharReunionesPedidas(fn: (r: ReunionPedida) => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

/** Pide abrir una reunión. false = no hay agenda en pantalla que la abra: que el botón siga su enlace. */
export function pedirAbrirReunion(r: ReunionPedida): boolean {
  if (oyentes.size === 0) return false;
  for (const o of oyentes) o(r);
  return true;
}
