/**
 * lib/tareas/descartadas.ts — lo que una persona descartó no vuelve (2026-10-19, DECISIONS «Pocos pendientes y
 * esenciales de las reuniones con clientes»). CLIENT-SAFE y puro: lo que hay que leer de la base lo trae quien llama
 * (lib/tareas/lectura.ts › `descartesDeLaCuenta`).
 *
 * Dos reglas, que se suman:
 *  - LA LÁPIDA (la de siempre): un título IDÉNTICO a una propuesta rechazada o juntada por una persona, para la misma
 *    persona y la misma cuenta, no se vuelve a proponer por `DIAS_DE_LAPIDA` (28) días.
 *  - EL DESCARTE DE LA CUENTA (nueva): lo que una persona DESCARTÓ en una cuenta («Descartar» sobre una propuesta) no se
 *    vuelve a proponer NUNCA desde otra reunión, correo o lectura de esa cuenta si habla del mismo tema (`mismoTema`,
 *    lib/tareas/tema.ts), sea para quien sea. Solo con cuenta: sin cuenta, el tema podría ser de cualquiera.
 * Lo que venció sin que nadie lo decidiera, lo retirado por el sistema o por quien lo pidió, y lo juntado con otra tarea
 * («Era otra tarea») NO es un descarte de la cuenta: si se vuelve a hablar del tema, se vuelve a proponer.
 */
import { DIAS_DE_LAPIDA } from "./reglas";
import { esLapida, SISTEMA } from "./estados";
import { compartenTema, temasDeLaTarea, type Tema } from "./tema";
import { huellaDeTexto } from "./texto";

export interface TareaDecidida {
  titulo: string;
  contexto: string | null;
  huella: string;
  clientId: string | null;
  responsableEmail: string | null;
  estado: string;
  decision: string | null;
  decididaPorEmail: string | null;
  decididaAt: Date | null;
}

/** ¿Una persona la DESCARTÓ? (no venció, no la retiró el sistema, no era otra tarea). */
export function esDescarteDeLaCuenta(t: Pick<TareaDecidida, "estado" | "decision" | "decididaPorEmail" | "clientId">): boolean {
  return !!t.clientId && t.estado === "rechazada" && t.decision === "rechazada" && !!t.decididaPorEmail && t.decididaPorEmail !== SISTEMA;
}

/** Los temas que una cuenta ya descartó, para comparar lo nuevo. */
export function temasDescartados(filas: readonly TareaDecidida[], clientId: string, empresa?: string | null): Tema[][] {
  return filas.filter((f) => f.clientId === clientId && esDescarteDeLaCuenta(f)).map((f) => temasDeLaTarea(f, empresa)).filter((t) => t.length > 0);
}

/** ¿Lo que dicen estos textos (el título, el «qué») ya lo descartó alguien en esta cuenta? */
export function yaSeDescarto(textos: readonly string[], descartados: readonly Tema[][], empresa?: string | null): boolean {
  if (!descartados.length) return false;
  const temas = textos.flatMap((t) => temasDeLaTarea({ titulo: t, contexto: null }, empresa));
  return descartados.some((d) => compartenTema(temas, d));
}

export interface PropuestaParaFiltrar {
  titulo: string;
  contexto?: string | null;
  responsableEmail: string | null;
  porAsignar: boolean;
  clientId: string | null;
}

/**
 * Saca las propuestas que repiten una lápida reciente o un tema que su cuenta ya descartó. `empresas` = el nombre de cada
 * cuenta (para que el nombre no cuente como tema).
 */
export function sinLoDescartado<T extends PropuestaParaFiltrar>(
  propuestas: readonly T[],
  decididas: readonly TareaDecidida[],
  ahora: Date,
  empresas: ReadonlyMap<string, string> = new Map(),
): { propuestas: T[]; porLapida: number; porTema: number } {
  const desde = +ahora - DIAS_DE_LAPIDA * 86_400_000;
  const lapidas = new Set(
    decididas.filter((d) => esLapida(d) && d.decididaAt && +d.decididaAt >= desde).map((d) => `${d.huella}|${d.responsableEmail ?? ""}|${d.clientId ?? ""}`),
  );
  const porCuenta = new Map<string, Tema[][]>();
  const temasDe = (clientId: string) => {
    if (!porCuenta.has(clientId)) porCuenta.set(clientId, temasDescartados(decididas, clientId, empresas.get(clientId)));
    return porCuenta.get(clientId)!;
  };
  let porLapida = 0;
  let porTema = 0;
  const quedan: T[] = [];
  for (const p of propuestas) {
    if (lapidas.has(`${huellaDeTexto(p.titulo)}|${p.porAsignar ? "" : (p.responsableEmail ?? "")}|${p.clientId ?? ""}`)) {
      porLapida++;
      continue;
    }
    if (p.clientId) {
      const propios = temasDeLaTarea({ titulo: p.titulo, contexto: p.contexto ?? null }, empresas.get(p.clientId));
      if (temasDe(p.clientId).some((d) => compartenTema(propios, d))) {
        porTema++;
        continue;
      }
    }
    quedan.push(p);
  }
  return { propuestas: quedan, porLapida, porTema };
}
