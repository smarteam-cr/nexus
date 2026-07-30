/**
 * lib/lifecycle/etapa-ui.ts — la ETAPA de un proyecto, lista para pintar. PURO y CLIENT-SAFE.
 *
 * Un proyecto tiene etapa por uno de dos caminos —el pipeline de HubSpot o el ciclo de 8
 * etapas de Nexus— y las pantallas no deberían saber cuál. Acá se normalizan a una sola
 * forma: rótulo, posición, la línea completa para el stepper, y si alguien la curó a mano.
 *
 * ── POR QUÉ VIVE ACÁ Y NO EN `lib/portfolio/load.ts` ─────────────────────────
 * Lo consume `ActiveProjectsSection`, que es un componente de CLIENTE. `load.ts` importa
 * Prisma, así que un import de VALOR desde ahí arrastra el driver de Postgres al bundle del
 * navegador y el build se cae con "Can't resolve 'dns'" — pasó al escribir esto. Un
 * `import type` se borra en compilación y por eso el tipo `ProjectLifecycle` sí se puede
 * traer de `./load`; una función, no.
 *
 * Misma disciplina que `lib/projects/kind.ts`: lo que pinta la UI no puede colgar de Prisma.
 */
import type { ProjectLifecycle } from "./load";
import { FULL_CYCLE_ORDER, SHORT_CYCLE_ORDER, STAGE_LABEL_ES } from "./stage-engine";

export interface EtapaParaLaUI {
  /** Identificador de la etapa: slug de Nexus o id de etapa de HubSpot. */
  id: string;
  label: string;
  /** `null` si la etapa está FUERA de la línea de avance (Cancelado, Bloqueado). */
  posicion: { index: number; total: number } | null;
  /** La línea completa, para el stepper del tooltip. */
  linea: Array<{ id: string; label: string }>;
  /** Título del stepper ("Etapas de Development", "Ciclo de implementación"). */
  tituloDeLaLinea: string;
  /** Solo la rama de Customer Success la cura a mano; la de HubSpot nunca. */
  curada: boolean;
  curadaPorque: string | null;
  /** Por qué está donde está. Vacío en la rama de pipeline: no hay inferencia que explicar. */
  razones: string[];
}

/**
 * `null` cuando no hay etapa que mostrar. Hoy pasa en un solo caso: un proyecto del ciclo de
 * Customer Success sin handoff generado — ahí la pantalla muestra el aviso "Handoff sin
 * generar" en vez de una etapa inventada.
 */
export function etapaParaLaUI(lc: ProjectLifecycle | null): EtapaParaLaUI | null {
  if (!lc) return null;
  if (lc.fuente === "pipeline") {
    return {
      id: lc.stageId ?? "",
      label: lc.label,
      posicion: lc.position,
      linea: lc.linea.map((s) => ({ id: s.id, label: s.label })),
      tituloDeLaLinea: `Etapas de ${lc.pipeline.label}`,
      curada: false,
      curadaPorque: null,
      razones: [],
    };
  }
  if (!lc.defined) return null;
  const orden = lc.cycle === "short" ? SHORT_CYCLE_ORDER : FULL_CYCLE_ORDER;
  return {
    id: lc.effective,
    label: lc.label,
    posicion: lc.position,
    linea: orden.map((s) => ({ id: s, label: STAGE_LABEL_ES[s] })),
    tituloDeLaLinea: `Ciclo ${lc.cycle === "short" ? "corto (continuidad)" : "de implementación"}`,
    curada: lc.source === "override",
    curadaPorque: lc.override?.reason ?? null,
    razones: lc.reasons,
  };
}
