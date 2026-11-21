/**
 * lib/uso/meta-de-las-novedades.ts — LA META DE LAS NOVEDADES DE LOS DOCUMENTOS en «Uso de Nexus» (2026-11-20). PURO.
 *
 * Elías aprobó ponerle una meta antes del botón «Agregar contexto», que va a sumar más: **que venza menos de la mitad**
 * de lo que las reuniones le proponen a los documentos. Medido el 20 nov: 1.161 pendientes y 20 decisiones en un mes.
 *
 * Se mide sobre una TANDA ya cerrada: lo que nació hace entre 30 y 60 días (`TANDA_DE_LA_META`). Una novedad vence a los
 * 30 días, así que en la ventana de los últimos 30 casi nada llega a vencer y la parte vencida saldría siempre en cero.
 * Lo que cerró el sistema cuenta como vencido (lib/lo-propuesto/ciclo.ts › `estadoDeDestinoDeHecho`).
 */

export const META_DE_LAS_NOVEDADES = {
  /** Que venza menos que esto. */
  parteVencidaMaxima: 0.5,
  /** Sin estas cerradas en la tanda, no se juzga. */
  cerradasMinimas: 8,
} as const;

/** La tanda que se mide: lo nacido entre hace `desdeDias` y hace `hastaDias`. */
export const TANDA_DE_LA_META = { desdeDias: 60, hastaDias: 30 } as const;

export interface MetaDeLasNovedades {
  cerradas: number;
  vencidas: number;
  /** null sin cerradas. */
  parteVencida: number | null;
  estado: "cumple" | "no-cumple" | "sin-datos";
  /** La cifra grande: «38 % venció» o «—». */
  valor: string;
  /** Una línea, en tuteo y sin jerga. */
  texto: string;
}

export function metaDeLasNovedades(c: { usados: number; desestimados: number; vencidos: number }): MetaDeLasNovedades {
  const cerradas = c.usados + c.desestimados + c.vencidos;
  const maxima = Math.round(META_DE_LAS_NOVEDADES.parteVencidaMaxima * 100);
  if (cerradas < META_DE_LAS_NOVEDADES.cerradasMinimas) {
    return {
      cerradas,
      vencidas: c.vencidos,
      parteVencida: cerradas ? c.vencidos / cerradas : null,
      estado: "sin-datos",
      valor: "—",
      texto: `Todavía no alcanza para juzgar: ${cerradas} ${cerradas === 1 ? "cerrada" : "cerradas"} de ${META_DE_LAS_NOVEDADES.cerradasMinimas}. Meta: que venza menos del ${maxima} %.`,
    };
  }
  const parte = c.vencidos / cerradas;
  const porcentaje = Math.round(parte * 100);
  const cumple = parte < META_DE_LAS_NOVEDADES.parteVencidaMaxima;
  return {
    cerradas,
    vencidas: c.vencidos,
    parteVencida: parte,
    estado: cumple ? "cumple" : "no-cumple",
    valor: `${porcentaje} % venció`,
    texto: `${cumple ? "Cumple" : "No cumple"} la meta de que venza menos del ${maxima} %: de ${cerradas} cerradas, ${c.vencidos} vencieron sin que nadie las decidiera.`,
  };
}
