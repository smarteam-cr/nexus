/**
 * lib/finanzas/actualizar-tablero.ts
 *
 * Qué se le dice a quien aprieta «Actualizar» en el punto de equilibrio. PURO: recibe lo que devolvió cada fuente y
 * arma el texto. La orquestación, que sí toca HubSpot, Odoo y la base, vive en `actualizar-tablero-server.ts`.
 *
 * ── POR QUÉ EXISTE (revisión con Alex, 2026-09-29) ──────────────────────────────
 * El tablero lee la base cada vez que se abre, así que los cobros de Nexus siempre están al día. Lo que envejece son
 * las dos COPIAS que se hacen una vez por día, a las 6 de la mañana: las ventas ganadas de HubSpot (la línea
 * «Vendido») y las facturas de Odoo. Un trato ganado a las 10 no aparecía hasta el día siguiente. El botón vuelve a
 * hacer las dos copias y recarga el tablero: es para abrirlo en una reunión y ver las cifras del momento.
 *
 * ⚠ Cada fuente informa por separado, y una que falla no tapa a la otra ni impide recargar: el tablero se vuelve a
 * leer siempre, y el aviso dice cuál de las dos no se pudo actualizar.
 */
import type { SyncVentasResult } from "@/lib/ventas/sync-ganadas";

export interface FuenteActualizada {
  fuente: "HUBSPOT" | "ODOO";
  /** false = esa fuente no se pudo actualizar: el tablero muestra lo que tenía de ella. */
  ok: boolean;
  /** Lo que se le dice a la persona, tal cual. */
  texto: string;
}

const tratos = (n: number) => (n === 1 ? "1 trato" : `${n} tratos`);

/** Lo que pasó con las ventas ganadas de HubSpot, en una frase. */
export function resumenDeVentas(r: SyncVentasResult, anio: number): FuenteActualizada {
  if (r.locked) {
    return {
      fuente: "HUBSPOT",
      ok: true,
      texto: "Las ventas de HubSpot ya se estaban actualizando en este momento: el tablero muestra lo que había.",
    };
  }
  if (r.parcial) {
    return {
      fuente: "HUBSPOT",
      ok: false,
      texto: `HubSpot devolvió menos ventas de lo normal y no se cambió nada${r.errores[0] ? `: ${r.errores[0]}` : "."}`,
    };
  }
  const cambios = [
    r.altas > 0 ? `${r.altas === 1 ? "1 nuevo" : `${r.altas} nuevos`}` : null,
    r.actualizadas > 0 ? `${r.actualizadas} con cambios` : null,
    r.reclasificadas > 0 ? `${r.reclasificadas} que ya no ${r.reclasificadas === 1 ? "está ganado" : "están ganados"}` : null,
  ].filter((x): x is string => x !== null);
  const aviso = r.errores.length > 0 ? ` ⚠ ${r.errores.length === 1 ? "Un trato no se pudo leer" : `${r.errores.length} tratos no se pudieron leer`}: ${r.errores[0]}` : "";
  return {
    fuente: "HUBSPOT",
    ok: true,
    texto: `Ventas de HubSpot: ${tratos(r.traidas)} ${r.traidas === 1 ? "ganado" : "ganados"} en ${anio}, ${cambios.length ? cambios.join(" · ") : "sin cambios"}.${aviso}`,
  };
}

/** Lo que pasó cuando HubSpot ni siquiera contestó. */
export function ventasSinActualizar(error: unknown): FuenteActualizada {
  return {
    fuente: "HUBSPOT",
    ok: false,
    texto: `No se pudieron actualizar las ventas de HubSpot: ${error instanceof Error ? error.message : String(error)}`,
  };
}

/** El aviso entero: las dos fuentes, una por línea, y si hay que mirar alguna. */
export function avisoDeActualizacion(fuentes: readonly FuenteActualizada[]): { todoBien: boolean; texto: string } {
  return { todoBien: fuentes.every((f) => f.ok), texto: fuentes.map((f) => f.texto).join(" ") };
}
