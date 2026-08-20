/**
 * lib/canvas/assist-de-documento.ts — QUÉ DOCUMENTOS SE PUEDEN MODIFICAR CON IA.
 *
 * El registro vive acá y no en la ruta a propósito: así lo puede leer su guarda
 * (`assist-de-documento.test.ts`) y afirmar de verdad sobre él, en vez de escanear texto.
 * La ruta (`app/api/projects/[projectId]/canvas-assist/route.ts`) solo lo consume.
 */
import type { BcTemplateDef } from "@/components/landing/configs/templates.defs";
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import { KICKOFF_DEF_BY_KEY, KICKOFF_HANDOFF_KEYS, KICKOFF_TEMPLATE } from "@/components/landing/configs/kickoff.defs";
import { DESARROLLO_DEF_BY_KEY, DESARROLLO_HANDOFF_KEYS, DESARROLLO_TEMPLATE } from "@/components/landing/configs/desarrollo.defs";
import { DIAGNOSTICO_DEF_BY_KEY, DIAGNOSTICO_HANDOFF_KEYS, DIAGNOSTICO_TEMPLATE } from "@/components/landing/configs/diagnostico.defs";
import { PLANIFICACION_DEF_BY_KEY, PLANIFICACION_HANDOFF_KEYS, PLANIFICACION_TEMPLATE } from "@/components/landing/configs/planificacion.defs";
import { IMPLEMENTACION_DEF_BY_KEY, IMPLEMENTACION_TEMPLATE } from "@/components/landing/configs/implementacion.defs";
import { ENTREGA_DEF_BY_KEY, ENTREGA_HANDOFF_KEYS, ENTREGA_TEMPLATE } from "@/components/landing/configs/entrega.defs";

export interface DocConAssist {
  agentId: string;
  docLabel: string;
  defs: Record<string, BCSectionDef>;
  /** El template del CÓDIGO — de acá sale la VOZ (agentIntro + gate brandVoice).
   *  El `systemPrompt` del Agent en DB es una NOTA-PUNTERO (ver
   *  scripts/seed-kickoff-agent.ts), no sirve como prompt. */
  tpl: BcTemplateDef;
  /** Allowlist de secciones del handoff. `null` = el handoff ENTERO, y solo vale para
   *  documentos internos (`clientFacing: false` en el registro de piezas). */
  handoffKeys: readonly string[] | null;
  /** Solo el kickoff muestra el cronograma; los demás no lo necesitan en el prompt. */
  conCronograma?: true;
}

/**
 * Los documentos que aceptan assist, POR SLUG DE PIEZA.
 *
 * ⚠ Antes esto se indexaba por `canvas.name` — el rótulo visible. El registro de piezas
 * (`lib/pieces/registry.ts`) existe justamente para que la identidad de un documento sea su
 * `slug` y no su nombre: renombrar «Desarrollo» a «Requerimientos técnicos» (renombre ya
 * planeado) habría apagado su assist en silencio, sin error y sin test en rojo. Con 6 filas el
 * riesgo se multiplica, así que se paga antes de sumarlas.
 *
 * ⛔ EXPLORACIÓN NO ENTRA, y no es un olvido: aplicar una propuesta pasa por
 * `preserveNonSchemaKeys` (lib/ai/assist.ts), que es SHALLOW — solo conserva keys de PRIMER
 * NIVEL fuera del schema. Las marcas «ya la pregunté» del plan de sesiones viven anidadas en
 * `sesiones[].preguntas[].hecha`, así que una propuesta que toque `sesiones` las borraría TODAS
 * sin ningún aviso. Ver lib/canvas/exploracion-preguntas.ts.
 *
 * ⚠ LA AUDITORÍA QUE HAY QUE HACER ANTES DE SUMAR UNA FILA: si el schema de esa pieza guarda
 * ESTADO CURADO POR UNA PERSONA ANIDADO dentro de una key, no puede entrar hasta que el merge
 * sea profundo. Las cuatro que se sumaron el 2026-08-19 se auditaron: Diagnóstico, Planificación
 * y Entrega no tienen componentes de sección propios, y lo único fuera del schema —los KPIs
 * confirmados de Entrega— vive en el PRIMER nivel a propósito. Implementación tiene un
 * componente propio (los prompts de Breeze) pero solo escribe campos que su schema declara.
 */
export const DOC: Record<string, DocConAssist> = {
  kickoff: {
    agentId: "agent-kickoff-canvas",
    docLabel: "kickoff (landing de arranque de cara al cliente)",
    defs: KICKOFF_DEF_BY_KEY,
    tpl: KICKOFF_TEMPLATE,
    handoffKeys: KICKOFF_HANDOFF_KEYS,
    conCronograma: true,
  },
  "tech-requirements": {
    agentId: "agent-desarrollo-canvas",
    docLabel: "requerimiento técnico de integración",
    defs: DESARROLLO_DEF_BY_KEY,
    tpl: DESARROLLO_TEMPLATE,
    handoffKeys: DESARROLLO_HANDOFF_KEYS,
  },
  diagnosis: {
    agentId: "agent-diagnostico-canvas",
    docLabel: "diagnóstico de rendimiento (se presenta al cliente)",
    defs: DIAGNOSTICO_DEF_BY_KEY,
    tpl: DIAGNOSTICO_TEMPLATE,
    handoffKeys: DIAGNOSTICO_HANDOFF_KEYS,
  },
  planning: {
    agentId: "agent-planificacion-canvas",
    docLabel: "plan de trabajo (se proyecta frente al cliente)",
    defs: PLANIFICACION_DEF_BY_KEY,
    tpl: PLANIFICACION_TEMPLATE,
    handoffKeys: PLANIFICACION_HANDOFF_KEYS,
  },
  implementation: {
    agentId: "agent-implementacion-canvas",
    docLabel: "guía de construcción en HubSpot (interna del CSE)",
    defs: IMPLEMENTACION_DEF_BY_KEY,
    tpl: IMPLEMENTACION_TEMPLATE,
    /* ⚠ La ÚNICA sin allowlist, y es deliberado: la guía de implementación es interna
       (`clientFacing: false`) y su propia generación carga el handoff entero
       (lib/canvas/implementacion-generate.ts:55). El assist tiene que ver lo MISMO que la
       generación, o propone contra un contexto más pobre del que produjo el documento. */
    handoffKeys: null,
  },
  delivery: {
    agentId: "agent-entrega-canvas",
    docLabel: "documento de entrega (cierre de cara al cliente)",
    defs: ENTREGA_DEF_BY_KEY,
    tpl: ENTREGA_TEMPLATE,
    handoffKeys: ENTREGA_HANDOFF_KEYS,
  },
};

