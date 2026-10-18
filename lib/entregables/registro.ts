/**
 * lib/entregables/registro.ts — LOS ENTREGABLES DEL PROYECTO Y SUS PLANTILLAS. PURO (lo importan la pantalla, el
 * servidor y el chat).
 *
 * Un entregable es una pieza del registro (`lib/pieces/registry.ts`) con `clase: "entregable"`: lo ve el cliente y se
 * genera con una PLANTILLA (decisión 11 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17). Acá vive, en UN solo
 * lugar, qué entregables hay, qué agente los escribe y qué plantillas tiene cada uno. Lo que dice cada plantilla (sus
 * secciones, su voz, su tope de tokens) son las defs del motor de landings (components/landing/configs/*.defs.ts): el
 * puente id → template vive en ./plantillas.ts, que importa esas defs y por eso no se carga en la pantalla.
 *
 * ⚠ Hoy cada entregable tiene UNA plantilla. El lugar para elegir otra ya está: `generarEntregable` recibe el id, el
 * chat lo puede pedir, /analyze lo acepta en el cuerpo (`plantilla`) y la plantilla que se usó queda guardada en el
 * documento (la entry `__plantilla` de `ProjectCanvas.sections`). Sumar una = una entrada en `plantillas` acá y su
 * template en ./plantillas.ts; la primera de la lista es la de siempre.
 *
 * El diagnóstico de hoy es la plantilla «Diagnóstico estratégico»: el DOCUMENTO se sigue llamando Diagnóstico, y sus
 * bloques no cambian (los diagnósticos y los kickoffs que ya existen no se tocan como datos: un documento sin
 * `__plantilla` se lee con la plantilla de siempre de su entregable).
 */
import { pieceBySlug } from "@/lib/pieces/registry";

export interface PlantillaDeEntregable {
  /** IDENTIDAD estable: es lo que queda guardado en el documento. Nunca cambia. */
  id: string;
  /** Nombre visible, en español. */
  nombre: string;
  /** Para qué sirve, en una frase (lo leen la pantalla y el chat). */
  paraQue: string;
}

export interface Entregable {
  /** El slug de su pieza en el registro. */
  slug: string;
  /** El agente que lo escribe (la fila de `Agent`, con su celda de permiso en el artifact-gate). */
  agentId: string;
  /** Sus plantillas; la primera es la de siempre. */
  plantillas: readonly PlantillaDeEntregable[];
}

export const ENTREGABLES: readonly Entregable[] = [
  {
    slug: "kickoff",
    agentId: "agent-kickoff-canvas",
    plantillas: [{ id: "kickoff", nombre: "Kickoff", paraQue: "La presentación de arranque: el alcance, el equipo, cómo se trabaja y lo que sigue." }],
  },
  {
    slug: "diagnosis",
    agentId: "agent-diagnostico-canvas",
    plantillas: [
      {
        id: "diagnostico-estrategico",
        nombre: "Diagnóstico estratégico",
        paraQue: "El problema del cliente, sus causas, a dónde quiere llegar y cómo se resuelve, con el hilo de síntomas, causas, objetivos y acciones.",
      },
    ],
  },
  {
    slug: "planning",
    agentId: "agent-planificacion-canvas",
    plantillas: [{ id: "planificacion", nombre: "Planificación", paraQue: "Lo que va a quedar configurado en HubSpot: procesos, propiedades, pipelines, automatizaciones y conversaciones." }],
  },
  {
    slug: "tech-requirements",
    agentId: "agent-desarrollo-canvas",
    plantillas: [{ id: "integraciones", nombre: "Integraciones", paraQue: "El requerimiento técnico de las integraciones: arquitectura, objetos y cómo se comunican." }],
  },
  {
    slug: "delivery",
    agentId: "agent-entrega-canvas",
    plantillas: [{ id: "entrega", nombre: "Entrega", paraQue: "El cierre: el desafío que se resolvió, los objetivos alcanzados y lo que queda funcionando." }],
  },
];

const POR_SLUG = new Map(ENTREGABLES.map((e) => [e.slug, e]));
const POR_AGENTE = new Map(ENTREGABLES.map((e) => [e.agentId, e]));

export function entregableDe(slug: string): Entregable | null {
  return POR_SLUG.get(slug) ?? null;
}

/** El entregable que escribe un agente; null si el agente no escribe un entregable. */
export function entregablePorAgente(agentId: string): Entregable | null {
  return POR_AGENTE.get(agentId) ?? null;
}

/** El nombre visible del entregable (el de su pieza: «Diagnóstico», no el de la plantilla). */
export function nombreDelEntregable(slug: string): string {
  return pieceBySlug(slug)?.label ?? slug;
}

/**
 * La plantilla pedida de un entregable. Sin id, la de siempre (la primera). Un id que no es de ESE entregable es null:
 * quien llama lo rechaza con su motivo, nunca cae a otra en silencio.
 */
export function plantillaDe(slug: string, id?: string | null): PlantillaDeEntregable | null {
  const e = POR_SLUG.get(slug);
  if (!e) return null;
  if (!id) return e.plantillas[0] ?? null;
  return e.plantillas.find((p) => p.id === id) ?? null;
}

// ── La plantilla que se usó, guardada en el documento ─────────────────────────────────────────────────────────────

/**
 * La entry reservada del Json `ProjectCanvas.sections` con la plantilla que se usó en la última generación (el mismo
 * contrato que `__doc` y `__cuestionarios`: el doble guion bajo dice «no soy una sección»). Sin columna nueva.
 */
export const CLAVE_DE_LA_PLANTILLA = "__plantilla";

export interface PlantillaGuardada {
  plantilla: PlantillaDeEntregable;
  /** false = el documento no la guardó (se generó antes del 2026-10-17, o nunca): es la de siempre. */
  guardada: boolean;
  at: string | null;
  por: string | null;
}

/** La plantilla con que se generó un documento. Sin la entry, o con un id que ya no existe, la de siempre. */
export function plantillaDelDocumento(slug: string, sections: unknown): PlantillaGuardada | null {
  const porDefecto = plantillaDe(slug);
  if (!porDefecto) return null;
  const e = (Array.isArray(sections) ? sections : []).find(
    (x): x is Record<string, unknown> => !!x && typeof x === "object" && (x as { key?: unknown }).key === CLAVE_DE_LA_PLANTILLA,
  );
  const guardada = e && typeof e.plantilla === "string" ? plantillaDe(slug, e.plantilla) : null;
  if (!guardada) return { plantilla: porDefecto, guardada: false, at: null, por: null };
  return {
    plantilla: guardada,
    guardada: true,
    at: typeof e?.at === "string" ? e.at : null,
    por: typeof e?.por === "string" ? e.por : null,
  };
}

/** El Json de secciones con la plantilla anotada. Toca SOLO la entry `__plantilla`; el resto queda como estaba. */
export function conPlantillaAnotada(sections: unknown, plantilla: PlantillaDeEntregable, por: string | null, ahora: string): Array<Record<string, unknown>> {
  const resto = (Array.isArray(sections) ? sections : []).filter(
    (x): x is Record<string, unknown> => !!x && typeof x === "object" && (x as { key?: unknown }).key !== CLAVE_DE_LA_PLANTILLA,
  );
  // `label` como toda entry del Json (lo exige `parseSectionEntries`, que la descarta sin él… y la UI no la lista).
  return [...resto, { key: CLAVE_DE_LA_PLANTILLA, label: CLAVE_DE_LA_PLANTILLA, plantilla: plantilla.id, nombre: plantilla.nombre, at: ahora, por }];
}

// ── Las instrucciones de quien pide la generación ─────────────────────────────────────────────────────────────────

/** El tope de las instrucciones de UN pedido (las del documento tienen el suyo, en lib/business-cases/section-briefs). */
export const TOPE_INSTRUCCIONES_DEL_PEDIDO = 2_000;

/**
 * Las instrucciones de quien pide ESTA generación (el chat de Nexus, o el botón si algún día las pide), rotuladas. ""
 * sin instrucciones: así el mensaje del agente queda byte a byte como antes. Van ADEMÁS de las instrucciones adicionales
 * del documento (su «Contexto adicional»), que siguen donde estaban, y no se guardan: valen para esta corrida.
 */
export function bloqueDeInstruccionesDelPedido(texto: string | null | undefined): string {
  const t = (texto ?? "").trim().slice(0, TOPE_INSTRUCCIONES_DEL_PEDIDO);
  if (!t) return "";
  return `=== LO QUE PIDIÓ QUIEN GENERA ESTE DOCUMENTO (para esta generación — cúmplelo sin inventar nada que las fuentes no respalden) ===\n${t}\n\n`;
}
