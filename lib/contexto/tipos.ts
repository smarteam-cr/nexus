/**
 * lib/contexto/tipos.ts — EL VOCABULARIO DEL CONTEXTO. Puro, client-safe, sin Prisma.
 *
 * ── POR QUÉ EL CONTEXTO SE VUELVE NOMBRABLE (decisión de Elías, 2026-08-08) ──
 * Hasta hoy «el contexto» era un userMessage de ~15 bloques armado inline en un route de
 * 3.300 líneas, más cinco generadores que juntaban sus fuentes cada uno a su manera. Nada de
 * eso tenía NOMBRE: no se podía decir «el contexto de proyecto del cronograma» y señalar un
 * valor — solo un tramo de template literal. Las consecuencias se pagaron esta semana: un
 * filtro que se creía puesto estaba muerto (el spread pisado), y nadie podía responder «¿qué
 * ve exactamente el agente?» sin leer 400 líneas.
 *
 * Este módulo le pone nombre a las piezas:
 *
 *   FuenteDeContexto     — UNA fuente, con su ámbito, su rótulo ADENTRO del texto (la
 *                          procedencia no se puede perder por descuido de un call site),
 *                          su tope y su tamaño real.
 *   ContextoDeProyecto   — lo que un proyecto le da a un agente: sus fuentes + las
 *                          EXCEPCIONES (exclusiones compuestas: las del sistema recalculadas
 *                          + las del CSE) + las INSTRUCCIONES por documento.
 *
 * El ámbito es la distinción que el zoom del hermano menor enseñó a golpes:
 *   · "proyecto" — sesiones vinculadas, canvas propios, fuentes manuales, instrucciones.
 *   · "cliente"  — la línea de tiempo de HubSpot, los deals, las notas de empresa: material
 *                  compartido entre TODOS los proyectos del cliente, que por eso necesita
 *                  etiqueta de procedencia cuando un proyecto tipado lo consume.
 *
 * ── ADOPCIÓN POR TRINQUETE, NO BIG-BANG ──────────────────────────────────────
 * `PIEZAS_CON_CONTEXTO_NOMBRADO` es el registro de piezas ya migradas al módulo. Solo crece.
 * El ensamblador viejo de analyze sigue siendo dueño de lo no migrado (el handoff, con sus
 * 40+ guardas encima, migra en su propia tanda con golden por bloque). Una pieza registrada
 * acá NO puede armar fuentes a mano en la ruta — la guarda fs-scan lo hace cumplir.
 */
import type { ProjectPipelineKey } from "@/lib/projects/kind";

export type AmbitoDeContexto = "proyecto" | "cliente";

export interface FuenteDeContexto {
  /** Nombre estable de la fuente (ej. "handoff-curado", "cronograma-actual"). */
  key: string;
  ambito: AmbitoDeContexto;
  /** El texto CON su rótulo de procedencia adentro. "" = la fuente no aporta nada hoy. */
  texto: string;
}

export interface ContextoDeProyecto {
  projectId: string;
  /** El tipo del proyecto — decide agentes, piezas y qué fuentes llevan etiqueta. */
  pipelineKey: ProjectPipelineKey | null;
  /** Las fuentes, en el orden en que se le presentan al agente. */
  fuentes: FuenteDeContexto[];
  /** Instrucciones del CSE para ESTE documento (entry `__doc`), ya formateadas como bloque. */
  instrucciones: string;
}

/**
 * Las piezas cuya generación ya consume el contexto NOMBRADO. Solo crece (trinquete).
 *
 * `"assist"` no es una pieza del registro de canvases: es el MODIFICADOR del cronograma, que
 * edita la pieza `"timeline"`. Entra igual porque lo que este registro gobierna es «qué
 * generaciones arman su contexto con nombre en vez de a mano en la ruta», y el modificador es
 * una generación más — la que hasta el 2026-08-18 no veía nada del negocio.
 */
export const PIEZAS_CON_CONTEXTO_NOMBRADO: readonly string[] = ["timeline", "assist"];

/** Serializa las fuentes al prompt, en orden, salteando las vacías. */
export function renderFuentes(fuentes: readonly FuenteDeContexto[]): string {
  return fuentes
    .map((f) => f.texto)
    .filter(Boolean)
    .join("\n\n");
}
