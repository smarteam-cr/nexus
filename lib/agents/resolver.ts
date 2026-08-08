/**
 * lib/agents/resolver.ts — QUÉ AGENTE le toca a ESTE proyecto.
 *
 * Un `agentGroup` (handoff, kickoff, cronograma…) puede tener VARIAS filas de `Agent`: una
 * genérica y una por tipo de proyecto. Este módulo decide cuál gana, y es el único lugar donde
 * se decide.
 *
 * ── EL ACCIDENTE QUE ESTO VIENE A IMPEDIR ────────────────────────────────────
 * Hasta hoy el agente de handoff se resolvía así:
 *
 *     prisma.agent.findFirst({ where: { agentGroup: "handoff" } })
 *
 * Sin `orderBy` y sin filtrar `status`. Era determinista POR ACCIDENTE: había exactamente una
 * fila con ese grupo. El día que se sembrara la segunda, Postgres podría devolver cualquiera de
 * las dos y **una Implementación de HubSpot se generaría con el prompt de Sitios web** — sin
 * error, sin log, sin nada que lo delate hasta leer el documento. Por eso este resolver entra
 * ANTES de sembrar la primera variante, no junto con ella.
 *
 * ── EL FALLBACK ES EL REQUISITO DURO, NO UNA COMODIDAD ───────────────────────
 * `pipelineKey = NULL` significa «sirve para cualquier tipo». El agente de handoff que existe
 * hoy queda en NULL y no se le toca un carácter. Cuando una Implementación pida el suyo, se
 * busca `pipelineKey = "customer-success"`, no existe, y cae al de NULL: devuelve LA MISMA FILA,
 * con el mismo id y el mismo prompt de 17k caracteres. No es «parecido»: es idéntico. Ése es el
 * mecanismo que garantiza que una Implementación se siga viendo exactamente como antes.
 *
 * ── PURO A PROPÓSITO ─────────────────────────────────────────────────────────
 * La regla se puede escribir entera en un test sin base ni red. Quien consulta pasa las filas
 * candidatas; este módulo solo elige. Es lo que permite probar el empate, el desempate y el
 * fallback como una tabla.
 */
import type { ProjectPipelineKey } from "@/lib/projects/kind";
import { resolvePipeline } from "@/lib/projects/kind";

/**
 * Los `agentGroup` que se eligen POR GRUPO, y por lo tanto los únicos donde `pipelineKey` hace
 * algo. Hoy: uno solo.
 *
 * ⚠ ESTO NO ES «TODOS LOS GRUPOS», Y LA DIFERENCIA ES EL INVARIANTE ENTERO. Medido en producción
 * el 2026-08-07: cinco grupos tienen DOS O TRES agentes ACTIVE a propósito —`cobranza`,
 * `cronograma` (Avance + Detalle), `cs-watchdog`, `diagnostico` (tres), `preparacion`— y ahí la
 * ambigüedad no existe porque **nadie los busca por grupo**: el navegador dispara cada uno por su
 * id, desde los mapas de acciones. Un invariante que exigiera «un agente por grupo» saldría rojo
 * el día uno sobre datos correctos, que es la forma más rápida de que un invariante se apague.
 *
 * La lista es la frontera: mientras un grupo NO esté acá, un `pipelineKey` suyo es trabajo muerto
 * —el prompt se escribe y no lo usa nadie— y por eso INV15 también lo reporta. El día que se cablee
 * un segundo grupo al resolver, agregarlo acá es parte del cambio, no un trámite aparte.
 */
export const GRUPOS_RESUELTOS_POR_TIPO: readonly string[] = ["handoff"];

/**
 * ── LA VARIANTE POR TIPO DEL DETALLE DEL CRONOGRAMA: POR CONVENCIÓN DE ID ────
 * (X2, 2026-08-08.) El detalle del cronograma también quiere voz por tipo de proyecto, pero
 * NO puede usar el mecanismo del handoff, por dos trampas verificadas:
 *
 *  · Un `agentGroup` nuevo («cronograma-detalle») es la trampa de los 11 mapas que documenta
 *    la migración de `pipelineKey`: el agente escribiría en NINGÚN canvas y correría SIN
 *    celda de permiso (el switch del artifact-gate cae a null).
 *  · Resolver el grupo `cronograma` entero tampoco: tiene DOS agentes ACTIVE a propósito
 *    (Avance + Detalle, despachados por id), y meterlo en `GRUPOS_RESUELTOS_POR_TIPO` pondría
 *    INV15 en rojo sobre datos sanos.
 *
 * La salida: la variante se nombra por CONVENCIÓN DE ID — `agent-timeline-detail--<tipo>` —
 * con el MISMO `agentGroup: "cronograma"` (canvas y permisos intactos) y SIN `pipelineKey`
 * (el id ya lo dice; INV15 ni se entera). El swap vive en analyze: si la variante existe y
 * está ACTIVE, reemplaza al genérico; si no, el genérico corre como siempre — cero cambio
 * hasta que alguien SIEMBRE una variante (que hoy, a propósito, no se siembra: sin una
 * divergencia real de prompt sería trabajo muerto).
 */
export const DETALLE_CRONOGRAMA_ID = "agent-timeline-detail";

export function idDeVarianteDetalle(pipelineKey: ProjectPipelineKey | null): string | null {
  return pipelineKey ? `${DETALLE_CRONOGRAMA_ID}--${pipelineKey}` : null;
}

/** ¿Este id es el agente de detalle del cronograma (el base o una variante por tipo)? */
export function esAgenteDeDetalle(agentId: string): boolean {
  return agentId === DETALLE_CRONOGRAMA_ID || agentId.startsWith(`${DETALLE_CRONOGRAMA_ID}--`);
}

/** Lo mínimo que el resolver necesita de una fila de `Agent`. */
export interface AgenteCandidato {
  id: string;
  /** `Agent.pipelineKey`. `null` = sirve para todos los tipos. */
  pipelineKey: string | null;
}

/**
 * PURA. De los candidatos de UN grupo, cuál le toca a este tipo de proyecto.
 *
 * 1. El específico del tipo gana.
 * 2. Si no hay, gana el genérico (`pipelineKey: null`).
 * 3. Si no hay ninguno de los dos, `null` — quien llama decide qué hacer (hoy el GET del
 *    handoff devuelve `agentId: null` y la pantalla no ofrece generar).
 *
 * ⚠ Un `pipelineKey` que NO corresponde a este proyecto se IGNORA por completo: nunca se
 * devuelve por descarte. Sin esa regla, sembrar un agente de Sitios web haría que un proyecto
 * de un pipeline sin variante lo eligiera «porque era el único que quedaba».
 *
 * ⚠ El orden de `candidatos` NO importa. Es lo que hace que el resultado no dependa de lo que
 * devuelva Postgres, que es el accidente que este módulo repara.
 */
export function elegirAgente<T extends AgenteCandidato>(
  candidatos: readonly T[],
  pipelineKey: ProjectPipelineKey | null,
): T | null {
  if (pipelineKey) {
    const especifico = candidatos.find((a) => a.pipelineKey === pipelineKey);
    if (especifico) return especifico;
  }
  return candidatos.find((a) => a.pipelineKey === null) ?? null;
}

/**
 * El `pipelineKey` de un proyecto a partir de su `hubspotPipelineId` crudo.
 *
 * Devuelve `null` para pipeline vacío o no declarado — y eso hace que el proyecto reciba el
 * agente genérico, que es el comportamiento de hoy. Es la misma tolerancia que `resolvePipeline`
 * aplica en todo el repo: un pipeline que nadie declaró NUNCA cambia de comportamiento por
 * accidente.
 */
export function pipelineKeyDeProyecto(hubspotPipelineId: string | null): ProjectPipelineKey | null {
  return resolvePipeline(hubspotPipelineId)?.key ?? null;
}

/**
 * El `where` de Prisma para traer los candidatos de un grupo.
 *
 * ⚠ `status: "ACTIVE"` NO es opcional. `/analyze` filtra por ACTIVE cuando arma su propia lista
 * de candidatos (`agentCandidates`), así que un agente en DRAFT elegido acá produce el peor
 * desenlace posible: el botón dispara, el endpoint contesta **200** con `NO_AGENT_CONFIGURED` y
 * la pantalla no muestra ningún error. Falla en silencio.
 */
export const AGENTES_DEL_GRUPO = (agentGroup: string) =>
  ({ agentGroup, status: "ACTIVE" }) as const;
