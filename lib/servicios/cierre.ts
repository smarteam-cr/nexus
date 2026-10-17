/**
 * lib/servicios/cierre.ts — la SESIÓN DE APRENDIZAJE y el CIERRE de un ciclo. PURO y CLIENT-SAFE.
 *
 * (docs/smartloop-plan.md, etapa 4; ficha E.) La regla de cierre sale del documento de proceso de SmartLoop
 * (lib/servicios/smartloop.ts › reglaDeCierre): un ciclo no se cierra sin su sesión de aprendizaje ni sin el criterio de
 * aceptación medido de cada caso de uso. Si la métrica no se movió, se reporta tal cual.
 *
 * Lo que se decide de cada caso de uso:
 *  · cumplido / no cumplido — se cerró en este ciclo, con su criterio medido.
 *  · pasa al siguiente ciclo — vuelve al plan del proyecto y entra solo al ciclo que se abra después.
 *  · descartado — no se hace.
 *
 * Al cerrar, cada documento del ciclo queda CONGELADO: se guarda una foto protegida (VersionDeDocumento) y el cierre la
 * nombra. El siguiente ciclo sigue escribiendo en los mismos documentos; los anteriores se consultan en «Ciclos
 * anteriores» con la foto de cómo quedaron.
 */
import { leerFotoAprobada, type FotoDelCronogramaDelCiclo } from "@/lib/timeline/ciclo";

export const DECISIONES_AL_CERRAR = ["cumplido", "no_cumplido", "pasa", "descartado"] as const;
export type DecisionAlCerrar = (typeof DECISIONES_AL_CERRAR)[number];
export const ETIQUETA_DE_DECISION: Record<DecisionAlCerrar, string> = {
  cumplido: "Se cumplió",
  no_cumplido: "No se cumplió",
  pasa: "Pasa al siguiente ciclo",
  descartado: "Se descarta",
};
export function esDecisionAlCerrar(v: unknown): v is DecisionAlCerrar {
  return typeof v === "string" && (DECISIONES_AL_CERRAR as readonly string[]).includes(v);
}

export const RESULTADOS_DE_META = ["cumplida", "parcial", "no_cumplida"] as const;
export type ResultadoDeMeta = (typeof RESULTADOS_DE_META)[number];
export const ETIQUETA_DE_RESULTADO: Record<ResultadoDeMeta, string> = {
  cumplida: "Se cumplió",
  parcial: "Se cumplió en parte",
  no_cumplida: "No se cumplió",
};
export function esResultadoDeMeta(v: unknown): v is ResultadoDeMeta {
  return typeof v === "string" && (RESULTADOS_DE_META as readonly string[]).includes(v);
}

/** Las decisiones que piden el criterio medido: un caso que se cierra en este ciclo se mide. */
export const PIDEN_MEDICION: readonly DecisionAlCerrar[] = ["cumplido", "no_cumplido"];

/** El estado del caso de uso tras la decisión, y si vuelve al plan del proyecto (sin ciclo). */
export function estadoTrasLaDecision(d: DecisionAlCerrar): { estado: string; alPlan: boolean } {
  switch (d) {
    case "cumplido":
      return { estado: "cumplido", alPlan: false };
    case "no_cumplido":
      return { estado: "no_cumplido", alPlan: false };
    case "pasa":
      return { estado: "en_plan", alPlan: true };
    case "descartado":
      return { estado: "descartado", alPlan: false };
  }
}

export interface CasoParaElCierre {
  id: string;
  titulo: string;
  criterio: string | null;
  criterioMedido: string | null;
  decisionAlCerrar: string | null;
}

export interface BorradorDelCierre {
  meta: string | null;
  metaResultado: string | null;
  metaEvaluada: string | null;
  siguienteCiclo: string | null;
  casos: readonly CasoParaElCierre[];
}

const lleno = (s: string | null | undefined) => !!s && s.trim() !== "";

/** Lo que falta para poder cerrar el ciclo, en frases. Vacío = se puede cerrar. */
export function faltaParaCerrar(b: BorradorDelCierre): string[] {
  const falta: string[] = [];
  if (b.casos.length === 0) falta.push("El ciclo no tiene casos de uso: no hay nada que medir.");
  for (const c of b.casos) {
    if (!esDecisionAlCerrar(c.decisionAlCerrar)) {
      falta.push(`Decide qué pasa con «${c.titulo}».`);
      continue;
    }
    if (PIDEN_MEDICION.includes(c.decisionAlCerrar) && !lleno(c.criterioMedido)) {
      falta.push(`Mide el criterio de aceptación de «${c.titulo}».`);
    }
  }
  if (!lleno(b.meta)) falta.push("El ciclo no tiene meta: escríbela en la tarjeta de la etapa antes de evaluarla.");
  else if (!esResultadoDeMeta(b.metaResultado)) falta.push("Evalúa la meta del ciclo.");
  if (!lleno(b.siguienteCiclo)) falta.push("Escribe la propuesta del siguiente ciclo.");
  return falta;
}

/** Lo que la guía del CSE comprueba en Aprendizaje (lib/servicios/guia.ts), desde el borrador. */
export function comprobacionesDelAprendizaje(b: BorradorDelCierre): Record<string, boolean> {
  const decididos = b.casos.length > 0 && b.casos.every((c) => esDecisionAlCerrar(c.decisionAlCerrar));
  // Medidos = cada caso decidido, y los que se cierran en este ciclo (cumplido o no) con su criterio medido.
  const medidos =
    decididos && b.casos.every((c) => !PIDEN_MEDICION.includes(c.decisionAlCerrar as DecisionAlCerrar) || lleno(c.criterioMedido));
  return {
    "criterios-medidos": medidos,
    "meta-evaluada": lleno(b.meta) && esResultadoDeMeta(b.metaResultado),
    "pendientes-decididos": decididos,
    "siguiente-ciclo": lleno(b.siguienteCiclo),
  };
}

// ── Lo que queda guardado al cerrar ──────────────────────────────────────────

export interface DocumentoCongelado {
  slug: string;
  nombre: string;
  canvasId: string;
  /** La foto protegida; null si el documento estaba vacío (no había nada que congelar). */
  versionId: string | null;
}

export interface CasoCerrado {
  id: string;
  titulo: string;
  criterio: string | null;
  criterioMedido: string | null;
  decision: DecisionAlCerrar;
}

export interface CierreGuardado {
  formato: 1;
  /** «aprendizaje» (la sesión, desde Nexus) o «importado» (lo trajo el traductor de una propuesta). */
  via: "aprendizaje" | "importado";
  meta: string | null;
  metaResultado: ResultadoDeMeta | null;
  metaEvaluada: string | null;
  siguienteCiclo: string | null;
  casos: CasoCerrado[];
  documentos: DocumentoCongelado[];
  /** El cronograma del ciclo como quedó al cerrar (la misma forma que la versión aprobada). */
  cronograma: FotoDelCronogramaDelCiclo | null;
}

export function armarCierre(
  b: BorradorDelCierre,
  documentos: DocumentoCongelado[],
  via: CierreGuardado["via"] = "aprendizaje",
  cronograma: FotoDelCronogramaDelCiclo | null = null,
): CierreGuardado {
  return {
    formato: 1,
    via,
    meta: b.meta,
    metaResultado: esResultadoDeMeta(b.metaResultado) ? b.metaResultado : null,
    metaEvaluada: b.metaEvaluada?.trim() || null,
    siguienteCiclo: b.siguienteCiclo?.trim() || null,
    casos: b.casos.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      criterio: c.criterio,
      criterioMedido: c.criterioMedido?.trim() || null,
      decision: esDecisionAlCerrar(c.decisionAlCerrar) ? c.decisionAlCerrar : "descartado",
    })),
    documentos,
    cronograma,
  };
}

/** Lee el cierre guardado; null si no hay o no tiene la forma (nunca lanza). */
export function leerCierre(v: unknown): CierreGuardado | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.formato !== 1) return null;
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => !!i && typeof i === "object") : []);
  return {
    formato: 1,
    via: o.via === "importado" ? "importado" : "aprendizaje",
    meta: str(o.meta),
    metaResultado: esResultadoDeMeta(o.metaResultado) ? o.metaResultado : null,
    metaEvaluada: str(o.metaEvaluada),
    siguienteCiclo: str(o.siguienteCiclo),
    casos: arr(o.casos)
      .filter((c) => typeof c.id === "string")
      .map((c) => ({
        id: c.id as string,
        titulo: str(c.titulo) ?? "",
        criterio: str(c.criterio),
        criterioMedido: str(c.criterioMedido),
        decision: esDecisionAlCerrar(c.decision) ? c.decision : "descartado",
      })),
    documentos: arr(o.documentos)
      .filter((d) => typeof d.slug === "string" && typeof d.canvasId === "string")
      .map((d) => ({ slug: d.slug as string, nombre: str(d.nombre) ?? (d.slug as string), canvasId: d.canvasId as string, versionId: str(d.versionId) })),
    cronograma: leerFotoAprobada(o.cronograma),
  };
}
