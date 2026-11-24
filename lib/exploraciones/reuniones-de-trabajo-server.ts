import "server-only";

/**
 * lib/exploraciones/reuniones-de-trabajo-server.ts — LAS REUNIONES DE TRABAJO SUGERIDAS de una empresa (24 nov, la preventa
 * de un cliente). SERVIDOR. Las usan el selector de «+ Agregar sesión» (GET …/reuniones-de-trabajo) y el script del
 * borrador (scripts/escala-con-lo-que-sabemos.ts): una sola cuenta para los dos.
 *
 * Las 40 más nuevas de la empresa con transcripción, por el chokepoint (invariante #1), y cuánto habló el cliente en cada
 * una (lib/analizador-venta/quien-hablo.ts). Contar quién habló lee cada transcripción: lo medido se recuerda 10 minutos
 * por empresa en este proceso (abrir y cerrar el selector no vuelve a leer todo). Una reunión que no se pudo medir no se
 * recuerda: se vuelve a medir la próxima vez (su transcripción pudo llegar después).
 */
import { quienHabloEnLasReuniones } from "@/lib/analizador-venta/analizar-server";
import { reunionesDeLaEmpresaParaElegir } from "./fuentes";
import { sugerirReunionesDeTrabajo, type ReunionDeTrabajoSugerida } from "./reuniones-de-trabajo";
import { PARTE_MINIMA_DEL_CLIENTE } from "./resumen-de-la-escala";

/** Cuántas reuniones con transcripción se miden (las más nuevas). */
export const CUANTAS_SE_MIDEN = 40;
/** Cuánto se recuerda lo medido de una empresa. */
export const MEMORIA_DE_LO_MEDIDO_MS = 10 * 60 * 1000;
const MEDIDAS = new Map<string, { en: number; parte: Map<string, number> }>();

/** Para las pruebas: olvida lo medido. */
export function olvidarLoMedido(): void {
  MEDIDAS.clear();
}

export async function reunionesDeTrabajoSugeridas(
  clientId: string,
  o: { ahora?: number; medir?: typeof quienHabloEnLasReuniones } = {},
): Promise<ReunionDeTrabajoSugerida[]> {
  const ahora = o.ahora ?? Date.now();
  const medir = o.medir ?? quienHabloEnLasReuniones;
  const conTexto = (await reunionesDeLaEmpresaParaElegir(clientId)).filter((r) => r.texto === "transcripcion").slice(0, CUANTAS_SE_MIDEN);
  const guardada = MEDIDAS.get(clientId);
  const vigente = guardada && ahora - guardada.en < MEMORIA_DE_LO_MEDIDO_MS ? guardada : { en: ahora, parte: new Map<string, number>() };
  const faltan = conTexto.filter((r) => !vigente.parte.has(r.sessionId)).map((r) => r.sessionId);
  if (faltan.length) {
    const quien = await medir(faltan);
    for (const sid of faltan) {
      const q = quien.get(sid);
      if (q && q.fuente !== "nada") vigente.parte.set(sid, q.cliente.porcentaje);
    }
  }
  MEDIDAS.set(clientId, vigente);
  return sugerirReunionesDeTrabajo(conTexto, vigente.parte, { minimo: PARTE_MINIMA_DEL_CLIENTE });
}
