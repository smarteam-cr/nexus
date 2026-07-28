/**
 * components/landing/configs/cronograma.defs.ts
 *
 * Defs server-safe del documento CRONOGRAMA. El lado client (mapa de componentes +
 * `landingConfigForCronograma`) vive en `cronograma.ts`.
 *
 * ── ES EL DOCUMENTO MÁS RARO DE LOS NUEVE, Y A PROPÓSITO ─────────────────────
 * Ninguna de sus dos secciones sale de un `CanvasBlock`. El Gantt se alimenta de
 * `ProjectTimeline` —fuente única, el canvas de Cronograma no tiene ni una `CanvasSection`—
 * y la portada la sintetiza el cargador desde el proyecto. Por eso no hay agente que las
 * escriba (`agentGenerated: false`), no hay schema, y su orden es FIJO: no hay nada que
 * arrastrar.
 *
 * Su editor es el Gantt del canvas (`CronogramaCanvas`), no este documento.
 */
import type { BCSectionDef } from "./business-case.defs";

/** Key de la portada. La usa el cargador para anteponer su fila sintética. */
export const CRONOGRAMA_PORTADA = "portada";

export const CRONOGRAMA_SECTION_DEFS: BCSectionDef[] = [
  {
    key: CRONOGRAMA_PORTADA,
    label: "Cronograma del proyecto",
    eyebrow: "Hoja de ruta",
    theme: "dark",
    backdrop: true,
    selfTitled: true,
    pinned: true,
    noHide: true,
    sectionType: "cronograma_hero",
    // No la escribe ningún agente: el título sale del rótulo de acá y los números del
    // cronograma. Lo único que aporta el cargador es el nombre del proyecto.
    agentGenerated: false,
    empty: { titulo: "", headline: "", subhead: "", tags: [], brands: [] },
    agentHint: "",
    brief: "Portada del documento. Fuente única: Project/Client — el agente NO la genera.",
    schema: {},
  },
  {
    key: "cronograma",
    label: "Cronograma del proyecto",
    eyebrow: "Hoja de ruta",
    theme: "light",
    selfTitled: true,
    ctxDriven: true,
    /* ⚠ Esto y el canal `cronograma` de `lib/print/ctx-rows.ts` tienen que decir LO MISMO.
       Si el cargador dijera "hay contenido" y esto "está vacío", el documento pasaría el 409
       y después no se pintaría nada: 200 con una hoja en blanco. Lo cruza ctx-rows.test.ts. */
    ctxEmpty: (ctx) => {
      const t = ctx.cronograma?.timeline;
      return !t?.exists || (t.phases?.length ?? 0) === 0;
    },
    sectionType: "cronograma_gantt",
    agentGenerated: false,
    empty: {},
    agentHint: "",
    brief: "Fuente única: ProjectTimeline vía readClientTimeline (el agente NO lo genera).",
    schema: {},
  },
];
