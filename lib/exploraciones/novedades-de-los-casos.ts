/**
 * lib/exploraciones/novedades-de-los-casos.ts — qué hay de nuevo desde la última vez que el agente miró los casos de uso
 * de la preventa. SERVIDOR. Solo lee: nada corre solo (pedido 4b de Elías, 2026-11-08: «debería ser proactivo», y cada
 * corrida cuesta, así que el paso AVISA y ofrece «Revisar»).
 *
 * Dos señales (lib/casos-de-uso/personalizar.ts › novedadesDesde), las dos de lo que «Revisar» de verdad lee:
 *   - las reuniones DE LA PREVENTA que el agente leyó después (`propuesta.lecturas`): lo que dejaron mueve la escala, lo
 *     que falta, las metas y los retos. Una reunión que todavía no se leyó no cuenta: «Revisar» no la vería (revisión
 *     del 2026-11-08: contar las de toda la empresa ofrecía una corrida que respondía «Nada cambió»);
 *   - la huella de lo que lee el agente de casos, que cambia si cambió lo que se sabe.
 */
import "server-only";
import { novedadesDesde, type NovedadesDeLosCasos } from "@/lib/casos-de-uso/personalizar";
import { huellaDeLosCasosHoy } from "./agente";
import type { FilaDeExploracion } from "./servidor";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila } from "./servidor";

export async function novedadesDeLosCasos(fila: FilaDeExploracion): Promise<NovedadesDeLosCasos | null> {
  if (fila.projectId) return null;
  const estado = estadoDesdeFila(fila);
  const revision = estado.propuesta.revisionDeLosCasos ?? null;
  // Una mirada de antes del 2026-11-08 no guardó su huella: cuenta desde su corrida, solo con las reuniones.
  const ultimaCorrida = [...estado.propuesta.corridas].reverse().find((c) => c.modo === "casos");
  const ultima = revision ?? (ultimaCorrida ? { en: ultimaCorrida.en, huella: "" } : null);
  if (!ultima) return null;
  const vig = await escalaParaExplorar();
  const huellaDeHoy = vig.estado === "ok" ? huellaDeLosCasosHoy({ estado, escala: escalaDeLaExploracion(vig.general, estado), general: vig.general }) : ultima.huella;
  const leidas = Object.values(estado.propuesta.lecturas)
    .map((l) => Date.parse(l.en))
    .filter(Number.isFinite);
  return novedadesDesde({ ultima, huellaDeHoy, fechasDeReuniones: leidas });
}
