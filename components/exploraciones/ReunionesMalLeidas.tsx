"use client";

/**
 * ReunionesMalLeidas — cómo leyó el Resumen las reuniones que no pudo leer bien (18 nov, Elías tras el diagnóstico de
 * Cemaco; rehecho el 24 nov). Al armar el Resumen de la escala, una reunión a la que se le cortó un pedazo del medio, o
 * donde la empresa dijo menos del 28 % de lo dicho, queda en `ResumenGuardado.malLeidas`. Se ve en La escala (arriba del
 * Resumen, todas) y en la sesión de esa reunión (solo la suya).
 *
 * 24 nov (Elías eligió «Una línea gris, sin botón»): ninguna alerta amarilla se queda sin algo que hacer. Lo medido con
 * Centauro y Cemaco · Ecuador: «Volver a leer» no traía de nuevo la transcripción (el agente relee la que ya está
 * guardada), así que en una reunión que presentamos nosotros el aviso volvía igual al terminar. Por eso:
 *   · una cortada por larga en un Resumen de antes de leerlas enteras NO sale aquí: la arregla rehacer el Resumen, y lo
 *     dice la línea de arriba de La escala (lib/exploraciones/linea-de-la-escala.ts › `cortadasQueSeLeenEnteras`);
 *   · una que la presentamos nosotros (la empresa habló poco) se leyó entera: una línea gris, sin botón, que dice qué pasa
 *     con lo nuestro (entra solo como cifra por confirmar);
 *   · una que quedó cortada aun leyéndolas enteras (más larga que el tope) también es una línea gris: nada la arregla.
 */
import { diaCorto } from "@/lib/exploraciones/fechas";
import { malLeidasParaMostrar } from "@/lib/exploraciones/linea-de-la-escala";
import type { ReunionMalLeida } from "@/lib/external/pagina-del-resumen";

/** La línea de una reunión: qué pasó y qué significa para el Resumen. `sola`: en la pestaña de esa sesión (sin el título). */
export function lineaDeLaReunion(m: ReunionMalLeida, sola = false): string {
  const cual = sola ? "Esta reunión" : `La reunión del ${diaCorto(m.fecha)}${m.titulo ? ` («${m.titulo}»)` : ""}`;
  const partes: string[] = [];
  if (m.motivos.includes("poco-del-cliente")) partes.push(`la presentamos nosotros (la empresa dijo el ${m.delCliente} % de lo dicho): lo que dijimos entra solo como cifra por confirmar`);
  if (m.motivos.includes("recortada")) partes.push(`es más larga de lo que el Resumen alcanza a leer y se leyó el ${m.leido} %: el pedazo del medio no llega al Resumen`);
  return `${cual} ${partes.join("; y ")}.`;
}

export default function ReunionesMalLeidas({ reuniones, enteras = false, sola = false }: { reuniones: readonly ReunionMalLeida[]; enteras?: boolean; sola?: boolean }) {
  const vistas = malLeidasParaMostrar(reuniones, enteras);
  if (!vistas.length) return null;
  return (
    <div role="note" className="flex flex-col gap-0.5 text-[13px] text-fg-muted">
      {vistas.map((m) => (
        <p key={m.reunion}>{lineaDeLaReunion(m, sola)}</p>
      ))}
    </div>
  );
}
